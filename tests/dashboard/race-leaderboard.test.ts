import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTravelSalesLeaderboard, applyLeaderboardDisplayRules } from '../../src/lib/dashboard-travel-sales';
import type { TongHopRow } from '../../src/lib/google-sheets';
import type { NhanVien, DoanhThuTheoSale } from '../../src/lib/types';

// DASHBOARD_RACE_LEADERBOARD_LIGHTWEIGHT_ENDPOINT — regression proof rằng
// endpoint mới /api/dashboard/leaderboard tính ra ĐÚNG cùng kết quả với logic
// "Bảng xếp hạng" mặc định (reportMode='default') của /api/dashboard cũ,
// bằng CHÍNH authoritative helper applyLeaderboardDisplayRules() (không phải
// bản copy song song) + chứng minh endpoint mới KHÔNG kéo theo Customer
// summary/Pipeline/CongViec/HopDong/NhanSuReport.

const LEADERBOARD_ROUTE_PATH = 'src/app/api/dashboard/leaderboard/route.ts';
const DASHBOARD_ROUTE_PATH = 'src/app/api/dashboard/route.ts';
const PAGE_PATH = 'src/app/page.tsx';

function row(overrides: Partial<TongHopRow> & Pick<TongHopRow, 'gia_tri' | 'sale_phu_trach'>): TongHopRow {
  return {
    du_an: 'Dự án X', loai_hinh: '', loai_nguon: '', chi_nhanh: '', phong_kd: 'VIC-02',
    ngay_ky: '01/01/2026', ngay_coc: '01/01/2026',
    ...overrides,
  };
}

