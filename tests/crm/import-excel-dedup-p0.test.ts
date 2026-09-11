import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyRow, phoneKey, resolveColumns } from '../../src/lib/khach-hang-excel-import';
import { toDedupFields } from '../../src/lib/khach-hang-list-query';
import type { KhachHang } from '../../src/lib/types';

// IMPORT_DUPLICATE_CHECK_P0 — Import Excel duplicate-check trước đây gọi
// getKhachHang() (full ~48 cột × toàn bộ customer) chỉ để đọc so_dien_thoai/
// id_khach_hang (2 field DUY NHẤT dùng trong import-excel/route.ts — xem
// existingDbPhoneKeys/phoneKeyToCustomerId). Thay bằng
// getKhachHangImportDedupFields() (narrow select). KHÔNG đổi:
//   - phone normalization (phoneKey: strip non-digit, last 9 số — UNCHANGED,
//     không đụng khach-hang-excel-import.ts)
//   - duplicate/missing-data/new-customer classification (classifyRow — UNCHANGED)
//   - ImportResult response contract (route.ts response construction — UNCHANGED)
// File này chỉ test phần THỰC SỰ đổi: query shape + wiring + fallback +
// chứng minh Set/Map dựng từ dữ liệu narrow cho kết quả classify GIỐNG HỆT
// dữ liệu full-shape cũ (không có cách nào khác được vì classifyRow() chỉ
// nhận Set<string>, chưa từng phụ thuộc field nào khác của customer).

const IMPORT_ROUTE_PATH = 'src/app/api/khach-hang/import-excel/route.ts';
const PG_CUSTOMER_REPO_PATH = 'src/lib/repository/postgresql/customer.repo.ts';
const DATA_ACCESS_PATH = 'src/lib/data-access.ts';
const INTERFACES_PATH = 'src/lib/repository/interfaces.ts';

// ─── A/I. route.ts wiring — không còn getKhachHang(), không per-row query ──

test('import-excel/route.ts: KHÔNG còn gọi getKhachHang() (full ~48 cột) — dùng getKhachHangImportDedupFields() (narrow) để dựng existing/existingDbPhoneKeys/phoneKeyToCustomerId', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  // Chỉ check LỜI GỌI THẬT (await getKhachHang()), không tính dòng comment
  // giải thích lịch sử thay đổi (có nhắc tên hàm cũ).
  assert.doesNotMatch(src, /await getKhachHang\(\)/, 'route không được gọi getKhachHang() nguyên bảng nữa');
  const importLine = src.split('\n').find(line => line.includes("from '@/lib/data-access'"))!;
  assert.ok(importLine);
  assert.doesNotMatch(importLine, /\bgetKhachHang\b(?!ImportDedupFields)/, 'import statement không được import bare getKhachHang nữa');
  assert.match(src, /const existing = await getKhachHangImportDedupFields\(\);/);
  // 2 nơi DUY NHẤT dùng `existing` — vẫn còn nguyên, không đổi logic dựng Set/Map.
  assert.match(src, /const existingDbPhoneKeys = new Set\(existing\.map\(kh => phoneKey\(kh\.so_dien_thoai\)\)\);/);
  assert.match(src, /const phoneKeyToCustomerId = new Map\(existing\.map\(kh => \[phoneKey\(kh\.so_dien_thoai\), kh\.id_khach_hang\]\)\);/);
});

test('import-excel/route.ts: response construction (ImportResult) không bị đụng — chỉ đổi đúng 1 dòng nguồn dữ liệu existing, không đổi field nào của response', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  // Toàn bộ field response contract cũ vẫn còn nguyên literal.
  for (const field of [
    'totalRows', 'imported', 'duplicateInFile', 'alreadyExists', 'invalid', 'errors',
    'importedList', 'duplicateInFileList', 'alreadyExistsList', 'invalidList', 'errorList',
    'duplicateNameWarnings', 'batchId', 'datasetId', 'datasetName', 'datasetMembershipCount',
  ]) {
    assert.match(src, new RegExp(`${field}[,:]`), `response phải vẫn còn field ${field}`);
  }
});

// ─── B. Postgres repository — narrow select(), đúng 2 field ─────────────────

test('postgresql/customer.repo.ts: findDedupFields() dùng select CHÍNH XÁC {id_khach_hang, so_dien_thoai} — không select thêm field nào khác, không phải full findMany', () => {
  const src = readFileSync(resolve(PG_CUSTOMER_REPO_PATH), 'utf8');
  const start = src.indexOf('async findDedupFields()');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  assert.match(body, /select:\s*\{\s*id_khach_hang:\s*true,\s*so_dien_thoai:\s*true\s*\}/);
  // Không có field nào khác trong khối select (đếm đúng 2 lần "true" trong body).
  const trueCount = (body.match(/:\s*true/g) || []).length;
  assert.equal(trueCount, 2, 'select chỉ được đúng 2 field, không thêm field nào "vì tiện"');
});

