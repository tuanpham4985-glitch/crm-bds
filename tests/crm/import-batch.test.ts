import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isCrmAdmin } from '../../src/lib/crm-auth';
import { addKhachHangWithBatch } from '../../src/lib/data-access';
import { planBulkDelete } from '../../src/lib/khach-hang-bulk-delete';
import { classifyRow, resolveColumns } from '../../src/lib/khach-hang-excel-import';
import { fromKhachHang } from '../../src/lib/repository/postgresql/customer.repo';
import { _resetFlagsCache } from '../../src/lib/db/feature-flags';
import type { KhachHang, Pipeline } from '../../src/lib/types';

function customer(overrides: Partial<KhachHang> = {}): KhachHang {
  return {
    id_khach_hang: 'KH1', ngay_tao: '2026-01-01', ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0901234567',
    email: '', nguon: '', nhu_cau: '', ghi_chu: '', sale_phu_trach: '', label_khach: 'A - 0901234567',
    trang_thai_ban_giao: 'Chưa bàn giao', so_lan_lien_he: 0, lich_su_cham_soc: '[]', lich_su_ban_giao: '[]',
    ...overrides,
  };
}

// --- Authorization: Import History / Delete Import Batch dùng chung isCrmAdmin, cùng tier với bulk-delete ---

test('Admin có quyền xem/xóa Import Batch', () => {
  assert.equal(isCrmAdmin({ id_nhan_vien: 'NV1', ho_ten: 'Admin A', email: 'a@x.com', vai_tro: 'Admin' }), true);
});

test('Telesale/Sale không được xóa batch (không đủ quyền isCrmAdmin -> route trả 403)', () => {
  assert.equal(isCrmAdmin({ id_nhan_vien: 'NV2', ho_ten: 'Telesale B', email: 'b@x.com', vai_tro: 'Telesale', employee_type: 'Telesale' }), false);
  assert.equal(isCrmAdmin({ id_nhan_vien: 'NV3', ho_ten: 'Sale C', email: 'c@x.com', vai_tro: 'Sale', employee_type: 'Sale' }), false);
});

// --- Provenance: import_batch_id phải được ghi ATOMIC cùng lúc tạo customer ---
// (remediation: trước đây customer được tạo trước, batch link bằng update riêng
// sau đó — có thể silently thất bại. Giờ addKhachHangWithBatch() ghi cả hai trong
// đúng 1 lệnh create(), không có bước riêng nào có thể "quên" gắn batch.)

test('fromKhachHang (Prisma create payload) luôn forward đúng import_batch_id -> customer tạo thành công chắc chắn có batch id', () => {
  const kh = customer({ id_khach_hang: 'KH1', import_batch_id: 'BATCH_123' });
  const payload = fromKhachHang(kh);
  assert.equal(payload.import_batch_id, 'BATCH_123');
});

test('addKhachHangWithBatch từ chối chạy (throw trước khi đụng DB) khi Postgres CRM chưa bật — không có đường fallback sang Google Sheets mất provenance', async () => {
  const original = process.env.PG_ENABLED_MODULES;
  process.env.PG_ENABLED_MODULES = '';
  _resetFlagsCache();
  try {
    await assert.rejects(
      () => addKhachHangWithBatch(customer({ id_khach_hang: 'KH_NOPG' }), 'BATCH_X'),
      /requires Postgres CRM/,
    );
  } finally {
    process.env.PG_ENABLED_MODULES = original;
    _resetFlagsCache();
  }
});

test('addKhachHangWithBatch (data-access.ts) không có nhánh fallback sang Google Sheets — chỉ 1 đường ghi PG duy nhất, lỗi sẽ ném ra chứ không âm thầm tạo customer mất provenance', () => {
  const src = readFileSync(resolve('src/lib/data-access.ts'), 'utf8');
  const fnStart = src.indexOf('export async function addKhachHangWithBatch');
  assert.ok(fnStart >= 0, 'addKhachHangWithBatch phải tồn tại trong data-access.ts');
  const fnEnd = src.indexOf('\nexport function addKhachHangBatch', fnStart);
  const fnBody = src.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 1200);
  // Không được gọi withPgFallback / GS.addKhachHang bên trong hàm này — nếu có,
  // nghĩa là lại có đường "im lặng rơi về Google Sheets" làm mất provenance.
  assert.doesNotMatch(fnBody, /withPgFallback|GS\.addKhachHang/);
});

