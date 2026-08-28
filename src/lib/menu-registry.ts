// Menu Registry — SOURCE-CODE authority cho route/icon/parent-child
// structure/required business access rule của Sidebar. KHÔNG chứa
// order/visibility (đó là runtime authority, xem navigation-config-resolve.ts)
// và KHÔNG import gì Node-only — file này dùng trực tiếp trong 'use client'
// component (Sidebar.tsx, Menu Manager admin page).
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Building2, LayoutList, Users, PhoneCall, BadgeCheck, GitBranch,
  ClipboardList, BarChart3, TrendingUp, Briefcase, UserCog, FileText, BadgeDollarSign, MapPin,
} from 'lucide-react';

// Tag khai báo "cần business rule nào" — KHÔNG phải RBAC engine mới. Sidebar
// (nơi đã có sẵn các hook useAuth/useCrmAccess) resolve tag này thành boolean
// qua hasBusinessAccess() bên dưới. Registry chỉ khai báo, không tự đánh giá.
export type BusinessAccessTag = 'adminOnly' | 'canPhanKhach' | 'canQualityDashboard' | 'canEditHRM';

export interface MenuChildDef {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  businessAccess?: BusinessAccessTag;
}

export interface MenuRootDef {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Root đứng riêng (không group) — có href, không có children. */
  href?: string;
  businessAccess?: BusinessAccessTag;
  /**
   * Root này có authority BẬT/TẮT riêng đã tồn tại từ trước (hiện chỉ 'crm'
   * -> crm_module_enabled qua /api/crm-module). Menu Manager KHÔNG được ghi
   * đè giá trị này vào navigation_config_v1.disabledRoots — chỉ order được
   * lưu ở đó, enabled luôn đọc từ authority gốc.
   */
  moduleAvailability?: 'crm';
  children?: MenuChildDef[];
}

// Thứ tự khai báo dưới đây = default order khi chưa có runtime config nào
// (hoặc khi 1 key mới được thêm ở lần deploy sau — merge logic sẽ append nó
// vào cuối theo đúng vị trí khai báo tại đây).
export const MENU_REGISTRY: MenuRootDef[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { key: 'projects', label: 'Dự án', href: '/du-an', icon: Building2 },
  { key: 'stacking', label: 'Bảng hàng', href: '/stacking', icon: LayoutList },
  {
    key: 'crm', label: 'CRM', icon: Users, moduleAvailability: 'crm',
    children: [
      { key: 'crm.customers', label: 'Khách hàng', href: '/khach-hang', icon: Users },
      { key: 'crm.cskh', label: 'CSKH', href: '/phan-khach', icon: PhoneCall, businessAccess: 'canPhanKhach' },
      { key: 'crm.qualifiedData', label: 'Data tiềm năng', href: '/data-chat-luong', icon: BadgeCheck, businessAccess: 'canQualityDashboard' },
      { key: 'crm.pipeline', label: 'Giao dịch', href: '/pipeline', icon: GitBranch },
    ],
  },
  { key: 'taskManagement', label: 'Giao việc', href: '/quan-ly-cong-viec', icon: ClipboardList },
  { key: 'salesReport', label: 'Báo cáo bán hàng', href: '/bao-cao-ban-hang', icon: BarChart3 },
  { key: 'finance', label: 'Tài chính', href: '/tai-chinh', icon: TrendingUp, businessAccess: 'adminOnly' },
  {
    key: 'hrm', label: 'HRM', icon: Briefcase,
    children: [
      { key: 'hrm.employees', label: 'Nhân viên', href: '/nhan-vien', icon: UserCog, businessAccess: 'canEditHRM' },
      { key: 'hrm.contracts', label: 'Hợp đồng', href: '/nhan-vien/hop-dong', icon: FileText },
      { key: 'hrm.payroll', label: 'Bảng lương', href: '/nhan-vien/bang-luong', icon: BadgeDollarSign },
      { key: 'hrm.attendance', label: 'Chấm công online', href: '/cham-cong-ngoai', icon: MapPin },
    ],
  },
];

export interface BusinessAccessContext {
  isAdmin: boolean;
  canPhanKhach: boolean;
  canQualityDashboard: boolean;
  canEditHRM: boolean;
}

/**
 * Business authorization LUÔN áp dụng SAU KHI runtime config đã xác định
 * order/visible — đây là bước cuối cùng trước khi render, không thay thế
 * bởi Menu Manager. Menu Manager bật 1 menu chỉ có nghĩa "cho phép nó hiển
 * thị nếu đủ quyền", không tự cấp quyền.
 */
export function hasBusinessAccess(tag: BusinessAccessTag | undefined, ctx: BusinessAccessContext): boolean {
  if (!tag) return true;
  switch (tag) {
    case 'adminOnly': return ctx.isAdmin;
    case 'canPhanKhach': return ctx.canPhanKhach;
    case 'canQualityDashboard': return ctx.canQualityDashboard;
    case 'canEditHRM': return ctx.canEditHRM;
    default: return true;
  }
}
