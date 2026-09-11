import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toAssignmentFields, toDashboardFields } from '../../src/lib/khach-hang-list-query';
import type { KhachHang } from '../../src/lib/types';

// NEON_TRANSFER_AUDIT P0 remediation — locks in:
// 1. crm-access/dashboard no longer force a full getKhachHang() (48-column,
//    unbounded history/JSON fields, ~6998 rows) read just to compute a few
//    small derived facts.
// 2. /api/cham-cong-ngoai/pending-count uses a DB-side COUNT instead of
//    loading full attendance rows (incl. base64 hinh_anh) to .filter().length.
// 3. Existing full-shape getKhachHang()/getChamCongNgoai() contracts and
//    their other consumers (khach-hang GS branch, phone-dedup, telesale
//    routes) are UNCHANGED.

const DATA_ACCESS_PATH = 'src/lib/data-access.ts';
const CRM_ACCESS_ROUTE_PATH = 'src/app/api/crm-access/route.ts';
const DASHBOARD_ROUTE_PATH = 'src/app/api/dashboard/route.ts';
const PENDING_COUNT_ROUTE_PATH = 'src/app/api/cham-cong-ngoai/pending-count/route.ts';
const PG_CUSTOMER_REPO_PATH = 'src/lib/repository/postgresql/customer.repo.ts';
const PG_ATTENDANCE_REPO_PATH = 'src/lib/repository/postgresql/attendance-outside.repo.ts';
const KHACH_HANG_ROUTE_PATH = 'src/app/api/khach-hang/route.ts';

function buildCustomer(overrides: Partial<KhachHang> = {}): KhachHang {
  return {
    id_khach_hang: 'KH1', ngay_tao: '2026-01-01T00:00:00.000Z', ten_KH: 'Test',
    so_dien_thoai: '0900000000', email: '', nguon: 'Facebook', nhu_cau: '', ghi_chu: '',
    sale_phu_trach: 'Sale A', label_khach: '', du_an: 'Dự án X',
    telesale_phu_trach: 'Telesale A', sale_nhan_khach: 'Sale B',
    trang_thai_cham_soc: 'Chưa gọi', muc_do_quan_tam: 'Chưa xác định',
    so_lan_lien_he: 0, lich_su_cham_soc: '[]', trang_thai_ban_giao: 'Chờ xác nhận',
    lich_su_ban_giao: '[]', ...overrides,
  } as KhachHang;
}

// ─── A. Pure mapping helpers (real behavior, no DB) ───────────────────────

test('toAssignmentFields: rút gọn đúng 5 field (telesale_phu_trach/sale_nhan_khach/sale_phu_trach/du_an/trang_thai_ban_giao), không kèm field lịch sử/JSON nào khác', () => {
  const kh = buildCustomer();
  const narrow = toAssignmentFields(kh);
  assert.deepEqual(narrow, {
    telesale_phu_trach: 'Telesale A',
    sale_nhan_khach: 'Sale B',
    sale_phu_trach: 'Sale A',
    du_an: 'Dự án X',
    trang_thai_ban_giao: 'Chờ xác nhận',
  });
  assert.deepEqual(Object.keys(narrow).sort(), ['du_an', 'sale_nhan_khach', 'sale_phu_trach', 'telesale_phu_trach', 'trang_thai_ban_giao'].sort());
});

test('toDashboardFields: rút gọn đúng 3 field (nguon/sale_phu_trach/ngay_tao)', () => {
  const kh = buildCustomer({ nguon: 'Zalo', sale_phu_trach: 'Sale C', ngay_tao: '2026-03-05T00:00:00.000Z' });
  const narrow = toDashboardFields(kh);
  assert.deepEqual(narrow, { nguon: 'Zalo', sale_phu_trach: 'Sale C', ngay_tao: '2026-03-05T00:00:00.000Z' });
  assert.deepEqual(Object.keys(narrow).sort(), ['nguon', 'ngay_tao', 'sale_phu_trach'].sort());
});