test('import-excel/route.ts tạo Import Batch record TRƯỚC vòng lặp xử lý dòng, không bọc try/catch nuốt lỗi — batch tạo thất bại phải dừng cả request trước khi có customer nào được tạo', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/import-excel/route.ts'), 'utf8');
  const createIdx = src.indexOf('createImportBatch(');
  const loopIdx = src.indexOf('for (let i = 0; i < dataRows.length; i++)');
  assert.ok(createIdx >= 0 && loopIdx >= 0);
  assert.ok(createIdx < loopIdx, 'batch phải được tạo trước khi vòng lặp xử lý dòng bắt đầu');
  // Đoạn code tạo batch (giữa 2 mốc trên) không được nằm trong try/catch riêng —
  // để lỗi tạo batch ném thẳng ra ngoài, dừng request thay vì bị nuốt.
  const between = src.slice(createIdx - 80, createIdx);
  assert.doesNotMatch(between, /try\s*\{/);
});

// --- Duplicate existing customer không bao giờ được coi là customer của batch ---
test('duplicate existing customer được phân loại "already_exists", không bao giờ có thể trở thành customer mới của batch', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header)!;
  const existingDbPhoneKeys = new Set(['901234567']); // đã tồn tại trước khi import
  const result = classifyRow(['Khách đã có', '0901234567'], columns, existingDbPhoneKeys, new Set());
  assert.equal(result.status, 'already_exists');
  // Chỉ 'ready' mới có thể tạo customer mới rồi được gắn import_batch_id — 'already_exists' thì không bao giờ.
  assert.notEqual(result.status, 'ready');
});

test('customer thực sự mới (không trùng) được phân loại "ready" -> đủ điều kiện tạo mới và gắn batch', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header)!;
  const result = classifyRow(['Khách mới', '0909999999'], columns, new Set(), new Set());
  assert.equal(result.status, 'ready');
});

test('batch counts (created/duplicate/invalid) khớp đúng với phân loại từng dòng, kể cả khi trộn already_exists + duplicate_in_file', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header)!;
  const existingDbPhoneKeys = new Set(['901111111']); // 1 khách đã có sẵn trong DB
  const seenInFile = new Set<string>();

  const rows = [
    ['Khách mới 1', '0902222222'],   // ready
    ['Khách đã có', '901111111'],    // already_exists
    ['Khách mới 2', '0903333333'],   // ready
    ['', ''],                        // blank — không tính vào bất kỳ counter nào
    ['Thiếu SĐT', ''],               // invalid
  ];

  let created = 0, alreadyExists = 0, duplicateInFile = 0, invalid = 0;
  for (const row of rows) {
    const result = classifyRow(row, columns, existingDbPhoneKeys, seenInFile);
    if (result.status === 'blank') continue;
    if (result.status === 'ready') { created++; seenInFile.add(result.so_dien_thoai.replace(/\D/g, '').slice(-9)); continue; }
    if (result.status === 'already_exists') { alreadyExists++; continue; }
    if (result.status === 'duplicate_in_file') { duplicateInFile++; continue; }
    if (result.status === 'invalid') { invalid++; continue; }
  }

  // Thêm 1 dòng trùng với dòng "Khách mới 1" ngay trong file -> duplicate_in_file
  const dupResult = classifyRow(['Khách mới 1 (lặp)', '0902222222'], columns, existingDbPhoneKeys, seenInFile);
  if (dupResult.status === 'duplicate_in_file') duplicateInFile++;

  assert.equal(created, 2);
  assert.equal(alreadyExists, 1);
  assert.equal(duplicateInFile, 1);
  assert.equal(invalid, 1);
  // Tổng số dòng có nội dung (không tính blank) phải khớp: 2+1+1+1 = 5 dòng đã xử lý (6 dòng thực - 1 blank).
  assert.equal(created + alreadyExists + duplicateInFile + invalid, 5);
});

// --- Delete Import Batch: reuse đúng customerDeleteBlockReason(), mixed batch không fail toàn bộ ---

test('batch toàn customer eligible -> tất cả sẵn sàng xóa', () => {
  const batchCustomers = [
    customer({ id_khach_hang: 'KH_A', ten_KH: 'A' }),
    customer({ id_khach_hang: 'KH_B', ten_KH: 'B', so_dien_thoai: '0912345678' }),
  ];
  const ids = batchCustomers.map(c => c.id_khach_hang);
  const { items } = planBulkDelete(ids, batchCustomers, []);
  assert.equal(items.every(i => i.status === 'ready'), true);
});

