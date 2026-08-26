import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getKhachHang, addKhachHang, addKhachHangWithBatch } from '@/lib/data-access';
import type { KhachHang } from '@/lib/types';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { classifyRow, detectDuplicateNameWarnings, findImportSheets, phoneKey, type ExcelColumnMap } from '@/lib/khach-hang-excel-import';
import { isPostgresEnabled } from '@/lib/db/feature-flags';
import { checkpointImportBatchCounts, completeImportBatch, createImportBatch } from '@/lib/crm-funnel/import-batch';

// Headroom cho file thật nhiều dòng (VD "446 Manhattan-VHGP.xlsx": 444 dòng)
// để CÓ CƠ HỘI chạy xong trong 1 request và được đánh dấu 'completed' sớm —
// KHÔNG phải cơ chế đảm bảo tính đúng đắn: nếu vẫn bị ngắt (vượt cả giá trị
// này, crash, deploy...), checkpointImportBatchCounts() bên dưới đã đảm bảo
// Lịch sử Import không bao giờ kẹt ở số liệu sai/0 — xem CHECKPOINT_INTERVAL_ROWS.
export const maxDuration = 60;

// Ghi số liệu tiến độ định kỳ mỗi N dòng (không phải mỗi dòng — tránh nhân
// đôi số lần ghi DB so với việc tạo customer). Đủ nhỏ để một request bị ngắt
// giữa chừng vẫn để lại số liệu gần với thực tế, đủ lớn để không tạo thêm
// tải DB đáng kể trên file vài nghìn dòng (VD 2000 dòng / 25 = 80 lần ghi).
const CHECKPOINT_INTERVAL_ROWS = 25;

