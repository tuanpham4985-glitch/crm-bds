// REMEDIATION — Unify CSKH Access Authority. Trước đây "được thấy mục CSKH ở
// Sidebar" (canPhanKhach, /api/crm-access) và "được vào thẳng /phan-khach"
// (canAccessPage, tính riêng trong phan-khach/page.tsx) là 2 CÔNG THỨC khác
// nhau, có thể lệch nhau (VD 1 Leader Campaign không có vai_tro 'Sale': lọt
// qua canPhanKhach nhờ nhánh Campaign nhưng KHÔNG lọt qua canAccessPage cũ,
// vốn chỉ check vai_tro === 'Sale').
//
// Module này là NGUỒN THẬT DUY NHẤT cho quyết định đó — pure (không đụng
// DB/next-headers), dùng được cả server (/api/crm-access, nơi các tín hiệu
// hasLegacyProjectAccess/hasCampaignCskhAccess được resolve từ DB) lẫn
// client (Sidebar/trang /phan-khach chỉ ĐỌC kết quả đã resolve qua
// useCrmAccess().canPhanKhach — không tự tính lại công thức này).
//
// KHÔNG đổi authority nghiệp vụ nào khác (canManageCampaign, Campaign Leader/
// Sale CSKH/Handoff/Pipeline, Project.ds_sale, ...) — module này CHỈ quyết
// định "có thấy/vào được trang CSKH hay không", không phải "làm được gì bên
// trong trang đó" (những quyền thao tác cụ thể vẫn ở crm-auth.ts/canManage*
// như cũ, server luôn tự re-check độc lập, không tin theo giá trị này).
export interface CskhAccessSignals {
  /** Admin/Ban lãnh đạo (isCrmAdmin) — luôn được phép, bỏ qua mọi điều kiện khác. */
  isAdmin: boolean;
  /** CRM Module Toggle (crm_module_enabled) — Admin luôn bypass, non-admin bắt buộc phải bật. */
  crmModuleEnabled: boolean;
  /** NhanVien.vai_tro của user hiện tại. */
  vaiTro?: string | null;
  /** Có phạm vi Dự án theo mô hình cũ (truong_nhom/ds_sale/Customer legacy fields) hay không. */
  hasLegacyProjectAccess: boolean;
  /** Có Sale CSKH (CampaignMembership.telesale_id) hoặc Leader (Campaign.owner_id/owner_name) ở bất kỳ Campaign nào hay không. */
  hasCampaignCskhAccess: boolean;
}

/**
 * Semantics giữ nguyên như trước remediation này:
 * - Admin luôn được phép.
 * - Non-admin bắt buộc CRM Module đang bật.
 * - Non-admin (module đã bật) được phép nếu THỎA MÃN BẤT KỲ: vai_tro==='Sale',
 *   HOẶC có phạm vi Dự án cũ, HOẶC có quyền Campaign CSKH hợp lệ.
 */
export function canAccessCskh(signals: CskhAccessSignals): boolean {
  if (signals.isAdmin) return true;
  if (!signals.crmModuleEnabled) return false;
  return signals.vaiTro === 'Sale' || signals.hasLegacyProjectAccess || signals.hasCampaignCskhAccess;
}
