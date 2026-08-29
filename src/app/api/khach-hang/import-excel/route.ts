import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getKhachHang, addKhachHang, addKhachHangWithBatch, addKhachHangBatchWithImportBatch } from '@/lib/data-access';
import type { KhachHang } from '@/lib/types';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { classifyRow, detectDuplicateNameWarnings, findImportSheets, phoneKey, type ExcelColumnMap } from '@/lib/khach-hang-excel-import';
import { isPostgresEnabled } from '@/lib/db/feature-flags';
import { checkpointImportBatchCounts, completeImportBatch, createImportBatch } from '@/lib/crm-funnel/import-batch';
import { createDataset, ensureCustomerDatasetMemberships, getDataset } from '@/lib/crm-funnel/dataset';

// Headroom cho file thật nhiều dòng (VD "446 Manhattan-VHGP.xlsx": 444 dòng,
// "DATA MKT VIN HẠ LONG XANH.xlsx": 3387 dòng) để CÓ CƠ HỘI chạy xong trong 1
// request và được đánh dấu 'completed' sớm — KHÔNG phải cơ chế đảm bảo tính
// đúng đắn: nếu vẫn bị ngắt (vượt cả giá trị này, crash, deploy...),
// checkpointImportBatchCounts() bên dưới đã đảm bảo Lịch sử Import không bao
// giờ kẹt ở số liệu sai/0 — xem CHECKPOINT_INTERVAL_ROWS. Nhánh Postgres ghi
// theo BATCH (xem PG_INSERT_CHUNK_SIZE) để thực sự chạy xong trong ngân sách
// này trên file vài nghìn dòng — N insert tuần tự (1 round-trip DB/dòng) là
// nguyên nhân thật gây timeout trên file lớn, khiến serverless function bị
// kill giữa chừng và client chỉ nhận được lỗi kết nối thô (không phải lỗi
// validation/parsing — parser đã xử lý đúng toàn bộ dữ liệu từ bước trước).
export const maxDuration = 60;

// Ghi số liệu tiến độ định kỳ mỗi N dòng (không phải mỗi dòng — tránh nhân
// đôi số lần ghi DB so với việc tạo customer). Đủ nhỏ để một request bị ngắt
// giữa chừng vẫn để lại số liệu gần với thực tế, đủ lớn để không tạo thêm
// tải DB đáng kể trên file vài nghìn dòng (VD 2000 dòng / 25 = 80 lần ghi).
const CHECKPOINT_INTERVAL_ROWS = 25;

