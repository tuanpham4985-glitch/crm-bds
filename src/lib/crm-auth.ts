import { cookies } from 'next/headers';
import type { DuAn, KhachHang, NhanVien, Pipeline } from './types';
import { SENIOR_EMPLOYEE_TYPES } from './constants';
import { verifySessionValue } from './auth/session-signature';

export interface CrmSessionUser {
  id_nhan_vien: string;
  ho_ten: string;
  email: string;
  vai_tro: string;
  employee_type?: string;
}

export async function getCrmSessionUser(): Promise<CrmSessionUser | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get('crm_session')?.value;
  if (!value) return null;
  try {
    if (!verifySessionValue(value, cookieStore.get('crm_session_sig')?.value)) return null;
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as CrmSessionUser;
  } catch {
    return null;
  }
}

export function isCrmAdmin(user: CrmSessionUser | null): boolean {
  if (!user) return false;
  return user.vai_tro === 'Admin'
    || (SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(user.employee_type || '');
}

export function isTelesale(employee: Pick<NhanVien, 'employee_type' | 'vai_tro'>): boolean {
  const value = `${employee.employee_type || ''} ${employee.vai_tro || ''}`.toLowerCase();
  return value.includes('telesale') || value.includes('cskh');
}

export function projectForCustomer(customer: KhachHang, projects: DuAn[]): DuAn | undefined {
  return projects.find(project => project.ten_du_an === customer.du_an);
}

export function isProjectManager(user: CrmSessionUser, customer: KhachHang, projects: DuAn[]): boolean {
  return projectForCustomer(customer, projects)?.truong_nhom === user.ho_ten;
}

export function canViewCustomer(user: CrmSessionUser, customer: KhachHang, projects: DuAn[]): boolean {
  return isCrmAdmin(user)
    || isProjectManager(user, customer, projects)
    || customer.telesale_phu_trach === user.ho_ten
    || customer.sale_nhan_khach === user.ho_ten
    || customer.sale_phu_trach === user.ho_ten;
}

export function canManageCustomer(user: CrmSessionUser, customer: KhachHang, projects: DuAn[]): boolean {
  return isCrmAdmin(user) || isProjectManager(user, customer, projects);
}

export function isDirectManager(user: CrmSessionUser, customer: KhachHang, employees: NhanVien[]): boolean {
  if (!customer.telesale_phu_trach) return false;
  return employees.some(employee => employee.ho_ten === customer.telesale_phu_trach && employee.ql_truc_tiep === user.ho_ten);
}

export interface CrmManagerScope {
  canManageQuality: boolean;
  allCustomers: boolean;
  projectNames: string[];
  directReportNames: string[];
}

export function buildCrmManagerScope(user: CrmSessionUser, projects: DuAn[], employees: NhanVien[]): CrmManagerScope {
  const allCustomers = isCrmAdmin(user);
  const projectNames = projects.filter(project => project.truong_nhom === user.ho_ten).map(project => project.ten_du_an);
  const directReportNames = employees.filter(employee => employee.ql_truc_tiep === user.ho_ten).map(employee => employee.ho_ten);
  return {
    allCustomers,
    projectNames,
    directReportNames,
    canManageQuality: allCustomers || projectNames.length > 0 || directReportNames.length > 0,
  };
}

export function customerInManagerScope(
  customer: { du_an?: string | null; telesale_phu_trach?: string | null },
  scope: CrmManagerScope,
): boolean {
  return scope.allCustomers
    || scope.projectNames.includes(customer.du_an || '')
    || scope.directReportNames.includes(customer.telesale_phu_trach || '');
}

/**
 * Server-side deletion authority dùng chung cho single-delete và bulk-delete.
 * Trả về lý do chặn (string) nếu khách hàng có CRM history/handoff/Pipeline/
 * Campaign membership cần bảo vệ, hoặc null nếu được phép xóa.
 *
 * campaignMemberships mặc định rỗng (không bắt buộc truyền) để không phá vỡ
 * caller nào lỡ chưa cập nhật — nhưng mọi route xóa thật (single/bulk/import-batch)
 * PHẢI truyền đủ getCampaignMembershipCustomerRefs() để guard có hiệu lực.
 */
export function customerDeleteBlockReason(
  customer: KhachHang,
  pipelines: readonly Pipeline[],
  campaignMemberships: readonly { customer_id: string }[] = [],
): string | null {
  const hasCrmHistory = Number(customer.so_lan_lien_he || 0) > 0
    || Boolean(customer.lich_su_cham_soc && customer.lich_su_cham_soc !== '[]')
    || Boolean(customer.lich_su_ban_giao && customer.lich_su_ban_giao !== '[]');
  if (hasCrmHistory || customer.trang_thai_ban_giao !== 'Chưa bàn giao' || pipelines.some(pipeline => pipeline.id_khach_hang === customer.id_khach_hang)) {
    return 'Không thể xóa khách đã có lịch sử CRM, handoff hoặc Pipeline';
  }
  if (campaignMemberships.some(membership => membership.customer_id === customer.id_khach_hang)) {
    return 'Không thể xóa khách đã tham gia Campaign';
  }
  return null;
}

/**
 * Quyền quản lý Campaign: Admin/Ban lãnh đạo hoặc đúng owner của campaign đó
 * (owner_name) — cùng pattern với isProjectManager (DuAn.truong_nhom).
 */
export function canManageCampaign(user: CrmSessionUser, campaign: { owner_name?: string | null }): boolean {
  return isCrmAdmin(user) || campaign.owner_name === user.ho_ten;
}

/**
 * Quyền thao tác (interaction/qualification) trên 1 CampaignMembership cụ thể
 * (M1B.1) — Admin, Campaign owner, hoặc ĐÚNG Telesale được gán cho membership
 * này. Dùng telesale_id (không phải tên) để so khớp — khác với pattern name-
 * based cũ (Customer.telesale_phu_trach) — tránh trùng tên giữa 2 nhân viên
 * dẫn tới Telesale A vô tình thao tác được membership của Telesale B.
 */
export function canManageMembership(
  user: CrmSessionUser,
  membership: { telesale_id?: string | null },
  campaign: { owner_name?: string | null },
): boolean {
  return isCrmAdmin(user) || canManageCampaign(user, campaign) || membership.telesale_id === user.id_nhan_vien;
}

/**
 * Quản lý trực tiếp của Telesale đang được gán cho membership (song song với
 * isDirectManager cho Customer.telesale_phu_trach) — tra theo telesale_id,
 * không theo tên.
 */
export function isMembershipDirectManager(
  user: CrmSessionUser,
  membership: { telesale_id?: string | null },
  employees: NhanVien[],
): boolean {
  if (!membership.telesale_id) return false;
  return employees.some(employee => employee.id_nhan_vien === membership.telesale_id && employee.ql_truc_tiep === user.ho_ten);
}
