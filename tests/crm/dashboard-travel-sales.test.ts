import assert from 'node:assert/strict';
import test from 'node:test';
import { isTravelSalesEligible, buildTravelSalesLeaderboard } from '../../src/lib/dashboard-travel-sales';
import type { TongHopRow } from '../../src/lib/google-sheets';

function row(overrides: Partial<TongHopRow> & Pick<TongHopRow, 'gia_tri' | 'sale_phu_trach'>): TongHopRow {
  return {
    du_an: 'Dự án X', loai_hinh: '', loai_nguon: '', chi_nhanh: '', phong_kd: 'VIC-02',
    ngay_ky: '01/01/2026', ngay_coc: '01/01/2026',
    ...overrides,
  };
}

// ─── Golden regression case (task hiện tại) ─────────────────────────────────
// Trần Võ Khánh — 4 deal thật, copy nguyên văn từ sheet "Tổng hợp giao dịch
// chi tiết" (workbook Excel do user cung cấp làm golden reference, đối chiếu
// khớp CHÍNH XÁC với tab "TH Doanh số sale đạt du lịch 20[26]"):
//   1. Eco Retreat            18.143.762.754  ty_le=86.25% -> LOẠI (>70%)
//   2. Masteri Cosmo Central  14.145.680.367  ty_le=50.00% -> tính
//   3. Vinhomes Saigon Park   18.651.986.282  ty_le=58.82% -> tính
//   4. Vinhomes Saigon Park    7.653.613.473  ty_le=50.00% -> tính
// Expected: 3 deal hợp lệ, tổng = 40.451.280.122 (khoá cứng theo golden case).
const KHANH_DEALS: TongHopRow[] = [
  row({ du_an: 'Eco Retreat', gia_tri: 18_143_762_754, sale_phu_trach: 'Trần Võ Khánh', ty_le_phi_hh_thuc_nhan: 0.8625 }),
  row({ du_an: 'Masteri Cosmo Central', gia_tri: 14_145_680_367, sale_phu_trach: 'Trần Võ Khánh', ty_le_phi_hh_thuc_nhan: 0.50 }),
  row({ du_an: 'Vinhomes Saigon Park', gia_tri: 18_651_986_282, sale_phu_trach: 'Trần Võ Khánh', ty_le_phi_hh_thuc_nhan: 0.5882 }),
  row({ du_an: 'Vinhomes Saigon Park', gia_tri: 7_653_613_473, sale_phu_trach: 'Trần Võ Khánh', ty_le_phi_hh_thuc_nhan: 0.50 }),
];

test('GOLDEN CASE — Trần Võ Khánh: 3/4 deal hợp lệ, tổng = 40.451.280.122 (khoá theo audit đối chiếu Excel + tab tham chiếu)', () => {
  const eligible = KHANH_DEALS.filter(isTravelSalesEligible);
  assert.equal(eligible.length, 3);
  const sum = eligible.reduce((s, r) => s + r.gia_tri, 0);
  assert.equal(sum, 40_451_280_122);
});

test('GOLDEN CASE qua buildTravelSalesLeaderboard: entry "Trần Võ Khánh" so_deal=3, doanh_thu=40.451.280.122', () => {
  const result = buildTravelSalesLeaderboard(KHANH_DEALS);
  const entry = result.find(r => r.nhan_vien === 'Trần Võ Khánh');
  assert.ok(entry);
  assert.equal(entry!.so_deal, 3);
  assert.equal(entry!.doanh_thu, 40_451_280_122);
});

test('GOLDEN CASE: deal có ty_le=86.25% (>70%) bị loại — không lẫn vào tổng', () => {
  const excludedDeal = KHANH_DEALS[0];
  assert.equal(isTravelSalesEligible(excludedDeal), false);
});

// ─── isTravelSalesEligible — biên & edge case ───────────────────────────────

test('isTravelSalesEligible: ty_le đúng 70% -> eligible (biên <=70% là inclusive)', () => {
  assert.equal(isTravelSalesEligible(row({ gia_tri: 1000, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0.70 })), true);
});

test('isTravelSalesEligible: ty_le 70.01% -> KHÔNG eligible (vượt biên)', () => {
  assert.equal(isTravelSalesEligible(row({ gia_tri: 1000, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0.7001 })), false);
});