test('batch hỗn hợp: customer có lịch sử CRM được giữ lại, customer sạch vẫn xóa được, không fail toàn bộ batch', () => {
  const batchCustomers = [
    customer({ id_khach_hang: 'KH_CLEAN', ten_KH: 'Khách sạch' }),
    customer({ id_khach_hang: 'KH_PROTECTED', ten_KH: 'Khách đã chăm sóc', so_lan_lien_he: 2, so_dien_thoai: '0912345678' }),
  ];
  const pipelines: Pipeline[] = [];
  const ids = batchCustomers.map(c => c.id_khach_hang);
  const { items } = planBulkDelete(ids, batchCustomers, pipelines);
  assert.equal(items.find(i => i.id === 'KH_CLEAN')?.status, 'ready');
  assert.equal(items.find(i => i.id === 'KH_PROTECTED')?.status, 'blocked');
  // Không có exception/early-return nào làm mất record còn lại trong danh sách kết quả.
  assert.equal(items.length, 2);
});

test('batch có customer đang trong Pipeline vẫn được giữ lại, không bị xóa theo batch', () => {
  const batchCustomers = [customer({ id_khach_hang: 'KH_PIPELINE' })];
  const pipelines: Pipeline[] = [{ id_khach_hang: 'KH_PIPELINE' } as Pipeline];
  const { items } = planBulkDelete(['KH_PIPELINE'], batchCustomers, pipelines);
  assert.equal(items[0].status, 'blocked');
});

// --- Batch rỗng/không xác định: an toàn, không gây mass deletion ---

test('batch không còn customer nào (đã xóa hết từ trước) -> danh sách rỗng, không gây lỗi/mass deletion', () => {
  const { ids, items } = planBulkDelete([], [], []);
  assert.deepEqual(ids, []);
  assert.deepEqual(items, []);
});

test('id không tồn tại trong batch -> not_found, không suy diễn xóa nhầm', () => {
  const batchCustomers = [customer({ id_khach_hang: 'KH_REAL' })];
  const { items } = planBulkDelete(['KH_GHOST'], batchCustomers, []);
  assert.equal(items[0].status, 'not_found');
});

// --- Legacy cleanup audit: xác nhận script không có bất kỳ thao tác ghi/xóa nào ---

test('legacy import audit script là read-only: không gọi bất kỳ hàm ghi/xóa dữ liệu nào', () => {
  const src = readFileSync(resolve('scripts/legacy-import-audit.ts'), 'utf8');
  assert.doesNotMatch(src, /deleteKhachHang|\.delete\(|\.update\(|\.create\(|\.upsert\(|updateMany|createMany|deleteMany/);
  assert.match(src, /READ-ONLY/i);
});

// --- Regression: file thật nhiều dòng (VD 446 Manhattan-VHGP.xlsx, 444 dòng)
// từng bị Import History hiển thị Tổng/Tạo mới/Trùng/Thiếu dữ liệu = 0 dù
// customer đã được tạo đúng (import_batch_id vẫn atomic per-row, không hề sai
// — chỉ số liệu tổng kết trên batch record là hư). Nguyên nhân: route sleep
// 150ms/dòng KHÔNG ĐIỀU KIỆN (kể cả nhánh Postgres, vốn không cần rate-limit
// vì không gọi Google Sheets) -> file vài trăm/nghìn dòng vượt execution
// timeout của serverless function -> request bị nền tảng cắt giữa vòng lặp,
// SAU khi nhiều customer đã tạo thành công nhưng TRƯỚC khi updateImportBatchCounts()
// (chỉ chạy 1 lần, sau khi toàn bộ vòng lặp xong) kịp ghi. Trước commit sửa
// multi-sheet, các file lớn này không bao giờ chạy tới đoạn này (bị chặn sớm
// ở bước tìm sheet/header), nên bug timeout tồn tại sẵn nhưng chưa lộ ra.

test('createImportBatch được gọi kèm totalRows = dataRows.length -> "Tổng" ghi NGAY lúc tạo batch, không chờ vòng lặp xử lý dòng xong', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/import-excel/route.ts'), 'utf8');
  assert.match(src, /createImportBatch\(\{[^}]*totalRows:\s*dataRows\.length[^}]*\}\)/);
});

test('createImportBatch (import-batch.ts) ghi total_rows từ input.totalRows thay vì hardcode 0 -> "Tổng" không kẹt ở 0 nếu request bị ngắt giữa chừng', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/import-batch.ts'), 'utf8');
  const fnStart = src.indexOf('export async function createImportBatch');
  const fnEnd = src.indexOf('\nexport async function checkpointImportBatchCounts', fnStart);
  const fnBody = src.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 800);
  assert.match(fnBody, /total_rows:\s*input\.totalRows\s*\?\?\s*0/);
  assert.doesNotMatch(fnBody, /total_rows:\s*0,/); // không còn hardcode 0 nữa
});