test('toAssignmentFields/toDashboardFields: undefined optional field (telesale_phu_trach/du_an/nguon không có) vẫn giữ nguyên undefined, không tự bịa giá trị', () => {
  const kh = buildCustomer({ telesale_phu_trach: undefined, du_an: undefined, nguon: undefined });
  assert.equal(toAssignmentFields(kh).telesale_phu_trach, undefined);
  assert.equal(toAssignmentFields(kh).du_an, undefined);
  assert.equal(toDashboardFields(kh).nguon, undefined);
});

// ─── B. crm-access wiring — no full getKhachHang() ─────────────────────────

test('crm-access/route.ts: KHÔNG còn gọi getKhachHang() (full-table, 48 cột) — dùng getKhachHangHandoffPendingCount()/getKhachHangCrmAccessFields() (narrow)', () => {
  const src = readFileSync(resolve(CRM_ACCESS_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /\bgetKhachHang\(\)/, 'crm-access không được gọi getKhachHang() nguyên bảng nữa');
  assert.match(src, /getKhachHangCrmAccessFields|getKhachHangHandoffPendingCount/, 'phải import ít nhất 1 hàm narrow mới');
});

test('crm-access/route.ts: nhánh Admin dùng getKhachHangHandoffPendingCount() (DB-side count, KHÔNG load rows để .filter().length)', () => {
  const src = readFileSync(resolve(CRM_ACCESS_ROUTE_PATH), 'utf8');
  const adminBranchStart = src.indexOf('if (isAdmin)');
  const adminBranchEnd = src.indexOf('// Find projects this user is involved in', adminBranchStart);
  assert.ok(adminBranchStart >= 0 && adminBranchEnd > adminBranchStart);
  const adminBody = src.slice(adminBranchStart, adminBranchEnd);
  assert.match(adminBody, /handoffCount:\s*await getKhachHangHandoffPendingCount\(\)/);
  assert.doesNotMatch(adminBody, /\.filter\(/, 'nhánh Admin không còn .filter() thủ công trên full customer array');
});

test('crm-access/route.ts: nhánh non-Admin dùng getKhachHangCrmAccessFields() trong Promise.all cùng getDuAn/getNhanVien', () => {
  const src = readFileSync(resolve(CRM_ACCESS_ROUTE_PATH), 'utf8');
  assert.match(src, /Promise\.all\(\[getDuAn\(\), getKhachHangCrmAccessFields\(\), getNhanVien\(\)\]\)/);
});

// ─── C. dashboard wiring — narrow customer fields ──────────────────────────

test('dashboard/route.ts: Promise.all dùng getKhachHangDashboardFields() thay vì getKhachHang() nguyên bảng — giữ NGUYÊN vị trí/thứ tự trong tuple (allCustomers) và các fetch khác (getPipeline/getNhanVien/...) không đổi', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /\bgetKhachHang\(\)/, 'dashboard không được gọi getKhachHang() nguyên bảng nữa');
  const promiseAllIdx = src.indexOf('const [allPipelines, allCustomers, allEmployeesRaw');
  assert.ok(promiseAllIdx >= 0);
  const promiseAllBlock = src.slice(promiseAllIdx, promiseAllIdx + 300);
  assert.match(promiseAllBlock, /getPipeline\(\),\s*\n\s*getKhachHangDashboardFields\(\),\s*\n\s*getNhanVien\(\),/);
});

test('dashboard/route.ts: allCustomers vẫn chỉ được dùng qua đúng 3 field (nguon/sale_phu_trach/ngay_tao) + .length — khớp CHÍNH XÁC field mà getKhachHangDashboardFields() trả về, không thiếu field nào tính toán cần', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  const usageMatches = [...src.matchAll(/allCustomers\.(?:forEach|filter|length)/g)];
  assert.ok(usageMatches.length >= 4, 'phải còn đủ các usage allCustomers.forEach/filter/length như trước remediation');
  const fieldMatches = [...src.matchAll(/\ballCustomers\.(?:forEach|filter)\(kh\s*=>\s*[\s\S]{0,120}?\)/g)]
    .map(m => m[0]);
  const usedFields = new Set<string>();
  for (const block of fieldMatches) {
    for (const fieldMatch of block.matchAll(/kh\.(\w+)/g)) usedFields.add(fieldMatch[1]);
  }
  const allowed = new Set(['nguon', 'sale_phu_trach', 'ngay_tao']);
  for (const field of usedFields) {
    assert.ok(allowed.has(field), `dashboard dùng field "${field}" từ allCustomers nhưng getKhachHangDashboardFields() không cấp field này`);
  }
});

