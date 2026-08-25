import { cookies } from 'next/headers';
import type { DuAn, KhachHang, NhanVien } from './types';
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
