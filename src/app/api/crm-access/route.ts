import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDuAn, getKhachHang, getNhanVien } from '@/lib/data-access';
import { SENIOR_EMPLOYEE_TYPES } from '@/lib/constants';
import { buildCrmManagerScope } from '@/lib/crm-auth';
import { hasCampaignCskhAccess } from '@/lib/crm-funnel/campaign';

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
    // phanKhachIds vẫn CHỈ theo mô hình Dự án cũ (dùng để lọc dropdown "Theo
    // Dự án" trên /phan-khach, xem accessibleProjects) — KHÔNG nhét id giả
    // vào đây.
    //
    // canPhanKhach (Sidebar, mục "CSKH") giờ tính ĐẦY ĐỦ 3 tín hiệu, khớp
    // ĐÚNG canAccessPage thật của /phan-khach/page.tsx (isAdmin ||
    // vai_tro === 'Sale') — trước đây CHỈ có accessibleIds (Dự án cũ) nên
    // 2 gate lệch nhau: (1) accessibleIds.length>0 (Dự án cũ), (2)
    // hasCampaignCskhAccess (Sale CSKH/Leader qua Campaign), (3) vai_tro
    // === 'Sale' (blanket, đúng với thực tế trang vẫn cho MỌI Sale vào dù
    // họ chưa được gán data ở đâu — kể cả nhân viên mới, sẽ có Campaign
    // gán sau). (3) tự nó đã bao trùm hầu hết Sale, nhưng vẫn giữ (1)/(2)
    // vì Leader Campaign có thể KHÔNG có vai_tro 'Sale' (Leader picker
    // không lọc theo vai_tro, xem CampaignDistributeModal/CampaignLeaderEditModal).
    const hasCampaignAccess = await hasCampaignCskhAccess(userData);
    const canPhanKhach = accessibleIds.length > 0 || hasCampaignAccess || userData.vai_tro === 'Sale';
    return NextResponse.json({
      canKH: false, phanKhachIds: accessibleIds, handoffCount,
      canQualityDashboard: scope.canManageQuality, canPhanKhach,
    });
  } catch {
    return NextResponse.json({ canKH: false, phanKhachIds: [] });
  }
}
