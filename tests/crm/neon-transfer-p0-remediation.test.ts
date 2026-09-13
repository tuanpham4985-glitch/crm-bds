import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toAssignmentFields, toDashboardSummary } from '../../src/lib/khach-hang-list-query';
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

test('toAssignmentFields: undefined optional field (telesale_phu_trach/du_an không có) vẫn giữ nguyên undefined, không tự bịa giá trị', () => {
  const kh = buildCustomer({ telesale_phu_trach: undefined, du_an: undefined });
  assert.equal(toAssignmentFields(kh).telesale_phu_trach, undefined);
  assert.equal(toAssignmentFields(kh).du_an, undefined);
});

// ─── A2. toDashboardSummary (DASHBOARD_CUSTOMER_READ_OPTIMIZATION) — aggregate
// mapper thay cho toDashboardFields() (row-per-customer) cũ. Test đúng 5 yêu
// cầu regression của task: total/unassigned/bySource/null+"Khác" merge/
// createdDates giữ nguyên ngay_tao thô cho safeParseDate() ở route.ts. ────────

test('toDashboardSummary: total = số lượng customer, không phụ thuộc field nào khác', () => {
  const rows = [buildCustomer({ id_khach_hang: 'A' }), buildCustomer({ id_khach_hang: 'B' }), buildCustomer({ id_khach_hang: 'C' })];
  assert.equal(toDashboardSummary(rows).total, 3);
});

// MINOR_REMEDIATION — schema re-verification + total===createdDates.length
// equivalence proof: ngay_tao là String NOT NULL (không @@map/relation nào
// làm lệch cardinality) nên findMany({select:{ngay_tao:true}}) không where
// LUÔN trả đúng 1 dòng/1 KhachHang — CÙNG population với count() không
// where. Test khoá invariant `total === createdDates.length` cho MỌI fixture
// (không chỉ 1 case cố định), để bất kỳ regression nào phá invariant này (VD
// thêm where/distinct vào findMany sau này) đều bị bắt.
test('SCHEMA re-verification: KhachHang.ngay_tao là String NOT NULL (không phải String?) trong prisma/schema.prisma', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const modelStart = schema.indexOf('model KhachHang {');
  const modelEnd = schema.indexOf('\n}', modelStart);
  const modelBody = schema.slice(modelStart, modelEnd);
  assert.match(modelBody, /\n\s*ngay_tao\s+String\s*\n/, 'ngay_tao phải là String NOT NULL — nếu schema đổi sang String? (nullable), invariant total===createdDates.length KHÔNG bị ảnh hưởng bởi nullability (findMany vẫn 1 dòng/row) nhưng phải re-audit assumption này nếu schema thêm relation/distinct');
});

test('total===createdDates.length invariant: toDashboardSummary() (GS path, mirror hành vi PG) giữ ĐÚNG total = createdDates.length cho MỌI fixture, kể cả rỗng', () => {
  const emptyRows: ReturnType<typeof buildCustomer>[] = [];
  assert.equal(toDashboardSummary(emptyRows).total, toDashboardSummary(emptyRows).createdDates.length);
  assert.equal(toDashboardSummary(emptyRows).total, 0);

  const rows = [buildCustomer({ id_khach_hang: 'A' }), buildCustomer({ id_khach_hang: 'B' })];
  const summary = toDashboardSummary(rows);
  assert.equal(summary.total, summary.createdDates.length);
  assert.equal(summary.total, 2);
});

test('toDashboardSummary: unassigned đếm ĐÚNG customer có sale_phu_trach rỗng (!kh.sale_phu_trach) — khớp semantics cũ (kh_chua_assign = allCustomers.filter(kh => !kh.sale_phu_trach).length)', () => {
  const rows = [
    buildCustomer({ id_khach_hang: 'A', sale_phu_trach: 'Sale A' }),
    buildCustomer({ id_khach_hang: 'B', sale_phu_trach: '' }),
    buildCustomer({ id_khach_hang: 'C', sale_phu_trach: '' }),
  ];
  assert.equal(toDashboardSummary(rows).unassigned, 2);
});

test('toDashboardSummary: bySource nhóm ĐÚNG theo giá trị nguon thô (chưa merge "Khác" — việc merge thuộc về route.ts, xem test merge riêng bên dưới)', () => {
  const rows = [
    buildCustomer({ id_khach_hang: 'A', nguon: 'Facebook' }),
    buildCustomer({ id_khach_hang: 'B', nguon: 'Facebook' }),
    buildCustomer({ id_khach_hang: 'C', nguon: 'Zalo' }),
  ];
  const summary = toDashboardSummary(rows);
  assert.deepEqual(
    [...summary.bySource].sort((a, b) => a.nguon!.localeCompare(b.nguon!)),
    [{ nguon: 'Facebook', count: 2 }, { nguon: 'Zalo', count: 1 }],
  );
});

