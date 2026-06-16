import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTinhTrangGiaoDich } from '@/lib/google-sheets';
import { SENIOR_EMPLOYEE_TYPES } from '@/lib/constants';

async function isLeader(): Promise<boolean> {
  const cookieStore = await cookies();
  const c = cookieStore.get('crm_session');
  if (!c?.value) return false;
  try {
    const u = JSON.parse(Buffer.from(c.value, 'base64').toString());
    return u.vai_tro === 'Admin' || (SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(u.employee_type || '');
  } catch {
    return false;
  }
}

export async function GET() {
  if (!(await isLeader())) {
    return NextResponse.json({ success: false, error: 'Không có quyền' }, { status: 403 });
  }
  try {
    const data = await getTinhTrangGiaoDich();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API] tinh-trang-giao-dich error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