// Nhánh Postgres: gộp N dòng "ready" thành 1 lệnh createMany() thay vì N
// round-trip tuần tự — đây là fix thật cho timeout trên file lớn. 200 đủ nhỏ
// để 1 lỗi bulk-insert (hiếm, VD DB blip giữa chừng) chỉ cần fallback per-row
// cho tối đa 200 dòng thay vì cả file, đủ lớn để giảm số round-trip đáng kể
// trên file nghìn dòng (3387 dòng / 200 ≈ 17 lần ghi thay vì 3387 lần).
const PG_INSERT_CHUNK_SIZE = 200;

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
  /** null nếu Postgres CRM chưa bật — Dataset là PG-CRM-only, giống batchId. */
  datasetId: string | null;
  datasetName: string | null;
  /** Số Customer (mới tạo + đã tồn tại từ trước) vừa được ghi nhận thuộc Dataset này trong lần import này. */
  datasetMembershipCount: number;
  /** Set khi ensureCustomerDatasetMemberships lỗi — import Customer vẫn thành công, chỉ provenance Dataset của lần này chưa ghi đủ (không fail cả request vì đây). */
  datasetMembershipWarning?: string;
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
    // CUSTOMER DATASET — tra cứu id_khach_hang từ phoneKey cho nhánh
    // "already_exists" bên dưới, để ghi CustomerDatasetMembership cho Customer
    // đã tồn tại (không chỉ Customer mới tạo) — xem existingCustomerIdsForDataset.
    const phoneKeyToCustomerId = new Map(existing.map(kh => [phoneKey(kh.so_dien_thoai), kh.id_khach_hang]));
    const seenInFilePhoneKeys = new Set<string>();

    // Import Batch: PG-CRM-only, giống mọi tính năng Qualified Lead Funnel khác.
    // Batch record được tạo TRƯỚC khi xử lý dòng nào — nếu tạo thất bại, dừng
    // toàn bộ import ngay tại đây (chưa có customer nào được tạo, nên không có
    // gì bị "swallow"). Provenance của từng customer sau đó được ghi ATOMIC tại
    // thời điểm tạo (addKhachHangWithBatch), không phải một bước update sau.
    const pgCrmEnabled = isPostgresEnabled('crm');

    // CUSTOMER DATASET — bắt buộc chọn Dataset có sẵn (dataset_id) hoặc tạo mới
    // (new_dataset_name) TRƯỚC khi import, khi Postgres CRM đang bật (Dataset
    // là PG-CRM-only, giống batchId). KHÔNG tự suy diễn/mặc định ngầm Dataset
    // từ tên file hay bất kỳ nguồn nào khác — Admin phải tự chọn/đặt tên.
    let resolvedDatasetId: string | null = null;
    let resolvedDatasetName: string | null = null;
    if (!pgCrmEnabled) {
      // Google Sheets fallback: Dataset là PG-CRM-only, giữ null giống batchId.
    } else {
      const datasetIdInput = ((formData.get('dataset_id') as string | null) ?? '').trim();
      const newDatasetName = ((formData.get('new_dataset_name') as string | null) ?? '').trim();
      if (datasetIdInput) {
        const found = await getDataset(datasetIdInput);
        if (!found) {
          return NextResponse.json({ success: false, error: 'Dataset đã chọn không còn tồn tại' }, { status: 400 });
        }
        resolvedDatasetId = found.id;
        resolvedDatasetName = found.name;
      } else if (newDatasetName) {
        const created = await createDataset({ name: newDatasetName, actor: user! });
        resolvedDatasetId = created.id;
        resolvedDatasetName = created.name;
      } else {
        return NextResponse.json({ success: false, error: 'Vui lòng chọn hoặc tạo Dataset trước khi import' }, { status: 400 });
      }
    }

    const batchId: string | null = pgCrmEnabled
      ? (await createImportBatch({ filename: file.name || 'import.xlsx', importedBy: user!, totalRows: workRows.length, datasetId: resolvedDatasetId ?? undefined })).id
      : null;

    const importedList: string[] = [];
    const readyRecords: { ten_KH: string; so_dien_thoai: string; id_khach_hang: string }[] = [];
    const duplicateInFileList: { ten_KH: string; so_dien_thoai: string }[] = [];
    const alreadyExistsList: { ten_KH: string; so_dien_thoai: string }[] = [];
    const invalidList: { row: number; reason: string; sheet: string }[] = [];
    const errorList: { ten_KH: string; error: string }[] = [];
    // CUSTOMER DATASET — Customer ĐÃ TỒN TẠI (không phải customer mới của batch
    // này) nhưng vẫn cần CustomerDatasetMembership riêng cho Dataset đang chọn.
    const existingCustomerIdsForDataset = new Set<string>();

    // Nhánh Postgres: gom các dòng 'ready' vào đây, ghi thật theo chunk (xem
    // flushPgChunk) thay vì 1 round-trip DB/dòng — đây là fix cho timeout
    // thật trên file lớn (xem comment PG_INSERT_CHUNK_SIZE). Nhánh Google
    // Sheets (pgCrmEnabled=false) KHÔNG dùng buffer này, giữ nguyên hành vi
    // per-row + sleep cũ (rate-limit Sheets API, không đổi ở đây).
    const pgPending: { kh: KhachHang; ten_KH: string; so_dien_thoai: string }[] = [];

    async function flushPgChunk() {
      if (pgPending.length === 0) return;
      const batch = pgPending.splice(0, pgPending.length);
      try {
        await addKhachHangBatchWithImportBatch(batch.map(p => p.kh), batchId!);
        for (const p of batch) {
          importedList.push(p.ten_KH);
          readyRecords.push({ ten_KH: p.ten_KH, so_dien_thoai: p.so_dien_thoai, id_khach_hang: p.kh.id_khach_hang });
        }
      } catch {
        // Bulk insert lỗi (hiếm — VD DB blip giữa chừng) -> fallback per-row để
        // cô lập ĐÚNG dòng lỗi, không fail cả chunk vì 1 dòng (giữ đúng yêu cầu
        // "1 dòng lỗi không làm fail toàn bộ import" ở cấp độ chunk).
        for (const p of batch) {
          try {
            await addKhachHangWithBatch(p.kh, batchId!);
            importedList.push(p.ten_KH);
            readyRecords.push({ ten_KH: p.ten_KH, so_dien_thoai: p.so_dien_thoai, id_khach_hang: p.kh.id_khach_hang });
          } catch (rowError: unknown) {
            const msg = rowError instanceof Error ? rowError.message : String(rowError);
            errorList.push({ ten_KH: p.ten_KH, error: msg });
          }
        }
      }
    }

    for (let i = 0; i < workRows.length; i++) {
      // Checkpoint ở ĐẦU mỗi vòng lặp (trước mọi "continue" bên dưới) để không
      // bao giờ bị bỏ lỡ bất kể dòng trước đó là blank/invalid/duplicate/ready —
      // đảm bảo chu kỳ checkpoint thực sự đều đặn mỗi CHECKPOINT_INTERVAL_ROWS
      // dòng dữ liệu WORKBOOK-WIDE (không reset khi chuyển sheet), không phụ
      // thuộc tỉ lệ phân loại của file. importedList/errorList có thể trễ vài
      // dòng nếu chunk hiện tại chưa flush — đúng tinh thần "gần đúng" đã ghi
      // ở CHECKPOINT_INTERVAL_ROWS, tự cập nhật đúng khi chunk flush/kết thúc.
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
        if (pgCrmEnabled && resolvedDatasetId) {
          const existingId = phoneKeyToCustomerId.get(phoneKey(classification.so_dien_thoai));
          if (existingId) existingCustomerIdsForDataset.add(existingId);
        }
        continue;
      }
      if (classification.status === 'duplicate_in_file') {
        duplicateInFileList.push({ ten_KH: classification.ten_KH, so_dien_thoai: classification.so_dien_thoai });
        continue;
      }

      // Đánh dấu "đã thấy trong file" NGAY khi phân loại 'ready' (không đợi ghi
      // DB xong) — bắt buộc để dedupe đúng trong 1 chunk chưa flush: 2 dòng
      // trùng SĐT nằm cùng 1 chunk (chưa kịp ghi DB) vẫn phải nhận diện đúng
      // dòng thứ 2 là duplicate_in_file, không phải chờ dòng đầu "ghi xong".
      seenInFilePhoneKeys.add(phoneKey(classification.so_dien_thoai));

      // Import Excel CHỈ ghi tên/SĐT/email — các field CRM khác giữ default
      // theo contract hiện tại, không suy diễn từ bất kỳ cột nào khác trong file.
      //
      // ID có "i" (index dòng, tăng dần tuyệt đối trong request) thay vì chỉ
      // dựa vào Date.now()+random — bắt buộc từ khi chuyển sang ghi theo chunk
      // (PG_INSERT_CHUNK_SIZE): ID cho CẢ CHUNK giờ được sinh trong 1 vòng lặp
      // đồng bộ (không còn await giữa các dòng như code cũ), nên Date.now() có
      // thể ĐỨNG YÊN qua hàng chục dòng liên tiếp — random-10000 một mình
      // không đủ chống trùng (createMany skipDuplicates sẽ ÂM THẦM bỏ dòng
      // trùng id mà route vẫn đếm là "đã import"). "i" duy nhất tuyệt đối
      // trong 1 request loại bỏ hoàn toàn rủi ro này.
      const kh: KhachHang = {
        id_khach_hang: `KH_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`,
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

      if (pgCrmEnabled) {
        // pgCrmEnabled -> provenance ghi ATOMIC cùng lúc tạo (không fallback GS,
        // xem addKhachHangBatchWithImportBatch/addKhachHangWithBatch) — gom vào
        // buffer, ghi thật theo chunk qua flushPgChunk(), không phải ngay đây.
        pgPending.push({ kh, ten_KH: classification.ten_KH, so_dien_thoai: classification.so_dien_thoai });
        if (pgPending.length >= PG_INSERT_CHUNK_SIZE) await flushPgChunk();
      } else {
        try {
          await addKhachHang(kh);
          importedList.push(classification.ten_KH);
          readyRecords.push({ ten_KH: classification.ten_KH, so_dien_thoai: classification.so_dien_thoai, id_khach_hang: kh.id_khach_hang });
          // Rate-limit buffer cho nhánh ghi thẳng Google Sheets (giới hạn ~60
          // request/phút/user của Sheets API) — không đổi so với trước.
          await new Promise(r => setTimeout(r, 150));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errorList.push({ ten_KH: classification.ten_KH, error: msg });
        }
      }
    }
    await flushPgChunk(); // chunk cuối chưa đủ PG_INSERT_CHUNK_SIZE dòng

    // Cảnh báo trùng tên (khác SĐT) — chỉ để cảnh báo, KHÔNG merge/xóa customer nào.
    const duplicateNameWarnings = detectDuplicateNameWarnings(readyRecords);

    // CUSTOMER DATASET — ghi nhận MỌI Customer chạm tới trong lần import này
    // (mới tạo qua readyRecords + đã tồn tại từ trước qua
    // existingCustomerIdsForDataset) vào Dataset đã chọn. Idempotent (xem
    // ensureCustomerDatasetMemberships) — không tạo dòng trùng nếu Customer đã
    // thuộc Dataset từ trước (VD re-import cùng file). KHÔNG fail cả request
    // nếu bước này lỗi — Customer đã import thành công, chỉ provenance Dataset
    // của riêng lần này chưa ghi đủ (báo qua datasetMembershipWarning).
    let datasetMembershipCount = 0;
    let datasetMembershipWarning: string | undefined;
    if (pgCrmEnabled && resolvedDatasetId) {
      const membershipCustomerIds = [...readyRecords.map(r => r.id_khach_hang), ...existingCustomerIdsForDataset];
      try {
        const result = await ensureCustomerDatasetMemberships(membershipCustomerIds, resolvedDatasetId);
        datasetMembershipCount = result.attempted;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        datasetMembershipWarning = 'Ghi Dataset membership thất bại: ' + msg;
        console.error('[Import Excel] ensureCustomerDatasetMemberships failed:', e);
      }
    }

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
      datasetId: resolvedDatasetId,
      datasetName: resolvedDatasetName,
      datasetMembershipCount,
      datasetMembershipWarning,
    } satisfies ImportResult);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[API khach-hang/import-excel] Unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi server: ' + msg }, { status: 500 });
  }
}