test('postgresql/customer.repo.ts: findDedupFields() gọi findMany() ĐÚNG 1 lần — không loop/per-row query nào (không N+1)', () => {
  const src = readFileSync(resolve(PG_CUSTOMER_REPO_PATH), 'utf8');
  const start = src.indexOf('async findDedupFields()');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  const findManyCalls = (body.match(/prisma\.khachHang\.findMany\(/g) || []).length;
  assert.equal(findManyCalls, 1, 'chỉ đúng 1 lệnh findMany(), không có vòng lặp/query theo từng dòng');
  assert.doesNotMatch(body, /for\s*\(|\.forEach\(|await.*\.map\(async/, 'không được có loop async/per-row query bên trong findDedupFields()');
});

// ─── H. PG→GS fallback preserved ────────────────────────────────────────────

test('data-access.ts: getKhachHangImportDedupFields() check isPostgresEnabled(\'crm\') trước, có try/catch fallback về getKhachHang() (GS/cached) khi PG lỗi — cùng pattern getKhachHangCrmAccessFields/getKhachHangDashboardFields', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  const start = src.indexOf('export async function getKhachHangImportDedupFields');
  assert.ok(start >= 0);
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  assert.match(body, /isPostgresEnabled\('crm'\)/);
  assert.match(body, /catch \(e\)/);
  assert.match(body, /getKhachHang\(\)/, 'fallback phải qua getKhachHang() (đã cached cho GS), không tự đọc GS raw');
  assert.match(body, /toDedupFields/);
});

test('data-access.ts: getKhachHangImportDedupFields() dùng cache revalidate 30s giống hệt _pgKhachHang cũ (Import Excel từng gọi) — không đổi đặc tính staleness đã có từ trước', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  assert.match(src, /_pgKhachHangDedupFields\s*=\s*unstable_cache\(\(\) => getCustomerRepository\(\)\.findDedupFields\(\),\s*\['kh-dedup-fields'\],\s*\{ revalidate: 30, tags: \['kh'\] \}\)/);
});

test('repository/interfaces.ts: ICustomerRepository khai báo findDedupFields(); CustomerDedupFields = Pick<KhachHang, id_khach_hang | so_dien_thoai> (không field nào khác)', () => {
  const src = readFileSync(resolve(INTERFACES_PATH), 'utf8');
  assert.match(src, /findDedupFields\(\): Promise<CustomerDedupFields\[\]>;/);
  assert.match(src, /export type CustomerDedupFields = Pick<KhachHang,\s*'id_khach_hang' \| 'so_dien_thoai'>;/);
});

// ─── C/D/E/F. Dedup/classification semantics unchanged when fed narrow data ─

function buildColumns() {
  const header = ['Tên KH', 'SĐT', 'Email'];
  const columns = resolveColumns(header);
  assert.ok(columns);
  return columns!;
}

test('toDedupFields: rút gọn ĐÚNG 2 field (id_khach_hang/so_dien_thoai), không field nào khác — mirror EXACT field set mà import-excel/route.ts đọc', () => {
  const kh = { id_khach_hang: 'KH1', so_dien_thoai: '0901234567' } as KhachHang;
  const narrow = toDedupFields(kh);
  assert.deepEqual(narrow, { id_khach_hang: 'KH1', so_dien_thoai: '0901234567' });
  assert.deepEqual(Object.keys(narrow).sort(), ['id_khach_hang', 'so_dien_thoai']);
});

test('classifyRow với existingDbPhoneKeys dựng từ CustomerDedupFields[] (narrow, không phải full KhachHang[]) cho kết quả GIỐNG HỆT dữ liệu full-shape cũ — classifyRow chưa bao giờ phụ thuộc field nào khác ngoài phone', () => {
  const columns = buildColumns();
  // Mô phỏng ĐÚNG route.ts: existing là CustomerDedupFields[] (narrow), không
  // phải KhachHang[] đầy đủ.
  const existingNarrow = [
    { id_khach_hang: 'KH_EXIST_1', so_dien_thoai: '0901111111' },
    { id_khach_hang: 'KH_EXIST_2', so_dien_thoai: '0902222222' },
  ];
  const existingDbPhoneKeys = new Set(existingNarrow.map(kh => phoneKey(kh.so_dien_thoai)));
  const phoneKeyToCustomerId = new Map(existingNarrow.map(kh => [phoneKey(kh.so_dien_thoai), kh.id_khach_hang]));
  const seenInFile = new Set<string>();

  // Khách MỚI (không trùng ai) -> ready.
  const rNew = classifyRow(['Khách Mới A', '0903333333', ''], columns, existingDbPhoneKeys, seenInFile);
  assert.equal(rNew.status, 'ready');

  // Khách ĐÃ có trong DB (trùng existingNarrow[0]) -> already_exists.
  const rExists = classifyRow(['Trùng DB', '0901111111', ''], columns, existingDbPhoneKeys, seenInFile);
  assert.equal(rExists.status, 'already_exists');
  // phoneKeyToCustomerId (dựng từ narrow data) phải tra đúng id_khach_hang cũ —
  // đúng logic route.ts dùng cho existingCustomerIdsForDataset.
  if (rExists.status === 'already_exists') {
    assert.equal(phoneKeyToCustomerId.get(phoneKey(rExists.so_dien_thoai)), 'KH_EXIST_1');
  }

  // Thiếu SĐT -> invalid (missing-data classification KHÔNG bị đụng bởi thay đổi này).
  const rInvalid = classifyRow(['Thiếu SĐT', '', ''], columns, existingDbPhoneKeys, seenInFile);
  assert.equal(rInvalid.status, 'invalid');
});

test('duplicate_in_file classification (trùng trong cùng file, khác already_exists) không bị đụng bởi nguồn existing narrow', () => {
  const columns = buildColumns();
  const existingDbPhoneKeys = new Set<string>(); // DB rỗng — không ai already_exists
  const seenInFile = new Set<string>();
  const r1 = classifyRow(['Dòng 1', '0904444444', ''], columns, existingDbPhoneKeys, seenInFile);
  assert.equal(r1.status, 'ready');
  seenInFile.add(phoneKey('0904444444')); // route.ts add ngay khi 'ready', trước khi ghi DB
  const r2 = classifyRow(['Dòng 2 trùng SĐT', '0904444444', ''], columns, existingDbPhoneKeys, seenInFile);
  assert.equal(r2.status, 'duplicate_in_file');
});

// ─── G. Synthetic batch (KHÔNG dùng dữ liệu production thật) — chứng minh
// classifier contract xử lý đúng 1 batch nhiều dòng với tỉ lệ ready/duplicate/
// already_exists/invalid tương tự thực tế, dùng dữ liệu HOÀN TOÀN giả lập. ──

test('synthetic batch (dữ liệu giả lập, KHÔNG phải production): batch nhiều dòng với existing narrow -> đúng số ready/already_exists/duplicate_in_file/invalid, không leak/lệch giữa các loại', () => {
  const columns = buildColumns();
  // "DB hiện có" — CHỈ narrow shape (đúng route.ts sau P0), dữ liệu giả lập.
  const existingNarrow = Array.from({ length: 5 }, (_, i) => ({
    id_khach_hang: `KH_SEED_${i}`,
    so_dien_thoai: `09000000${String(i).padStart(2, '0')}`,
  }));
  const existingDbPhoneKeys = new Set(existingNarrow.map(kh => phoneKey(kh.so_dien_thoai)));
  const seenInFile = new Set<string>();

  // File giả lập: 6 dòng mới (ready), 2 dòng trùng DB (already_exists), 2 dòng
  // trùng nhau trong file (1 ready + 1 duplicate_in_file), 3 dòng thiếu SĐT (invalid).
  const rows: { row: (string)[]; expect: string }[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ row: [`Khách Mới ${i}`, `091111${String(i).padStart(4, '0')}`, ''], expect: 'ready' })),
    { row: ['Trùng DB 1', '0900000000', ''], expect: 'already_exists' },
    { row: ['Trùng DB 2', '0900000001', ''], expect: 'already_exists' },
    { row: ['File Dup Gốc', '0922222222', ''], expect: 'ready' },
    { row: ['File Dup Lặp', '0922222222', ''], expect: 'duplicate_in_file' },
    { row: ['Thiếu SĐT 1', '', ''], expect: 'invalid' },
    { row: ['Thiếu SĐT 2', '', ''], expect: 'invalid' },
    { row: ['', '', ''], expect: 'blank' },
  ];

  const counts: Record<string, number> = {};
  for (const { row, expect } of rows) {
    const result = classifyRow(row, columns, existingDbPhoneKeys, seenInFile);
    assert.equal(result.status, expect, `dòng "${row[0]}" phải phân loại "${expect}", nhận "${result.status}"`);
    counts[result.status] = (counts[result.status] || 0) + 1;
    if (result.status === 'ready') seenInFile.add(phoneKey(result.so_dien_thoai));
  }
  assert.equal(counts.ready, 7); // 6 mới + 1 file-dup gốc
  assert.equal(counts.already_exists, 2);
  assert.equal(counts.duplicate_in_file, 1);
  assert.equal(counts.invalid, 2);
  assert.equal(counts.blank, 1);
  // Tổng khớp — không dòng nào bị đếm 2 lần hoặc mất tích.
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), rows.length);
});
