import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { syncManagerFromHrFile } from '@/lib/google-sheets';

interface SessionUser {
  id_nhan_vien: string;
  ho_ten: string;
  vai_tro: string;
}

async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const c = cookieStore.get('crm_session');
  if (!c?.value) return null;
  try {
    return JSON.parse(Buffer.from(c.value, 'base64').toString()) as SessionUser;
  } catch {
    return null;
  }
}

// POST /api/nhan-vien/sync-manager
// Admin/HR only — đọc file HR ngoài và cập nhật ql_truc_tiep trong NHAN_VIEN
export async function POST() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }
    if (user.vai_tro !== 'Admin' && user.vai_tro !== 'HR') {
      return NextResponse.json({ success: false, error: 'Chỉ Admin/HR mới có quyền đồng bộ' }, { status: 403 });
    }

    const result = await syncManagerFromHrFile();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[API sync-manager] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
