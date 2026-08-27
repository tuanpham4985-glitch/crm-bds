// Campaign Sale CSKH model — không có role "Telesale" riêng trong hệ thống
// (xem VAI_TRO trong constants.ts: chỉ 'Admin' | 'HR' | 'Sale'). Người thực
// hiện Campaign CSKH luôn là nhân viên vai_tro 'Sale' đang hoạt động.
//
// Module THUẦN (không import next/headers) để dùng được ở CẢ server
// (crm-auth.ts re-export) LẪN client component ('use client') — cùng lý do
// tách campaign-cskh-authority.ts trước đó.
import type { DuAn, NhanVien } from './types';

export const NO_SALE_SCOPE_REASON = 'Campaign chưa có phạm vi Sale được cấu hình. Vui lòng liên hệ Admin hoặc gắn Dự án có danh sách Sale.';

export function isActiveSale(employee: Pick<NhanVien, 'vai_tro' | 'trang_thai'>): boolean {
  return employee.vai_tro === 'Sale' && employee.trang_thai !== 'Nghỉ việc';
}

function parseSaleRoster(raw?: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : null;
  } catch {
    return null;
  }
}

/**
 * Kết quả xác định phạm vi Sale hợp lệ cho 1 Campaign.
 * - blocked=true: KHÔNG có roster đáng tin cậy nào cho actor không phải Admin
 *   — actor này KHÔNG được phân/chọn Sale, kèm lý do tiếng Việt hiển thị ra UI.
 *   Đây là hành vi ĐÚNG theo kiến trúc đã duyệt: "nếu không xác định được
 *   phạm vi Leader→Sale một cách đáng tin cậy thì KHÔNG được tự suy diễn."
 * - blocked=false, scoped=false: không bị thu hẹp (luôn là Admin) — sales =
 *   toàn bộ Sale đang hoạt động trong công ty.
 * - blocked=false, scoped=true: đã thu hẹp theo đúng roster Dự án liên kết —
 *   sales = giao của roster đó với Sale đang hoạt động (có thể rỗng nếu
 *   roster gồm toàn nhân viên đã nghỉ việc — vẫn là trạng thái hợp lệ, không
 *   phải "blocked", chỉ đơn giản là chưa có ai khớp).
 */
export type SaleEligibility =
  | { blocked: true; reason: string }
  | { blocked: false; scoped: boolean; sales: NhanVien[] };

/**
 * Sale hợp lệ để Leader phân Campaign này. Admin luôn thấy toàn bộ Sale đang
 * hoạt động (giữ quyền quản lý toàn cục — không bị thu hẹp, không bao giờ
 * blocked). Leader (không phải Admin) bị thu hẹp về ĐÚNG roster Dự án liên
 * kết (DuAn.ds_sale) NẾU Campaign có gắn Dự án (id_du_an) VÀ Dự án đó đã cấu
 * hình team — tái dùng cơ chế team hiện có của Project-mode, KHÔNG thêm
 * field/schema mới cho Campaign, KHÔNG bao giờ mở rộng roster ra ngoài
 * ds_sale. Campaign.owner (quyền quản lý Campaign) và DuAn.truong_nhom
 * (ai đứng đầu roster đó) là 2 khái niệm ĐỘC LẬP — không yêu cầu 2 giá trị
 * này phải trùng nhau ở bất kỳ đâu trong hàm này.
 *
 * Nếu Campaign KHÔNG gắn Dự án, hoặc Dự án đó CHƯA cấu hình ds_sale (thiếu/
 * rỗng/không parse được) — KHÔNG có roster đáng tin cậy nào để thu hẹp.
 * Theo kiến trúc đã duyệt, trường hợp này phải BỊ CHẶN cho Leader (không suy
 * diễn/mở rộng thành "toàn bộ Sale") — trả về blocked:true kèm lý do hiển thị
 * lên UI. Admin không bao giờ bị ảnh hưởng bởi nhánh này.
 */
export function eligibleCampaignSales(
  actorIsAdmin: boolean,
  campaign: { id_du_an?: string | null },
  projects: DuAn[],
  employees: NhanVien[],
): SaleEligibility {
  const activeSales = employees.filter(isActiveSale);
  if (actorIsAdmin) return { blocked: false, scoped: false, sales: activeSales };
  if (!campaign.id_du_an) return { blocked: true, reason: NO_SALE_SCOPE_REASON };
  const project = projects.find(item => item.id_du_an === campaign.id_du_an);
  const roster = project ? parseSaleRoster(project.ds_sale) : null;
  if (!roster || roster.length === 0) return { blocked: true, reason: NO_SALE_SCOPE_REASON };
  return { blocked: false, scoped: true, sales: activeSales.filter(employee => roster.includes(employee.ho_ten)) };
}