test('isTravelSalesEligible: ty_le_phi_hh_thuc_nhan = undefined (sheet không có cột, hoặc ô TRỐNG — getTongHopGiaoDich guard trước num(), KHÔNG để num() tự trả 0 cho ô trống) -> KHÔNG eligible, không suy đoán (verified: coi trống là eligible làm sai lệch khỏi tab tham chiếu, xem comment trong dashboard-travel-sales.ts)', () => {
  assert.equal(isTravelSalesEligible(row({ gia_tri: 1000, sale_phu_trach: 'A' })), false);
});

test('isTravelSalesEligible: ty_le_phi_hh_thuc_nhan = 0 (ratio PARSE ĐƯỢC, khác undefined/ô trống) -> ELIGIBLE — rule literal "<=70%" không có điều kiện >0, KHÔNG tự invent thêm điều kiện (correction so với bản trước — xem final report)', () => {
  assert.equal(isTravelSalesEligible(row({ gia_tri: 1000, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0 })), true);
});

test('isTravelSalesEligible: phân biệt RÕ undefined (ô trống, loại) và 0 (ratio thật, tính) — 2 giá trị KHÔNG được xử lý giống nhau', () => {
  const blank = row({ gia_tri: 1000, sale_phu_trach: 'A' }); // ty_le_phi_hh_thuc_nhan omitted = undefined
  const zero = row({ gia_tri: 1000, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0 });
  assert.equal(isTravelSalesEligible(blank), false);
  assert.equal(isTravelSalesEligible(zero), true);
});

test('isTravelSalesEligible: gia_tri <= 0 -> KHÔNG eligible dù ty_le hợp lệ', () => {
  assert.equal(isTravelSalesEligible(row({ gia_tri: 0, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0.5 })), false);
  assert.equal(isTravelSalesEligible(row({ gia_tri: -100, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0.5 })), false);
});

test('isTravelSalesEligible: Đối tác qua phong_kd -> KHÔNG eligible dù ty_le hợp lệ', () => {
  assert.equal(isTravelSalesEligible(row({ gia_tri: 1000, sale_phu_trach: 'Căn hộ +', phong_kd: 'Đối tác', ty_le_phi_hh_thuc_nhan: 0.5 })), false);
});

test('isTravelSalesEligible: Đối tác qua loai_nguon -> KHÔNG eligible dù ty_le hợp lệ', () => {
  assert.equal(isTravelSalesEligible(row({ gia_tri: 1000, sale_phu_trach: 'A', loai_nguon: 'Đối tác', phong_kd: 'VIC-01', ty_le_phi_hh_thuc_nhan: 0.5 })), false);
});

// ─── buildTravelSalesLeaderboard — group/aggregate ──────────────────────────

test('buildTravelSalesLeaderboard: gộp nhiều deal của cùng 1 Sale, sort giảm dần theo doanh_thu', () => {
  const rows = [
    row({ gia_tri: 5_000_000_000, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0.5 }),
    row({ gia_tri: 3_000_000_000, sale_phu_trach: 'A', ty_le_phi_hh_thuc_nhan: 0.5 }),
    row({ gia_tri: 6_000_000_000, sale_phu_trach: 'B', ty_le_phi_hh_thuc_nhan: 0.5 }),
  ];
  const result = buildTravelSalesLeaderboard(rows);
  // A gộp 2 deal = 8 tỷ (> B = 6 tỷ) -> A đứng trước.
  assert.deepEqual(result.map(r => r.nhan_vien), ['A', 'B']);
  assert.equal(result[0].doanh_thu, 8_000_000_000);
  assert.equal(result[0].so_deal, 2);
});

test('buildTravelSalesLeaderboard: sale_phu_trach rỗng -> "Chưa phân" (KHÔNG throw, không bỏ sót deal)', () => {
  const result = buildTravelSalesLeaderboard([row({ gia_tri: 1000, sale_phu_trach: '', ty_le_phi_hh_thuc_nhan: 0.5 })]);
  assert.equal(result[0].nhan_vien, 'Chưa phân');
});

test('buildTravelSalesLeaderboard: mảng rỗng -> mảng rỗng, không throw', () => {
  assert.deepEqual(buildTravelSalesLeaderboard([]), []);
});

test('buildTravelSalesLeaderboard: deal Đối tác bị loại không tạo entry rác trong kết quả', () => {
  const result = buildTravelSalesLeaderboard([
    row({ gia_tri: 1000, sale_phu_trach: 'Đối tác X', phong_kd: 'Đối tác', ty_le_phi_hh_thuc_nhan: 0.5 }),
  ]);
  assert.deepEqual(result, []);
});
