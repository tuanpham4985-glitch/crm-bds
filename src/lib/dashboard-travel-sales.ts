// "Doanh số tính du lịch" — quy tắc kinh doanh cho chương trình thưởng du
// lịch, tính THUẦN (không đụng Sheets API) từ TongHopRow đã có sẵn
// (getTongHopGiaoDich, google-sheets.ts — sheet "Tổng hợp giao dịch chi
// tiết"). Locked business rule, xác nhận qua audit đối chiếu offline với
// tab "TH Doanh số sale đạt du lịch 20[26]" trong workbook Excel do user
// cung cấp làm ORACLE/golden reference (KHÔNG phải nguồn production — sheet
// Google Sheets sống qua getTongHopGiaoDich() vẫn là data authority thật):
//   - Group by: sale_phu_trach ("Sale bán")
//   - Value: gia_tri ("Giá tính HH (Chưa gồm VAT & KPBT)")
//   - Eligible CHỈ KHI: 0% < ty_le_phi_hh_thuc_nhan <= 70%
//   - Loại: Đối tác (qua loai_nguon/phong_kd, cùng check "đối tác" hiện có
//     trong dashboard/route.ts#isDoiTacStr — không phát minh rule mới)
// KHÔNG lọc theo năm: tab đối chiếu không có cột ngày/năm nào, và tổng khớp
// CHÍNH XÁC với golden case khi tính trên TOÀN BỘ dòng hợp lệ, không giới
// hạn khoảng thời gian — xem tests/crm/dashboard-travel-sales.test.ts.
import type { DoanhThuTheoSale } from './types';
import type { TongHopRow } from './google-sheets';

function isDoiTacStr(s: string | undefined | null): boolean {
  return (s || '').toLowerCase().includes('đối tác');
}

export type TravelSalesEligibilityInput = Pick<TongHopRow, 'gia_tri' | 'loai_nguon' | 'phong_kd' | 'ty_le_phi_hh_thuc_nhan'>;

/**
 * 1 deal có tính vào "Doanh số tính du lịch" hay không. ty_le_phi_hh_thuc_nhan
 * undefined/0/>70% -> KHÔNG tính — deal thiếu dữ liệu tỷ lệ KHÔNG được suy
 * đoán là đạt hay không đạt (an toàn, đúng với golden case: 1/4 deal của
 * Trần Võ Khánh có tỷ lệ 86.25% > 70% -> loại, 3 deal còn lại -> tính).
 */
export function isTravelSalesEligible(row: TravelSalesEligibilityInput): boolean {
  if (!row.gia_tri || row.gia_tri <= 0) return false;
  if (isDoiTacStr(row.loai_nguon) || isDoiTacStr(row.phong_kd)) return false;
  const ratio = row.ty_le_phi_hh_thuc_nhan;
  return typeof ratio === 'number' && ratio > 0 && ratio <= 0.70;
}

/** Tổng hợp "Doanh số tính du lịch" theo Sale — page-agnostic, nhận
 * TongHopRow[] đã fetch sẵn (KHÔNG tự gọi getTongHopGiaoDich() — caller tự
 * fetch 1 lần, tránh tạo datasource thứ 2 song song với leaderboard hiện có). */
export function buildTravelSalesLeaderboard(rows: readonly TongHopRow[]): DoanhThuTheoSale[] {
  const map = new Map<string, DoanhThuTheoSale>();
  for (const row of rows) {
    if (!isTravelSalesEligible(row)) continue;
    const key = (row.sale_phu_trach || '').trim() || 'Chưa phân';
    const existing = map.get(key) || { nhan_vien: key, doanh_thu: 0, hoa_hong: 0, so_deal: 0 };
    existing.doanh_thu += row.gia_tri;
    existing.so_deal += 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.doanh_thu - a.doanh_thu);
}