test('toDashboardSummary: createdDates giữ NGUYÊN ngay_tao thô (không parse) — route.ts tự safeParseDate(), không đổi semantics', () => {
  const rows = [
    buildCustomer({ id_khach_hang: 'A', ngay_tao: '2026-03-05T00:00:00.000Z' }),
    buildCustomer({ id_khach_hang: 'B', ngay_tao: '01/02/2026' }),
  ];
  assert.deepEqual(toDashboardSummary(rows).createdDates, ['2026-03-05T00:00:00.000Z', '01/02/2026']);
});

test('MERGE "Khác": nguon rỗng/null VÀ nguon literal "Khác" phải gộp thành ĐÚNG 1 bucket khi áp dụng công thức `nguon || \'Khác\'` (route.ts) — không sinh 2 bucket Khác. Mirror ĐÚNG công thức thật trong dashboard/route.ts, không chỉ giả lập độc lập.', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  assert.match(src, /const key = nguon \|\| 'Khác';/, 'route.ts phải merge bySource bằng đúng công thức `nguon || \'Khác\'`');

  // Mirror: cùng công thức, áp lên fixture null (PG groupBy) + '' (GS) + 'Khác' literal.
  const bySource: { nguon: string | null; count: number }[] = [
    { nguon: null, count: 2 },
    { nguon: '', count: 1 },
    { nguon: 'Khác', count: 3 },
    { nguon: 'Facebook', count: 5 },
  ];
  const nguonMap = new Map<string, number>();
  bySource.forEach(({ nguon, count }) => {
    const key = nguon || 'Khác';
    nguonMap.set(key, (nguonMap.get(key) || 0) + count);
  });
  assert.deepEqual(Object.fromEntries(nguonMap), { Khác: 6, Facebook: 5 }, 'null + \'\' + literal "Khác" phải gộp thành đúng 1 bucket "Khác" = 2+1+3 = 6, không tách riêng');
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

// DASHBOARD_CUSTOMER_READ_OPTIMIZATION — findDashboardFields() (row-per-
// customer, 3 field, TOÀN BỘ population) đã bị thay bằng findDashboardSummary()
// (aggregate) — 3 test dưới đây thay thế 2 test cũ ở trên (đã pin allCustomers/
// getKhachHangDashboardFields, không còn đúng sau optimization này).

test('dashboard/route.ts: Promise.all dùng getKhachHangDashboardSummary() (KHÔNG phải getKhachHangDashboardFields()/getKhachHang() nguyên bảng), gated bởi isAdmin — non-admin bỏ qua hẳn query này', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /\bgetKhachHang\(\)/, 'dashboard không được gọi getKhachHang() nguyên bảng nữa');
  assert.doesNotMatch(src, /getKhachHangDashboardFields/, 'không còn dùng hàm cũ (row-per-customer)');
  const promiseAllIdx = src.indexOf('const [allPipelines, customerSummary, allEmployeesRaw');
  assert.ok(promiseAllIdx >= 0, 'tuple Promise.all phải đổi tên allCustomers -> customerSummary');
  const promiseAllBlock = src.slice(promiseAllIdx, promiseAllIdx + 400);
  assert.match(promiseAllBlock, /isAdmin\s*\n\s*\?\s*getKhachHangDashboardSummary\(\)\s*\n\s*:\s*Promise\.resolve<CustomerDashboardSummary>\(\{\s*total:\s*0,\s*unassigned:\s*0,\s*bySource:\s*\[\],\s*createdDates:\s*\[\]\s*\}\)/);
});

test('dashboard/route.ts: customerSummary chỉ được đọc qua đúng 4 field aggregate (total/unassigned/bySource/createdDates) — không còn .forEach/.filter thô trên customer rows', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /allCustomers\./, 'không còn biến allCustomers (row array) nào sót lại');
  assert.match(src, /customerSummary\.bySource\.forEach/);
  assert.match(src, /customerSummary\.unassigned/);
  assert.match(src, /customerSummary\.total/);
  assert.match(src, /customerSummary\.createdDates\.filter/);
});

test('dashboard/route.ts: kh_by_nguon tái dùng CHÍNH nguonMap đã tính cho nguon_khach_hang (không tính lại lần 2 từ customerSummary)', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /const khNguonMap/, 'khNguonMap (tính trùng lặp) phải bị loại bỏ');
  assert.match(src, /kh_by_nguon:\s*Array\.from\(nguonMap\.entries\(\)\)/);
});