// --- Batch lifecycle: processing -> completed, checkpoint định kỳ ---
// Remediation cho lỗ hổng còn lại sau lần fix trước: created/duplicate/invalid
// vẫn chỉ được ghi 1 LẦN DUY NHẤT sau khi toàn bộ vòng lặp xong -> file thật
// lớn (VD CONDOTEL/VILLAS >2000 dòng) vẫn có thể bị ngắt giữa chừng và mãi
// hiện số liệu cũ dù nhiều customer đã tạo đúng. Fix: checkpoint định kỳ +
// status processing/completed để Lịch sử Import phân biệt rõ batch dang dở.

// Trích đúng THÂN hàm (từ "export async function <name>" tới dòng "}" đóng
// khối ở cột 0) — KHÔNG lấy theo vị trí hàm kế tiếp, vì JSDoc của hàm kế tiếp
// nằm ngay trước "export async function <next>" và sẽ lọt vào slice nếu bound
// theo cách đó (comment có thể nhắc tới 'completed'/'processing' cho mục đích
// tài liệu, không phải code thật).
function extractFunctionBody(src: string, fnName: string): string {
  const fnStart = src.indexOf(`export async function ${fnName}`);
  assert.ok(fnStart >= 0, `${fnName} phải tồn tại`);
  const closeMatch = /\r?\n\}\r?\n/.exec(src.slice(fnStart)); // chấp nhận cả CRLF lẫn LF
  return closeMatch ? src.slice(fnStart, fnStart + closeMatch.index) : src.slice(fnStart, fnStart + 600);
}

test('createImportBatch set status = "processing" lúc tạo (không phải "completed" ngay từ đầu như trước)', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/import-batch.ts'), 'utf8');
  assert.match(extractFunctionBody(src, 'createImportBatch'), /status:\s*'processing'/);
});

test('checkpointImportBatchCounts KHÔNG đụng status và KHÔNG đụng total_rows -> chỉ cập nhật 3 counter đang chạy, không thể vô tình đánh dấu batch hoàn tất hay ghi đè total_rows đã cố định', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/import-batch.ts'), 'utf8');
  const fnBody = extractFunctionBody(src, 'checkpointImportBatchCounts');
  assert.match(fnBody, /created_count:\s*counts\.createdCount/);
  assert.match(fnBody, /duplicate_count:\s*counts\.duplicateCount/);
  assert.match(fnBody, /invalid_count:\s*counts\.invalidCount/);
  assert.doesNotMatch(fnBody, /status:/);
  assert.doesNotMatch(fnBody, /total_rows:/);
});

test('completeImportBatch ghi số liệu cuối cùng CHÍNH XÁC + set status = "completed" trong cùng 1 lần ghi', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/import-batch.ts'), 'utf8');
  const fnBody = extractFunctionBody(src, 'completeImportBatch');
  assert.match(fnBody, /created_count:\s*counts\.createdCount/);
  assert.match(fnBody, /duplicate_count:\s*counts\.duplicateCount/);
  assert.match(fnBody, /invalid_count:\s*counts\.invalidCount/);
  assert.match(fnBody, /status:\s*'completed'/);
});

test('interrupted-import semantics: "completed" CHỈ xuất hiện trong THÂN HÀM completeImportBatch — createImportBatch/checkpointImportBatchCounts không có code path nào set completed -> nếu request bị ngắt giữa chừng, batch giữ nguyên status "processing" mãi mãi, Lịch sử Import không bao giờ báo nhầm batch dang dở là đã xong', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/import-batch.ts'), 'utf8');
  assert.doesNotMatch(extractFunctionBody(src, 'createImportBatch'), /'completed'/);
  assert.doesNotMatch(extractFunctionBody(src, 'checkpointImportBatchCounts'), /'completed'/);
  assert.match(extractFunctionBody(src, 'completeImportBatch'), /'completed'/);
});

test('route: checkpoint được gọi ĐỊNH KỲ mỗi CHECKPOINT_INTERVAL_ROWS dòng bên trong vòng lặp xử lý dòng (không phải mỗi dòng)', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/import-excel/route.ts'), 'utf8');
  assert.match(src, /const CHECKPOINT_INTERVAL_ROWS\s*=\s*\d+/);
  const loopIdx = src.indexOf('for (let i = 0; i < dataRows.length; i++)');
  const checkpointCallIdx = src.indexOf('checkpointImportBatchCounts(batchId,');
  const completeCallIdx = src.indexOf('completeImportBatch(batchId,');
  assert.ok(loopIdx >= 0 && checkpointCallIdx >= 0 && completeCallIdx >= 0);
  assert.ok(loopIdx < checkpointCallIdx, 'checkpoint phải nằm bên trong vòng lặp, sau khi vòng lặp bắt đầu');
  assert.ok(checkpointCallIdx < completeCallIdx, 'checkpoint (giữa chừng) phải đứng trước completeImportBatch (cuối vòng lặp)');
  assert.match(src, /i\s*%\s*CHECKPOINT_INTERVAL_ROWS\s*===\s*0/, 'checkpoint phải dùng modulo theo interval, không phải mỗi dòng');
});

