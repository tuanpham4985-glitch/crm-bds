// "Doanh số tính du lịch" — quy tắc kinh doanh cho chương trình thưởng du
// lịch, tính THUẦN (không đụng Sheets API) từ TongHopRow đã có sẵn
// (getTongHopGiaoDich, google-sheets.ts — sheet "Tổng hợp giao dịch chi
// tiết"). Locked business rule, xác nhận qua audit đối chiếu offline với
// tab "TH Doanh số sale đạt du lịch 20[26]" trong workbook Excel do user
// cung cấp làm ORACLE/golden reference (KHÔNG phải nguồn production — sheet
// Google Sheets sống qua getTongHopGiaoDich() vẫn là data authority thật):
//   - Group by: sale_phu_trach ("Sale bán")
//   - Value: gia_tri ("Giá tính HH (Chưa gồm VAT & KPBT)")
//   - Eligible CHỈ KHI: ty_le_phi_hh_thuc_nhan <= 70% (literal rule — KHÔNG
//     có điều kiện > 0, xem giải thích dưới isTravelSalesEligible)
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
 * 1 deal có tính vào "Doanh số tính du lịch" hay không.
 *
 * Rule literal: "Tỷ lệ phí hh/thực nhận <= 70%" — KHÔNG có điều kiện > 0.
 * Semantics của ty_le_phi_hh_thuc_nhan đã audit riêng, đối chiếu với tab
 * tham chiếu "TH Doanh số sale đạt du lịch" (workbook Excel — golden
 * reference, không phải nguồn production):
 *   - Ô TRỐNG/không parse được -> getTongHopGiaoDich() gán `undefined`
 *     (guard trước khi gọi num(), KHÔNG để num() tự trả 0 cho ô trống — xem
 *     google-sheets.ts) -> ở đây `undefined` LUÔN KHÔNG eligible: không có
 *     ratio để so sánh <=70%, không suy đoán đạt hay không đạt. Verified:
 *     4 deal thật có ô trống — coi trống là eligible làm tổng theo Sale
 *     LỆCH khỏi tab tham chiếu (13/18 sale khớp chính xác khi loại trống,
 *     giảm còn 10/18 khi tính cả trống — loại trống là đúng).
 *   - Ratio parse RA ĐÚNG SỐ 0 (VD ô thật sự ghi "0%") -> 0<=70% đúng theo
 *     rule literal -> ELIGIBLE. KHÔNG suy diễn thêm "0% nghĩa là chưa có dữ
 *     liệu" — đó là giả định không có trong rule đã khoá, và dữ liệu thật
 *     không có ca nào để verify riêng (chỉ có ca TRỐNG, đã xử lý ở trên).
 *   - Non-numeric text (VD "N/A") mà sau khi loại ký tự không phải
 *     số/,/./- còn lại rỗng -> num() hiện trả 0 (giới hạn chung của num(),
 *     dùng chung cho nhiều field khác trong repo, KHÔNG sửa riêng cho field
 *     này) -> xử lý giống ratio=0 thật (ELIGIBLE nếu <=70%) — không có dữ
 *     liệu thật kiểu này trong workbook để verify khác đi.
 *   - "70%"/"0.7"/"0.70" (có hoặc không dấu %) đều parse đúng về cùng 1 tỷ lệ
 *     0-1 qua num() (xem google-sheets.ts#num) — verified khớp dữ liệu thật
 *     (VD "86.25%", "50.00%", "58.82%").
 *
 * Golden case: 1/4 deal của Trần Võ Khánh có tỷ lệ 86.25% > 70% -> loại, 3
 * deal còn lại (50.00%/58.82%/50.00%) -> tính, tổng = 40.451.280.122.
 */
export function isTravelSalesEligible(row: TravelSalesEligibilityInput): boolean {
  if (!row.gia_tri || row.gia_tri <= 0) return false;
  if (isDoiTacStr(row.loai_nguon) || isDoiTacStr(row.phong_kd)) return false;
  const ratio = row.ty_le_phi_hh_thuc_nhan;
  return typeof ratio === 'number' && ratio <= 0.70;
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
