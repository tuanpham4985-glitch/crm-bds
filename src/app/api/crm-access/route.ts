import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDuAn, getKhachHang, getNhanVien } from '@/lib/data-access';
import { SENIOR_EMPLOYEE_TYPES } from '@/lib/constants';
import { buildCrmManagerScope } from '@/lib/crm-auth';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('crm_session');
    if (!session) return NextResponse.json({ canKH: false, phanKhachIds: [] });

    const userData = JSON.parse(decodeURIComponent(escape(atob(session.value))));
    const isAdmin =
      userData.vai_tro === 'Admin' ||
      (SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(userData.employee_type || '');

    if (isAdmin) {
      const customers = await getKhachHang();
      return NextResponse.json({
        canKH: true,
        phanKhachIds: null,
        canQualityDashboard: true,
        handoffCount: customers.filter(customer => customer.trang_thai_ban_giao === 'Chờ xác nhận').length,
      }); // null = all projects
    }

    // Find projects this user is involved in (trưởng nhóm or team member)
    const [projects, customers, employees] = await Promise.all([getDuAn(), getKhachHang(), getNhanVien()]);
    const directReports = new Set(employees.filter(employee => employee.ql_truc_tiep === userData.ho_ten).map(employee => employee.ho_ten));
    const projectNamesFromAssignments = new Set(customers
      .filter(customer => customer.telesale_phu_trach === userData.ho_ten
        || directReports.has(customer.telesale_phu_trach || '')
        || customer.sale_nhan_khach === userData.ho_ten
        || customer.sale_phu_trach === userData.ho_ten)
      .map(customer => customer.du_an)
      .filter(Boolean));
    const accessibleIds = projects
      .filter(p => {
        if (p.truong_nhom === userData.ho_ten) return true;
        if (projectNamesFromAssignments.has(p.ten_du_an)) return true;
        try {
          const members: string[] = p.ds_sale ? JSON.parse(p.ds_sale) : [];
          return members.includes(userData.ho_ten);
        } catch { return false; }
      })
      .map(p => p.id_du_an);

    const handoffCount = customers.filter(customer =>
      customer.sale_nhan_khach === userData.ho_ten && customer.trang_thai_ban_giao === 'Chờ xác nhận').length;
    const scope = buildCrmManagerScope(userData, projects, employees);
    return NextResponse.json({ canKH: false, phanKhachIds: accessibleIds, handoffCount, canQualityDashboard: scope.canManageQuality });
  } catch {
    return NextResponse.json({ canKH: false, phanKhachIds: [] });
  }
}
