import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findNhanVienByEmail } from '@/lib/google-sheets';

// Simple session-based auth using cookies
// POST /api/auth — Login
export async function POST(request: NextRequest) {
  try {
    const { email, mat_khau } = await request.json();
    
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email là bắt buộc' }, { status: 400 });
    }

    const nv = await findNhanVienByEmail(email);
    if (!nv) {
      return NextResponse.json({ success: false, error: 'Email không tồn tại trong hệ thống' }, { status: 401 });
    }

    if (nv.trang_thai !== 'Đang làm') {
      return NextResponse.json({ success: false, error: 'Tài khoản đã bị khóa' }, { status: 401 });
    }

    // Simple password check (default password = '123456' if not set)
    const expectedPassword = mat_khau || '123456';
    if (expectedPassword !== '123456' && expectedPassword !== nv.so_dien_thoai) {
      return NextResponse.json({ success: false, error: 'Mật khẩu không đúng' }, { status: 401 });
    }

    // Set session cookie
    const sessionData = JSON.stringify({
      id_nhan_vien: nv.id_nhan_vien,
      ho_ten: nv.ho_ten,
      email: nv.email,
      vai_tro: nv.vai_tro,
    });

    const cookieStore = await cookies();
    cookieStore.set('crm_session', Buffer.from(sessionData).toString('base64'), {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json({
      success: true,
      data: {
        id_nhan_vien: nv.id_nhan_vien,
        ho_ten: nv.ho_ten,
        email: nv.email,
        vai_tro: nv.vai_tro,
      },
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống' }, { status: 500 });
  }
}

// GET /api/auth — Get current session
export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('crm_session');
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const userData = JSON.parse(Buffer.from(session.value, 'base64').toString());
    return NextResponse.json({ success: true, data: userData });
  } catch {
    return NextResponse.json({ success: false, error: 'Session không hợp lệ' }, { status: 401 });
  }
}

// DELETE /api/auth — Logout
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('crm_session');
  return NextResponse.json({ success: true });
}