test('postgresql/customer.repo.ts: findDashboardSummary() dùng ĐÚNG count({where:{sale_phu_trach:\'\'}})/groupBy({by:[\'nguon\']})/findMany({select:{ngay_tao:true}}) — KHÔNG còn count() đứng riêng cho total (MINOR_REMEDIATION) lẫn select 3 cột {nguon,sale_phu_trach,ngay_tao} không where cũ', () => {
  const src = readFileSync(resolve(PG_CUSTOMER_REPO_PATH), 'utf8');
  const idx = src.indexOf('async findDashboardSummary()');
  assert.ok(idx >= 0);
  const end = src.indexOf('\n  }', idx);
  const body = src.slice(idx, end);
  assert.doesNotMatch(body, /prisma\.khachHang\.count\(\)/, 'MINOR_REMEDIATION: count() không where (cho total) phải bị loại bỏ — createdDateRows.length đã tương đương');
  assert.match(body, /total:\s*createdDateRows\.length/, 'total phải suy ra TỪ createdDateRows.length, không phải query count() riêng');
  assert.match(body, /prisma\.khachHang\.count\(\{\s*where:\s*\{\s*sale_phu_trach:\s*''\s*\}\s*\}\)/, 'phải có count({where:{sale_phu_trach:\'\'}}) cho unassigned');
  assert.match(body, /prisma\.khachHang\.groupBy\(\{\s*by:\s*\['nguon'\],\s*_count:\s*\{\s*_all:\s*true\s*\}\s*\}\)/, 'phải có groupBy(by:[\'nguon\']) cho bySource');
  assert.match(body, /prisma\.khachHang\.findMany\(\{\s*select:\s*\{\s*ngay_tao:\s*true\s*\}\s*\}\)/, 'raw row read chỉ còn select 1 cột ngay_tao');
  const countCalls = [...body.matchAll(/prisma\.khachHang\.count\(/g)];
  assert.equal(countCalls.length, 1, 'chỉ còn ĐÚNG 1 lệnh count() (cho unassigned) — không còn count() thứ 2 cho total');
  assert.doesNotMatch(body, /select:\s*\{\s*nguon:\s*true,\s*sale_phu_trach:\s*true,\s*ngay_tao:\s*true\s*\}/, 'không còn select 3 cột cũ (không where, toàn bảng)');
  assert.doesNotMatch(body, /\$queryRaw|\$executeRaw/, 'findDashboardSummary() không dùng raw SQL');
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

test('data-access.ts: getKhachHangCrmAccessFields/getKhachHangDashboardSummary đều check isPostgresEnabled(\'crm\') trước, và có try/catch fallback về getKhachHang() (GS/cached) khi PG lỗi — cùng pattern với getKhachHang()/findKhachHangById() hiện có', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  for (const fnName of ['getKhachHangCrmAccessFields', 'getKhachHangDashboardSummary', 'getKhachHangHandoffPendingCount']) {
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

test('postgresql/customer.repo.ts: findAssignmentFields() dùng select: {...} (KHÔNG phải full findMany không select) — countByHandoffStatus() dùng count() (KHÔNG phải findMany)', () => {
  const src = readFileSync(resolve(PG_CUSTOMER_REPO_PATH), 'utf8');
  const assignIdx = src.indexOf('async findAssignmentFields()');
  const assignEnd = src.indexOf('\n  }', assignIdx);
  const assignBody = src.slice(assignIdx, assignEnd);
  assert.match(assignBody, /select:\s*\{/, 'findAssignmentFields phải dùng select projection');
  for (const field of ['telesale_phu_trach', 'sale_nhan_khach', 'sale_phu_trach', 'du_an', 'trang_thai_ban_giao']) {
    assert.match(assignBody, new RegExp(`${field}:\\s*true`), `select phải gồm field ${field}`);
  }
  assert.doesNotMatch(assignBody, /lich_su_cham_soc|lich_su_ban_giao|lead_score_/, 'findAssignmentFields KHÔNG được select các cột lịch sử/JSON không giới hạn');
  // findDashboardSummary() (count/count-where/groupBy/narrow findMany) có test
  // riêng ở phần C (DASHBOARD_CUSTOMER_READ_OPTIMIZATION) phía trên.

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
  assert.match(src, /findDashboardSummary\(\): Promise<CustomerDashboardSummary>;/);
  assert.match(src, /countPending\(employeeId\?: string, qlTrucTiep\?: string, excludeEmployeeId\?: string\): Promise<number>;/);
});

test('repository/index.ts: re-export CustomerAssignmentFields/CustomerDashboardSummary (cần thiết để data-access.ts import được)', () => {
  const src = readFileSync(resolve('src/lib/repository/index.ts'), 'utf8');
  assert.match(src, /CustomerAssignmentFields/);
  assert.match(src, /CustomerDashboardSummary/);
});
