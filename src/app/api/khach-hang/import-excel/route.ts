import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getKhachHang, addKhachHang, addKhachHangWithBatch } from '@/lib/data-access';
import type { KhachHang } from '@/lib/types';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { classifyRow, detectDuplicateNameWarnings, findImportSheet, phoneKey } from '@/lib/khach-hang-excel-import';
import { isPostgresEnabled } from '@/lib/db/feature-flags';
import { createImportBatch, updateImportBatchCounts } from '@/lib/crm-funnel/import-batch';

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
  invalidList: { row: number; reason: string }[];
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

    // Không giả định sheet đầu tiên trong workbook luôn chứa dữ liệu (VD file có
    // sheet rỗng/ẩn đứng trước sheet dữ liệu thật) — quét mọi sheet theo thứ tự,
    // tìm dòng header hợp lệ (có cột Tên KH + ít nhất 1 cột SĐT), cho phép dòng
    // trống/tiêu đề nằm trước header thật. Xem findImportSheet.
    const sheets = wb.SheetNames.map(sheetName => ({
      sheetName,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][],
    }));
    const resolved = findImportSheet(sheets);
    if (!resolved) {
      return NextResponse.json({
        success: false,
        error: `File không có dữ liệu phù hợp để import: không tìm thấy sheet nào có cột "Tên"/"Tên KH" và cột "SĐT"/"Số điện thoại" ở dòng tiêu đề (đã quét ${sheets.length} sheet: ${wb.SheetNames.join(', ') || '(không có sheet)'}). Đặt tên cột theo mẫu: Tên/Tên KH/Tên khách hàng/Họ tên/Tên NK, SĐT/Số điện thoại/Điện thoại/Phone (có thể đánh số 1, 2...), Email (tuỳ chọn).`,
      }, { status: 422 });
    }

    // Cột được xác định qua HEADER thực tế của file, không theo vị trí cố định —
    // tránh map nhầm khi file nguồn có layout khác export của phễu lead nội bộ.
    // Hỗ trợ nhiều cột phone (VD "Số điện thoại 1"/"2") — xem resolveRowPhone.
    const { columns, rows, headerRowIndex } = resolved;
    const dataRows = rows.slice(headerRowIndex + 1);
    if (dataRows.length === 0) {
      return NextResponse.json({ success: false, error: 'File không có dòng dữ liệu' }, { status: 422 });
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
      ? (await createImportBatch({ filename: file.name || 'import.xlsx', importedBy: user! })).id
      : null;

    const importedList: string[] = [];
    const readyRecords: { ten_KH: string; so_dien_thoai: string }[] = [];
    const duplicateInFileList: { ten_KH: string; so_dien_thoai: string }[] = [];
    const alreadyExistsList: { ten_KH: string; so_dien_thoai: string }[] = [];
    const invalidList: { row: number; reason: string }[] = [];
    const errorList: { ten_KH: string; error: string }[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const classification = classifyRow(dataRows[i], columns, existingDbPhoneKeys, seenInFilePhoneKeys);
      if (classification.status === 'blank') continue;
      if (classification.status === 'invalid') {
        invalidList.push({ row: headerRowIndex + i + 2, reason: classification.reason }); // +2: bù dòng header (0-based) + 1-based
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
        await new Promise(r => setTimeout(r, 150)); // rate-limit buffer
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errorList.push({ ten_KH: classification.ten_KH, error: msg });
      }
    }

    // Cảnh báo trùng tên (khác SĐT) — chỉ để cảnh báo, KHÔNG merge/xóa customer nào.
    const duplicateNameWarnings = detectDuplicateNameWarnings(readyRecords);

    // Ghi số liệu tổng kết cuối cùng lên batch record. Đây CHỈ là bookkeeping mô
    // tả — provenance của từng customer đã được đảm bảo atomic ở bước tạo phía
    // trên, không phụ thuộc vào bước này. Lỗi ở đây không ảnh hưởng tính đúng
    // đắn của dữ liệu đã tạo, nên không cần fail cả request vì nó.
    if (pgCrmEnabled && batchId) {
      try {
        await updateImportBatchCounts(batchId, {
          totalRows: dataRows.length,
          createdCount: importedList.length,
          duplicateCount: duplicateInFileList.length + alreadyExistsList.length,
          invalidCount: invalidList.length,
        });
      } catch (e) {
        console.error('[Import Excel] batch summary count update failed (customer provenance vẫn đúng):', e);
      }
    }

    return NextResponse.json({
      success: true,
      totalRows:        dataRows.length,
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