test('route: checkpoint nằm ở đầu mỗi vòng lặp, trước cả "continue" của blank/invalid/duplicate -> chu kỳ checkpoint không bị bỏ lỡ dù file toàn dòng trùng/lỗi', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/import-excel/route.ts'), 'utf8');
  const loopIdx = src.indexOf('for (let i = 0; i < dataRows.length; i++)');
  const checkpointCallIdx = src.indexOf('checkpointImportBatchCounts(batchId,');
  const firstContinueAfterLoop = src.indexOf("if (classification.status === 'blank') continue;", loopIdx);
  assert.ok(loopIdx < checkpointCallIdx && checkpointCallIdx < firstContinueAfterLoop, 'checkpoint phải chạy trước dòng continue đầu tiên trong vòng lặp');
});

test('route: completeImportBatch chỉ được gọi SAU khi vòng lặp xử lý dòng đã đóng (kết thúc for) -> không thể "hoàn tất" khi còn dòng chưa xử lý', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/import-excel/route.ts'), 'utf8');
  const loopIdx = src.indexOf('for (let i = 0; i < dataRows.length; i++)');
  const closeMatch = /\r?\n {4}\}\r?\n/.exec(src.slice(loopIdx)); // đóng khối for ở indent gốc (4 khoảng trắng) — chấp nhận cả CRLF lẫn LF
  assert.ok(loopIdx >= 0 && closeMatch, 'phải tìm được dòng đóng khối for');
  const loopCloseIdx = loopIdx + closeMatch!.index;
  const completeCallIdx = src.indexOf('completeImportBatch(batchId,');
  assert.ok(completeCallIdx > loopCloseIdx, 'completeImportBatch phải nằm sau khi vòng lặp for đã đóng');
});

test('rate-limit sleep 150ms/dòng CHỈ áp dụng cho nhánh Google Sheets (!pgCrmEnabled) — nhánh Postgres không sleep, tránh vượt execution timeout trên file thật nhiều dòng', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/import-excel/route.ts'), 'utf8');
  const sleepIdx = src.indexOf('setTimeout(r, 150)');
  assert.ok(sleepIdx >= 0, 'sleep phải vẫn tồn tại cho nhánh Google Sheets');
  const before = src.slice(Math.max(0, sleepIdx - 120), sleepIdx);
  assert.match(before, /if\s*\(\s*!pgCrmEnabled\s*\)/, 'sleep phải được gate bởi !pgCrmEnabled, không chạy unconditional nữa');
});

test('import-excel route khai báo maxDuration đủ lớn cho file thật nhiều dòng (không phụ thuộc mặc định quá ngắn của nền tảng)', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/import-excel/route.ts'), 'utf8');
  const match = src.match(/export const maxDuration\s*=\s*(\d+)/);
  assert.ok(match, 'route phải khai báo maxDuration');
  assert.ok(Number(match![1]) >= 60, 'maxDuration phải đủ lớn cho file vài trăm dòng, tối thiểu bằng route dài hơi khác trong repo (sync-sheets = 60)');
});

test('getImportBatchCustomers (batch detail) lọc đúng theo import_batch_id — chỉ trả về customer thực sự thuộc batch đó, không suy diễn theo filename/thời gian', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/import-batch.ts'), 'utf8');
  const fnStart = src.indexOf('export async function getImportBatchCustomers');
  assert.ok(fnStart >= 0);
  const fnBody = src.slice(fnStart, fnStart + 300);
  assert.match(fnBody, /where:\s*\{\s*import_batch_id:\s*batchId\s*\}/);
});

test('addKhachHangWithBatch vẫn được gọi trong nhánh pgCrmEnabled của vòng lặp xử lý dòng -> provenance import_batch_id vẫn atomic per-row, không bị ảnh hưởng bởi việc bỏ sleep', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/import-excel/route.ts'), 'utf8');
  assert.match(src, /if\s*\(pgCrmEnabled\)\s*await\s*addKhachHangWithBatch\(kh,\s*batchId!\)/);
});
