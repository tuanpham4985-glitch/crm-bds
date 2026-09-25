// Campaign Sale CSKH model — không có role "Telesale" riêng trong hệ thống
// (xem VAI_TRO trong constants.ts: chỉ 'Admin' | 'HR' | 'Sale'). Người thực
// hiện Campaign CSKH luôn là nhân viên vai_tro 'Sale' đang hoạt động.
//
// Module THUẦN (không import next/headers) để dùng được ở CẢ server
// (crm-auth.ts re-export) LẪN client component ('use client') — cùng lý do
// tách campaign-cskh-authority.ts trước đó.
import type { DuAn, NhanVien } from './types';

export const NO_SALE_SCOPE_REASON = 'Campaign chưa có phạm vi Sale được cấu hình. Vui lòng liên hệ Admin hoặc gắn Dự án có danh sách Sale.';

// CEO / Chủ tịch giữ vai_tro 'Sale' để vào được CRM nhưng KHÔNG nhận khách —
// loại khỏi mọi danh sách người nhận khi chia/chuyển khách.
const NO_CUSTOMER_EMPLOYEE_TYPES = new Set(['CEO', 'Chủ tịch']);

export function isCustomerDistributionExempt(employee: { employee_type?: string | null }): boolean {
  return NO_CUSTOMER_EMPLOYEE_TYPES.has((employee.employee_type || '').trim());
}

export function isActiveSale(employee: Pick<NhanVien, 'vai_tro' | 'trang_thai'> & { employee_type?: string | null }): boolean {
  return employee.vai_tro === 'Sale' && employee.trang_thai !== 'Nghỉ việc' && !isCustomerDistributionExempt(employee);
}

// CUSTOMER_DEPARTMENT_DISTRIBUTION — "Phòng" (NhanVien.phong_KD, cột đã có
// sẵn trong Postgres/Sheets, KHÔNG cần model/API mới) CHỈ là bulk selector
// cho recipient set (selectedSales trên CampaignDistributeModal), KHÔNG phải
// 1 authority/allocation level mới. 2 hàm THUẦN dưới đây tách khỏi component
// để test trực tiếp logic, không phải regex UI.

/**
 * Danh sách tên Phòng có ít nhất 1 Sale đang hoạt động — lấy từ TOÀN BỘ nhân
 * viên (KHÔNG thu hẹp theo 1 Campaign cụ thể) để Admin luôn thấy đúng tên
 * phòng họ nhớ, kể cả khi phòng đó hiện không có ai lọt qua roster Dự án của
 * Campaign đang chọn — resolveDepartmentSaleNames() bên dưới mới là bước áp
 * ĐÚNG eligibility thật cho 1 Campaign cụ thể.
 */
export function listActiveSaleDepartments(employees: readonly NhanVien[]): string[] {
  const set = new Set<string>();
  employees.forEach(item => { if (isActiveSale(item) && item.phong_KD) set.add(item.phong_KD); });
  return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
}

/**
 * Resolve tên (ho_ten — CÙNG định danh recipient đã dùng cho selectedSales,
 * không phát minh định danh mới) của các Sale thuộc phòng `dept` VÀ đã nằm
 * trong `eligibleSales` (caller tự tính qua eligibleCampaignSales() TRƯỚC —
 * hàm này KHÔNG tự tính lại eligibility, chỉ giao (intersect) với dept, nên
 * Department bulk-select không thể bypass roster Dự án/Admin-scope đã duyệt).
 */
export function resolveDepartmentSaleNames(eligibleSales: readonly NhanVien[], dept: string): string[] {
  return eligibleSales.filter(item => item.phong_KD === dept).map(item => item.ho_ten);
}

/**
 * Merge `additions` (VD tên Sale vừa resolve từ 1 Phòng) vào `current`
 * recipient names, dedupe — 1 Sale chỉ xuất hiện đúng 1 lần trong final
 * recipient set dù được chọn thủ công VÀ đồng thời thuộc Phòng vừa bulk-
 * select. Set-union thuần theo ĐÚNG định danh ho_ten đã dùng cho
 * selectedSales — không phát minh weighting/quota nào.
 */
export function mergeRecipientNames(current: readonly string[], additions: readonly string[]): string[] {
  return Array.from(new Set([...current, ...additions]));
}

export function parseSaleRoster(raw?: string | null): string[] | null {
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