function nhanVien(overrides: Partial<NhanVien> & Pick<NhanVien, 'id_nhan_vien' | 'ho_ten'>): NhanVien {
  return {
    so_dien_thoai: '', email: '', vai_tro: 'Sale', employee_type: 'Sale', trang_thai: 'Chính thức',
    ngay_tao: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── A. applyLeaderboardDisplayRules() — behavior thật ─────────────────────

test('applyLeaderboardDisplayRules: loại đúng nhân viên "Nghỉ việc" và "CTV" khỏi bảng xếp hạng', () => {
  const rows: TongHopRow[] = [
    row({ gia_tri: 1_000_000, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0.5 }),
    row({ gia_tri: 2_000_000, sale_phu_trach: 'B', ty_le_phi_hh_thuc_nhan: 0.5 }),
    row({ gia_tri: 3_000_000, sale_phu_trach: 'C', ty_le_phi_hh_thuc_nhan: 0.5 }),
  ];
  const employees: NhanVien[] = [
    nhanVien({ id_nhan_vien: '1', ho_ten: 'A', trang_thai: 'Chính thức' }),
    nhanVien({ id_nhan_vien: '2', ho_ten: 'B', trang_thai: 'Nghỉ việc' }),
    nhanVien({ id_nhan_vien: '3', ho_ten: 'C', trang_thai: 'CTV' }),
  ];
  const result = applyLeaderboardDisplayRules(buildTravelSalesLeaderboard(rows), employees);
  assert.deepEqual(result.map(r => r.nhan_vien), ['A']);
});

test('applyLeaderboardDisplayRules: enrich avatar_url từ NhanVien đang làm (trang_thai !== "Nghỉ việc"), giữ nguyên entry nếu không tìm thấy hoặc không có avatar_url', () => {
  const rows: TongHopRow[] = [
    row({ gia_tri: 1_000_000, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0.5 }),
    row({ gia_tri: 1_000_000, sale_phu_trach: 'B', ty_le_phi_hh_thuc_nhan: 0.5 }),
  ];
  const employees: NhanVien[] = [
    nhanVien({ id_nhan_vien: '1', ho_ten: 'A', trang_thai: 'Chính thức', avatar_url: 'https://x/a.png' }),
    nhanVien({ id_nhan_vien: '2', ho_ten: 'B', trang_thai: 'Chính thức' }),
  ];
  const result = applyLeaderboardDisplayRules(buildTravelSalesLeaderboard(rows), employees);
  assert.equal(result.find(r => r.nhan_vien === 'A')?.avatar_url, 'https://x/a.png');
  assert.equal(result.find(r => r.nhan_vien === 'B')?.avatar_url, undefined);
});

test('applyLeaderboardDisplayRules: entry "Chưa phân" (deal chưa gán sale) KHÔNG bị tra avatar/loại — luôn giữ nguyên', () => {
  const rows: TongHopRow[] = [row({ gia_tri: 1_000_000, sale_phu_trach: '', ty_le_phi_hh_thuc_nhan: 0.5 })];
  const result = applyLeaderboardDisplayRules(buildTravelSalesLeaderboard(rows), []);
  assert.deepEqual(result.map(r => r.nhan_vien), ['Chưa phân']);
  assert.equal(result[0].avatar_url, undefined);
});

test('applyLeaderboardDisplayRules: khi 1 employee trùng ho_ten với entry bị loại (VD "Nghỉ việc") thì entry đó bị loại HOÀN TOÀN khỏi kết quả (đúng rule cũ: excludedNames match theo tên, không phân biệt nhiều nhân viên trùng tên)', () => {
  const rows: TongHopRow[] = [row({ gia_tri: 1_000_000, sale_phu_trach: 'Trùng Tên', ty_le_phi_hh_thuc_nhan: 0.5 })];
  const employees: NhanVien[] = [
    nhanVien({ id_nhan_vien: '1', ho_ten: 'Trùng Tên', trang_thai: 'Nghỉ việc', avatar_url: 'https://x/old.png' }),
    nhanVien({ id_nhan_vien: '2', ho_ten: 'Trùng Tên', trang_thai: 'Chính thức', avatar_url: 'https://x/new.png' }),
  ];
  const result = applyLeaderboardDisplayRules(buildTravelSalesLeaderboard(rows), employees);
  assert.deepEqual(result, []);
});

test('applyLeaderboardDisplayRules: giữ nguyên ordering (doanh_thu giảm dần) và shape (so_deal/doanh_thu/hoa_hong) từ buildTravelSalesLeaderboard() — chỉ thêm/bớt entry + avatar_url, không đổi field khác', () => {
  const rows: TongHopRow[] = [
    row({ gia_tri: 5_000_000, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0.5 }),
    row({ gia_tri: 9_000_000, sale_phu_trach: 'B', ty_le_phi_hh_thuc_nhan: 0.5 }),
  ];
  const employees: NhanVien[] = [
    nhanVien({ id_nhan_vien: '1', ho_ten: 'A' }),
    nhanVien({ id_nhan_vien: '2', ho_ten: 'B' }),
  ];
  const result = applyLeaderboardDisplayRules(buildTravelSalesLeaderboard(rows), employees);
  assert.deepEqual(result.map(r => r.nhan_vien), ['B', 'A']);
  assert.equal(result.find(r => r.nhan_vien === 'A')?.so_deal, 1);
});

// ─── B. Equivalence: NEW helper vs an independent mirror of the OLD inline
// logic that used to live directly in dashboard/route.ts (byte-for-byte
// reproduction of what was replaced), proving the extraction changed nothing. ──

function oldInlineLogic(rows: TongHopRow[], allEmployeesRaw: NhanVien[]): DoanhThuTheoSale[] {
  const allEmployees = allEmployeesRaw.filter(nv => nv.trang_thai !== 'Nghỉ việc');
  const leaderboardExcludedNames = new Set(
    allEmployeesRaw
      .filter(nv => nv.trang_thai === 'Nghỉ việc' || nv.trang_thai === 'CTV')
      .map(nv => nv.ho_ten)
  );
  return buildTravelSalesLeaderboard(rows)
    .filter(entry => !leaderboardExcludedNames.has(entry.nhan_vien))
    .map(entry => {
      if (entry.nhan_vien === 'Chưa phân') return entry;
      const emp = allEmployees.find(nv => nv.ho_ten === entry.nhan_vien);
      return emp?.avatar_url ? { ...entry, avatar_url: emp.avatar_url } : entry;
    });
}

test('EQUIVALENCE: applyLeaderboardDisplayRules() cho kết quả byte-identical với logic inline cũ (values/ordering/shape/excluded names/avatar) trên cùng fixture', () => {
  const rows: TongHopRow[] = [
    row({ gia_tri: 18_143_762_754, sale_phu_trach: 'Trần Võ Khánh', ty_le_phi_hh_thuc_nhan: 0.8625 }),
    row({ gia_tri: 14_145_680_367, sale_phu_trach: 'Trần Võ Khánh', ty_le_phi_hh_thuc_nhan: 0.50 }),
    row({ gia_tri: 5_000_000, sale_phu_trach: 'Nghỉ Rồi', ty_le_phi_hh_thuc_nhan: 0.5 }),
    row({ gia_tri: 4_000_000, sale_phu_trach: 'Cộng Tác Viên', ty_le_phi_hh_thuc_nhan: 0.5 }),
    row({ gia_tri: 3_000_000, sale_phu_trach: '', ty_le_phi_hh_thuc_nhan: 0.5 }),
  ];
  const employees: NhanVien[] = [
    nhanVien({ id_nhan_vien: '1', ho_ten: 'Trần Võ Khánh', trang_thai: 'Chính thức', avatar_url: 'https://x/khanh.png' }),
    nhanVien({ id_nhan_vien: '2', ho_ten: 'Nghỉ Rồi', trang_thai: 'Nghỉ việc' }),
    nhanVien({ id_nhan_vien: '3', ho_ten: 'Cộng Tác Viên', trang_thai: 'CTV' }),
  ];
  const expected = oldInlineLogic(rows, employees);
  const actual = applyLeaderboardDisplayRules(buildTravelSalesLeaderboard(rows), employees);
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual.map(r => r.nhan_vien), ['Trần Võ Khánh', 'Chưa phân']);
});

// ─── C. Structural — new endpoint does NOT pull in full Dashboard aggregation ─

test('leaderboard/route.ts: KHÔNG import/gọi getKhachHangDashboardSummary/getPipeline/getCongViec/getHopDong/getDataNhanSuForReport trong CODE (chỉ được phép nhắc trong comment) — chỉ getTongHopGiaoDich + getNhanVien', () => {
  const src = readFileSync(resolve(LEADERBOARD_ROUTE_PATH), 'utf8');
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const fnName of ['getKhachHangDashboardSummary', 'getPipeline', 'getCongViec', 'getHopDong', 'getDataNhanSuForReport']) {
    assert.doesNotMatch(code, new RegExp(fnName), `leaderboard endpoint không được dùng ${fnName}`);
  }
  assert.match(code, /getTongHopGiaoDich/);
  assert.match(code, /getNhanVien/);
});