// ─── D. attendance pending-count wiring — COUNT-only, no image rows ───────

test('pending-count/route.ts: KHÔNG còn gọi getChamCongNgoai() (full rows, gồm field hinh_anh) — dùng getChamCongNgoaiPendingCount() (DB-side COUNT) cho cả 2 nhánh Admin/HR và Quản lý', () => {
  const src = readFileSync(resolve(PENDING_COUNT_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /getChamCongNgoai\(/, 'route không được gọi getChamCongNgoai() (full-row) nữa, chỉ getChamCongNgoaiPendingCount()');
  assert.doesNotMatch(src, /\.filter\(/, 'route không còn cần .filter() thủ công vì count đã tính ở DB/data-access layer');
  const adminIdx = src.indexOf('if (isAdminOrHR)');
  const adminBlock = src.slice(adminIdx, adminIdx + 150);
  assert.match(adminBlock, /await getChamCongNgoaiPendingCount\(\)/);
  assert.match(src, /getChamCongNgoaiPendingCount\(undefined,\s*user\.ho_ten,\s*user\.id_nhan_vien\)/, 'nhánh Quản lý phải truyền đúng qlTrucTiep=user.ho_ten VÀ excludeEmployeeId=user.id_nhan_vien (loại trừ đơn của chính mình)');
});

// ─── E. data-access.ts — new functions preserve PG→GS fallback + caching ──

test('data-access.ts: getKhachHangCrmAccessFields/getKhachHangDashboardFields đều check isPostgresEnabled(\'crm\') trước, và có try/catch fallback về getKhachHang() (GS/cached) khi PG lỗi — cùng pattern với getKhachHang()/findKhachHangById() hiện có', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  for (const fnName of ['getKhachHangCrmAccessFields', 'getKhachHangDashboardFields', 'getKhachHangHandoffPendingCount']) {
    const start = src.indexOf(`export async function ${fnName}`);
    assert.ok(start >= 0, `phải tìm thấy hàm ${fnName}`);
    const end = src.indexOf('\n}', start);
    const body = src.slice(start, end);
    assert.match(body, /isPostgresEnabled\('crm'\)/, `${fnName} phải check isPostgresEnabled('crm')`);
    assert.match(body, /catch \(e\)/, `${fnName} phải có catch fallback khi PG lỗi`);
    assert.match(body, /getKhachHang\(\)/, `${fnName} phải fallback qua getKhachHang() (đã cached cho GS), không tự đọc GS raw`);
  }
});

test('data-access.ts: getKhachHang() (full-shape, dùng bởi GS branch của /api/khach-hang + phone-dedup + telesale routes) VẪN GIỮ NGUYÊN — không bị xoá/đổi contract', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  assert.match(src, /export function getKhachHang\(\): Promise<KhachHang\[\]> \{/);
  assert.match(src, /if \(!isPostgresEnabled\('crm'\)\) return cached\('gs:kh', 30_000, \(\) => GS\.getKhachHang\(\)\);/);
});

test('data-access.ts: getChamCongNgoai() (full-shape, dùng bởi các consumer khác cần full rows) VẪN GIỮ NGUYÊN — pending-count route không còn gọi nó nhưng hàm không bị xoá', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  assert.match(src, /export function getChamCongNgoai\(\s*idNhanVien\?: string,\s*qlTrucTiep\?: string,\s*\): Promise<ChamCongNgoai\[\]> \{/);
});

test('khach-hang/route.ts: GS branch (getKhachHang() nguyên bảng) và phone-dedup (2 chỗ) không bị đụng bởi remediation này', () => {
  const src = readFileSync(resolve(KHACH_HANG_ROUTE_PATH), 'utf8');
  // Chỉ đếm lời gọi THẬT (await getKhachHang()), không tính các dòng comment
  // nhắc tới "getKhachHang()" (VD giải thích lịch sử Batch 2).
  const matches = [...src.matchAll(/await getKhachHang\(\)/g)];
  assert.equal(matches.length, 3, 'route.ts vẫn phải còn đúng 3 lời gọi THẬT getKhachHang(): GS branch GET + phone-dedup POST + phone-dedup PUT');
});

// ─── F. Postgres repository — narrow select()/count(), no full-row scan ──

test('postgresql/customer.repo.ts: findAssignmentFields()/findDashboardFields() dùng select: {...} (KHÔNG phải full findMany không select) — countByHandoffStatus() dùng count() (KHÔNG phải findMany)', () => {
  const src = readFileSync(resolve(PG_CUSTOMER_REPO_PATH), 'utf8');
  const assignIdx = src.indexOf('async findAssignmentFields()');
  const assignEnd = src.indexOf('\n  }', assignIdx);
  const assignBody = src.slice(assignIdx, assignEnd);
  assert.match(assignBody, /select:\s*\{/, 'findAssignmentFields phải dùng select projection');
  for (const field of ['telesale_phu_trach', 'sale_nhan_khach', 'sale_phu_trach', 'du_an', 'trang_thai_ban_giao']) {
    assert.match(assignBody, new RegExp(`${field}:\\s*true`), `select phải gồm field ${field}`);
  }
  assert.doesNotMatch(assignBody, /lich_su_cham_soc|lich_su_ban_giao|lead_score_/, 'findAssignmentFields KHÔNG được select các cột lịch sử/JSON không giới hạn');

  const dashIdx = src.indexOf('async findDashboardFields()');
  const dashEnd = src.indexOf('\n  }', dashIdx);
  const dashBody = src.slice(dashIdx, dashEnd);
  assert.match(dashBody, /select:\s*\{\s*nguon:\s*true,\s*sale_phu_trach:\s*true,\s*ngay_tao:\s*true\s*\}/);

  const countIdx = src.indexOf('async countByHandoffStatus');
  const countEnd = src.indexOf('\n  }', countIdx);
  const countBody = src.slice(countIdx, countEnd);
  assert.match(countBody, /prisma\.khachHang\.count\(/);
  assert.doesNotMatch(countBody, /findMany/, 'countByHandoffStatus phải dùng count(), không phải findMany() + .length');
});

test('postgresql/attendance-outside.repo.ts: countPending() dùng prisma.chamCongNgoai.count() với qlTrucTiep + loại trừ excludeEmployeeId qua id_nhan_vien: {not: ...} — KHÔNG select field hinh_anh', () => {
  const src = readFileSync(resolve(PG_ATTENDANCE_REPO_PATH), 'utf8');
  const countIdx = src.indexOf('async countPending(');
  const countEnd = src.indexOf('\n  }', countIdx);
  const countBody = src.slice(countIdx, countEnd);
  assert.match(countBody, /prisma\.chamCongNgoai\.count\(/);
  assert.match(countBody, /qlTrucTiep/);
  assert.match(countBody, /id_nhan_vien:\s*\{\s*not:\s*excludeEmployeeId\s*\}/);
  assert.doesNotMatch(countBody, /hinh_anh/, 'countPending không được đọc field hinh_anh (base64 image)');
});

// ─── G. Repository interface/index re-exports stay consistent ────────────

test('repository/interfaces.ts: ICustomerRepository khai báo đủ 3 method mới; IAttendanceOutsideRepository.countPending có đủ 3 tham số mới', () => {
  const src = readFileSync(resolve('src/lib/repository/interfaces.ts'), 'utf8');
  assert.match(src, /countByHandoffStatus\(status: string\): Promise<number>;/);
  assert.match(src, /findAssignmentFields\(\): Promise<CustomerAssignmentFields\[\]>;/);
  assert.match(src, /findDashboardFields\(\): Promise<CustomerDashboardFields\[\]>;/);
  assert.match(src, /countPending\(employeeId\?: string, qlTrucTiep\?: string, excludeEmployeeId\?: string\): Promise<number>;/);
});

test('repository/index.ts: re-export CustomerAssignmentFields/CustomerDashboardFields (cần thiết để data-access.ts import được)', () => {
  const src = readFileSync(resolve('src/lib/repository/index.ts'), 'utf8');
  assert.match(src, /CustomerAssignmentFields/);
  assert.match(src, /CustomerDashboardFields/);
});
