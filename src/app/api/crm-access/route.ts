import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDuAn } from '@/lib/data-access';
import { SENIOR_EMPLOYEE_TYPES } from '@/lib/constants';

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
      return NextResponse.json({ canKH: true, phanKhachIds: null }); // null = all projects
    }

    // Find projects this user is involved in (trưởng nhóm or team member)
    const projects = await getDuAn();
    const accessibleIds = projects
      .filter(p => {
        if (p.truong_nhom === userData.ho_ten) return true;
        try {
          const members: string[] = p.ds_sale ? JSON.parse(p.ds_sale) : [];
          return members.includes(userData.ho_ten);
        } catch { return false; }
      })
      .map(p => p.id_du_an);

    return NextResponse.json({ canKH: false, phanKhachIds: accessibleIds });
  } catch {
    return NextResponse.json({ canKH: false, phanKhachIds: [] });
  }
}