test('leaderboard/route.ts: response shape {success, data} thẳng — KHÔNG wrap DashboardData (không có key kpi/pipeline_funnel/crm_totals nào được set trong CODE, chỉ được phép nhắc trong comment)', () => {
  const src = readFileSync(resolve(LEADERBOARD_ROUTE_PATH), 'utf8');
  assert.match(src, /NextResponse\.json\(\{\s*success:\s*true,\s*data:\s*leaderboard\s*\}\)/);
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const key of ['kpi:', 'pipeline_funnel', 'crm_totals']) {
    assert.doesNotMatch(code, new RegExp(key));
  }
});

test('leaderboard/route.ts: dùng CHÍNH applyLeaderboardDisplayRules/buildTravelSalesLeaderboard từ @/lib/dashboard-travel-sales — không tự viết lại rule loại/enrich', () => {
  const src = readFileSync(resolve(LEADERBOARD_ROUTE_PATH), 'utf8');
  assert.match(src, /import \{ buildTravelSalesLeaderboard, applyLeaderboardDisplayRules \} from '@\/lib\/dashboard-travel-sales';/);
  assert.doesNotMatch(src, /leaderboardExcludedNames|trang_thai === 'Nghỉ việc'/, 'không được tự viết lại inline exclude/enrich logic — phải gọi helper');
});

test('dashboard/route.ts: travelSalesLeaderboard giờ gọi applyLeaderboardDisplayRules() (CÙNG helper với endpoint mới) — không còn 2 bản logic song song', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  assert.match(src, /import \{ buildTravelSalesLeaderboard, applyLeaderboardDisplayRules \} from '@\/lib\/dashboard-travel-sales';/);
  assert.match(src, /const travelSalesLeaderboard = applyLeaderboardDisplayRules\(buildTravelSalesLeaderboard\(tongHopRows\), allEmployeesRaw\);/);
});

test('dashboard/route.ts: allEmployees/leaderboardExcludedNames vẫn tồn tại (còn dùng cho sinhNhatThangNay + Pipeline-based leaderboard ở reportMode="standard") — KHÔNG bị xoá nhầm khi extract', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  assert.match(src, /const allEmployees = allEmployeesRaw\.filter\(nv => nv\.trang_thai !== 'Nghỉ việc'\);/);
  assert.match(src, /const leaderboardExcludedNames = new Set\(/);
});