export interface ImportResult {
  success: boolean;
  totalRows: number;
  imported: number;
  duplicateInFile: number;
  alreadyExists: number;
  invalid: number;
  errors: number;
  importedList: string[];
  duplicateInFileList: { ten_KH: string; so_dien_thoai: string }[];
  alreadyExistsList: { ten_KH: string; so_dien_thoai: string }[];
  invalidList: { row: number; reason: string; sheet: string }[];
  errorList: { ten_KH: string; error: string }[];
  duplicateNameWarnings: string[];
  /** null nếu Postgres CRM chưa bật (không có batch tracking) */
  batchId: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCrmSessionUser();
  if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Không có quyền import khách hàng' }, { status: 403 });
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ success: false, error: 'Không đọc được form data: ' + msg }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'Thiếu file Excel' }, { status: 400 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ success: false, error: 'Không đọc được file: ' + msg }, { status: 400 });
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { success: false, error: 'File không phải định dạng Excel hợp lệ (.xlsx/.xls): ' + msg },
        { status: 422 }
      );
    }

    // Không giả định chỉ 1 sheet (hay chỉ sheet đầu tiên) trong workbook chứa
    // dữ liệu thật — quét MỌI sheet theo thứ tự, mỗi sheet tìm dòng header hợp
    // lệ riêng (có cột Tên KH + cột SĐT CÙNG 1 dòng), cho phép dòng trống/tiêu
    // đề nằm trước header thật. TẤT CẢ sheet hợp lệ đều được xử lý (VD file dự
    // án BĐS thật có cả CONDOTEL lẫn VILLAS là 2 dataset khách hàng riêng biệt,
    // xen giữa sheet mẫu/form MẪU không phải dataset) — xem findImportSheets.
    const sheets = wb.SheetNames.map(sheetName => ({
      sheetName,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][],
    }));
    const resolvedSheets = findImportSheets(sheets);
    if (resolvedSheets.length === 0) {
      return NextResponse.json({
        success: false,
        error: `File không có dữ liệu phù hợp để import: không tìm thấy sheet nào có cột "Tên"/"Tên KH" và cột "SĐT"/"Số điện thoại" CÙNG một dòng tiêu đề (đã quét ${sheets.length} sheet: ${wb.SheetNames.join(', ') || '(không có sheet)'}). Đặt tên cột theo mẫu: Tên/Tên KH/Tên khách hàng/Họ tên/Tên NK, SĐT/Số điện thoại/Điện thoại/Phone (có thể đánh số 1, 2...), Email (tuỳ chọn).`,
      }, { status: 422 });
    }

    // Gộp dữ liệu của TẤT CẢ sheet hợp lệ thành 1 danh sách dòng xử lý duy
    // nhất, theo đúng thứ tự sheet trong workbook — để dedupe/checkpoint/tổng
    // số liệu là WORKBOOK-WIDE (không reset khi chuyển sheet), đúng theo cách
    // 1 lần import xử lý toàn bộ workbook như 1 operation duy nhất. Mỗi dòng
    // giữ lại columns/sheetName/excelRow riêng để phân loại và báo lỗi đúng
    // ngữ cảnh sheet nguồn của nó.
    interface WorkRow { sheetName: string; columns: ExcelColumnMap; row: readonly unknown[]; excelRow: number }
    const workRows: WorkRow[] = [];
    for (const sheet of resolvedSheets) {
      const sheetDataRows = sheet.rows.slice(sheet.headerRowIndex + 1);
      sheetDataRows.forEach((row, i) => {
        workRows.push({ sheetName: sheet.sheetName, columns: sheet.columns, row, excelRow: sheet.headerRowIndex + i + 2 });
      });
    }
    if (workRows.length === 0) {
      return NextResponse.json({ success: false, error: 'File không có dòng dữ liệu ở các sheet hợp lệ' }, { status: 422 });
    }

    // Snapshot phone đã có sẵn trong CRM trước khi import — canonical last-9-digit,
    // đồng nhất với dedupe của /api/khach-hang (manual create/update). Set này KHÔNG
    // đổi trong lúc chạy — dùng riêng để phân biệt "already_exists" (DB) khỏi
    // "duplicate_in_file" (trùng trong cùng file, xem seenInFilePhoneKeys bên dưới).
    const existing = await getKhachHang();
    const existingDbPhoneKeys = new Set(existing.map(kh => phoneKey(kh.so_dien_thoai)));
    const seenInFilePhoneKeys = new Set<string>();

    // Import Batch: PG-CRM-only, giống mọi tính năng Qualified Lead Funnel khác.
    // Batch record được tạo TRƯỚC khi xử lý dòng nào — nếu tạo thất bại, dừng
    // toàn bộ import ngay tại đây (chưa có customer nào được tạo, nên không có
    // gì bị "swallow"). Provenance của từng customer sau đó được ghi ATOMIC tại
    // thời điểm tạo (addKhachHangWithBatch), không phải một bước update sau.
    const pgCrmEnabled = isPostgresEnabled('crm');
    const batchId: string | null = pgCrmEnabled
      ? (await createImportBatch({ filename: file.name || 'import.xlsx', importedBy: user!, totalRows: workRows.length })).id
      : null;

    const importedList: string[] = [];
    const readyRecords: { ten_KH: string; so_dien_thoai: string }[] = [];
    const duplicateInFileList: { ten_KH: string; so_dien_thoai: string }[] = [];
    const alreadyExistsList: { ten_KH: string; so_dien_thoai: string }[] = [];
    const invalidList: { row: number; reason: string; sheet: string }[] = [];
    const errorList: { ten_KH: string; error: string }[] = [];

    for (let i = 0; i < workRows.length; i++) {
      // Checkpoint ở ĐẦU mỗi vòng lặp (trước mọi "continue" bên dưới) để không
      // bao giờ bị bỏ lỡ bất kể dòng trước đó là blank/invalid/duplicate/ready —
      // đảm bảo chu kỳ checkpoint thực sự đều đặn mỗi CHECKPOINT_INTERVAL_ROWS
      // dòng dữ liệu WORKBOOK-WIDE (không reset khi chuyển sheet), không phụ
      // thuộc tỉ lệ phân loại của file.
      if (pgCrmEnabled && batchId && i > 0 && i % CHECKPOINT_INTERVAL_ROWS === 0) {
        try {
          await checkpointImportBatchCounts(batchId, {
            createdCount: importedList.length,
            duplicateCount: duplicateInFileList.length + alreadyExistsList.length,
            invalidCount: invalidList.length,
          });
        } catch (e) {
          console.error('[Import Excel] checkpoint update failed (customer provenance vẫn đúng):', e);
        }
      }

      const { sheetName, columns, row, excelRow } = workRows[i];
      const classification = classifyRow(row, columns, existingDbPhoneKeys, seenInFilePhoneKeys);
      if (classification.status === 'blank') continue;
      if (classification.status === 'invalid') {
        invalidList.push({ row: excelRow, reason: classification.reason, sheet: sheetName });
        continue;
      }
      if (classification.status === 'already_exists') {
        alreadyExistsList.push({ ten_KH: classification.ten_KH, so_dien_thoai: classification.so_dien_thoai });
        continue;
      }
      if (classification.status === 'duplicate_in_file') {
        duplicateInFileList.push({ ten_KH: classification.ten_KH, so_dien_thoai: classification.so_dien_thoai });
        continue;
      }

      // Import Excel CHỈ ghi tên/SĐT/email — các field CRM khác giữ default
      // theo contract hiện tại, không suy diễn từ bất kỳ cột nào khác trong file.
      const kh: KhachHang = {
        id_khach_hang: `KH_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        ngay_tao: new Date().toISOString(),
        ten_KH: classification.ten_KH,
        so_dien_thoai: classification.so_dien_thoai,
        email: classification.email,
        nguon: '',
        nhu_cau: '',
        ghi_chu: '',
        sale_phu_trach: '',
        label_khach: `${classification.ten_KH} - ${classification.so_dien_thoai}`,
      };

      try {
        // pgCrmEnabled -> provenance ghi ATOMIC cùng lúc tạo (không fallback GS,
        // lỗi sẽ ném ra và rơi vào catch bên dưới thành per-row error — không có
        // đường nào để customer "lọt" vào GS mà vẫn được báo là batch-tracked).
        if (pgCrmEnabled) await addKhachHangWithBatch(kh, batchId!);
        else await addKhachHang(kh);
        seenInFilePhoneKeys.add(phoneKey(classification.so_dien_thoai)); // prevent intra-file duplicate
        importedList.push(classification.ten_KH);
        readyRecords.push({ ten_KH: classification.ten_KH, so_dien_thoai: classification.so_dien_thoai });
        // Rate-limit buffer chỉ cần cho nhánh ghi thẳng Google Sheets (giới hạn
        // ~60 request/phút/user của Sheets API) — nhánh Postgres không gọi Sheets
        // nên không có rate limit này. Giữ sleep cho nhánh GS đúng như trước;
        // bỏ hoàn toàn cho nhánh PG — đây là phần lớn thời gian chạy của cả vòng
        // lặp trên file thật nhiều dòng (VD 444 dòng × 150ms = 66s, dễ vượt
        // execution timeout và làm updateImportBatchCounts() phía dưới không
        // bao giờ chạy tới dù customer đã được tạo đúng).
        if (!pgCrmEnabled) await new Promise(r => setTimeout(r, 150));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errorList.push({ ten_KH: classification.ten_KH, error: msg });
      }
    }

    // Cảnh báo trùng tên (khác SĐT) — chỉ để cảnh báo, KHÔNG merge/xóa customer nào.
    const duplicateNameWarnings = detectDuplicateNameWarnings(readyRecords);

    // Đánh dấu batch HOÀN TẤT: ghi số liệu cuối cùng chính xác + chuyển status
    // sang 'completed' — CHỈ chạy được tới đây nếu vòng lặp xử lý dòng đã xong
    // toàn bộ. Đây CHỈ là bookkeeping mô tả (hiển thị trong Lịch sử Import) —
    // provenance của từng customer đã được đảm bảo atomic ở bước tạo phía
    // trên, không phụ thuộc vào bước này. Nếu lệnh này lỗi, batch giữ nguyên
    // status 'processing' (không bao giờ báo nhầm "đã hoàn tất") — không cần
    // fail cả request vì nó, dữ liệu customer/provenance vẫn đúng.
    if (pgCrmEnabled && batchId) {
      try {
        await completeImportBatch(batchId, {
          createdCount: importedList.length,
          duplicateCount: duplicateInFileList.length + alreadyExistsList.length,
          invalidCount: invalidList.length,
        });
      } catch (e) {
        console.error('[Import Excel] batch completion update failed (customer provenance vẫn đúng, batch có thể vẫn hiện "processing"):', e);
      }
    }

    return NextResponse.json({
      success: true,
      totalRows:        workRows.length,
      imported:          importedList.length,
      duplicateInFile:   duplicateInFileList.length,
      alreadyExists:     alreadyExistsList.length,
      invalid:           invalidList.length,
      errors:            errorList.length,
      importedList,
      duplicateInFileList,
      alreadyExistsList,
      invalidList,
      errorList,
      duplicateNameWarnings,
      batchId,
    } satisfies ImportResult);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[API khach-hang/import-excel] Unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi server: ' + msg }, { status: 500 });
  }
}
