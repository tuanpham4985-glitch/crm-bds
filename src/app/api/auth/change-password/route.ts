import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getNhanVien, updateNhanVien } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('crm_session');
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const decoded = decodeURIComponent(escape(atob(session.value)));
    const userData = JSON.parse(decoded);
    const id_nhan_vien = userData.id_nhan_vien;

    const body = await request.json();
    const { oldPassword, newPassword } = body;

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin mật khẩu' }, { status: 400 });
    }

    // 1. Fetch employee to verify old password
    const all = await getNhanVien();
    const nv = all.find(e => e.id_nhan_vien === id_nhan_vien);

    if (!nv) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy thông tin nhân viên' }, { status: 404 });
    }

    const currentPassword = nv.mat_khau || '123456';
    if (oldPassword !== currentPassword) {
      return NextResponse.json({ success: false, error: 'Mật khẩu cũ không chính xác' }, { status: 400 });
    }

    // 2. Update password
    const ok = await updateNhanVien({
      ...nv,
      mat_khau: newPassword
    });

    if (!ok) {
      return NextResponse.json({ success: false, error: 'Lỗi khi cập nhật mật khẩu' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error: any) {
    console.error('[ChangePassword] Error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống: ' + error.message }, { status: 500 });
  }
}