test('dashboard/route.ts: getKhachHangDashboardSummary/getPipeline/Promise.all wiring (Customer Read Optimization, b1c8608) KHÔNG bị rollback bởi task này', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  assert.match(src, /isAdmin\s*\n\s*\?\s*getKhachHangDashboardSummary\(\)\s*\n\s*:\s*Promise\.resolve<CustomerDashboardSummary>\(\{\s*total:\s*0,\s*unassigned:\s*0,\s*bySource:\s*\[\],\s*createdDates:\s*\[\]\s*\}\)/);
});

// ─── D. Frontend wiring ─────────────────────────────────────────────────────

test('page.tsx: race fetch trỏ tới /api/dashboard/leaderboard (KHÔNG còn /api/dashboard?...) và set raceData TRỰC TIẾP từ result.data (không phải .doanh_thu_theo_sale)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /fetch\(`\/api\/dashboard\/leaderboard\?from=\$\{RACE_START_DATE\}&to=\$\{today\}`\)/);
  assert.match(src, /setRaceData\(result\.data\)/);
  assert.doesNotMatch(src, /fetch\(`\/api\/dashboard\?from=\$\{RACE_START_DATE\}/, 'race fetch không còn gọi /api/dashboard nguyên route cũ');
});

test('page.tsx: request A (fetchData) vẫn gọi /api/dashboard nguyên vẹn, và fallback raceData ?? data.doanh_thu_theo_sale không đổi', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /const res = await fetch\(`\/api\/dashboard\?\$\{params\}`\);/);
  assert.match(src, /raceData \?\? data\.doanh_thu_theo_sale/);
});

// ─── E. Auth parity (DASHBOARD_RACE_LEADERBOARD_LIGHTWEIGHT_ENDPOINT gate 1) ─
//
// /api/dashboard's GET handler has NO hard session/auth gate: getIsAdmin()
// reads the crm_session cookie and returns false (not a 401/error) when the
// cookie is absent or unparseable — session presence only changes whether
// isAdmin is true, which only changes RESPONSE CONTENT (extra admin-only
// fields), never whether the request is served at all. Both the isAdmin and
// non-admin response branches include `doanh_thu_theo_sale` — so today, an
// unauthenticated request to /api/dashboard already receives the leaderboard
// field with no session required. The new /api/dashboard/leaderboard
// endpoint must match this exact boundary (no stricter, no looser) — proven
// here by asserting NEITHER route uses the strict getCrmSessionUser() + 401
// pattern this repo uses elsewhere for protected write/CRM-domain routes
// (see tests/crm/private-group-api.test.ts for that pattern in use).

test('AUTH PARITY: dashboard/route.ts KHÔNG có hard auth gate (không getCrmSessionUser()/401) — chỉ getIsAdmin() đọc cookie mềm, không session vẫn được phục vụ như non-admin', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /getCrmSessionUser/, '/api/dashboard không dùng getCrmSessionUser() — xác nhận không có gate 401 kiểu route ghi/CRM khác');
  assert.doesNotMatch(src, /status:\s*401/, '/api/dashboard không trả 401 cho bất kỳ trường hợp thiếu session nào');
  assert.match(src, /if \(!session\) return false;/, 'getIsAdmin() phải trả false (không throw/401) khi thiếu cookie session');
});

test('AUTH PARITY: leaderboard/route.ts KHÔNG thêm gate chặt hơn (không getCrmSessionUser()/401) — đúng cùng mức mở với /api/dashboard cho field doanh_thu_theo_sale', () => {
  const src = readFileSync(resolve(LEADERBOARD_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /getCrmSessionUser/, 'leaderboard endpoint không được tự thêm gate getCrmSessionUser()/401 mới — sẽ SIẾT quyền truy cập so với /api/dashboard hiện tại');
  assert.doesNotMatch(src, /status:\s*401/);
});

test('AUTH PARITY: cả 2 nhánh response /api/dashboard (isAdmin true/false) đều set doanh_thu_theo_sale — xác nhận field này chưa từng bị giới hạn theo vai trò, isAdmin chỉ đổi NỘI DUNG response chứ không đổi quyền truy cập request', () => {
  const src = readFileSync(resolve(DASHBOARD_ROUTE_PATH), 'utf8');
  const matches = src.match(/doanh_thu_theo_sale:\s*selectedLeaderboard,/g) || [];
  assert.equal(matches.length, 2, 'phải có ĐÚNG 2 chỗ set doanh_thu_theo_sale (nhánh admin + nhánh non-admin)');
});
