import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findNhanVienByEmail } from '@/lib/google-sheets';

// Simple session-based auth using cookies
// POST /api/auth — Login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, mat_khau } = body;
    
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email là bắt buộc' }, { status: 400 });
    }

    // Check dev admin account before hitting Google Sheets
    const devEmail    = process.env.DEV_ADMIN_EMAIL    || '';
    const devPassword = process.env.DEV_ADMIN_PASSWORD || '';
    const devName     = process.env.DEV_ADMIN_NAME     || 'Dev Admin';

    if (devEmail && email.toLowerCase() === devEmail.toLowerCase()) {
      if (!mat_khau || mat_khau !== devPassword) {
        return NextResponse.json({ success: false, error: 'Mật khẩu không đúng' }, { status: 401 });
      }
      const devSessionData = JSON.stringify({
        id_nhan_vien: 'DEV_ADMIN',
        ho_ten: devName,
        email: devEmail,
        vai_tro: 'Admin',
        employee_type: 'Admin',
      });
      const devBase64 = btoa(unescape(encodeURIComponent(devSessionData)));
      const isProd = process.env.NODE_ENV === 'production';
      const cookieStore = await cookies();
      cookieStore.set('crm_session', devBase64, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
      return NextResponse.json({
        success: true,
        data: { id_nhan_vien: 'DEV_ADMIN', ho_ten: devName, email: devEmail, vai_tro: 'Admin', employee_type: 'Admin' },
      });
    }

    const nv = await findNhanVienByEmail(email);
    console.log('[Auth] Result of findNhanVienByEmail:', nv ? nv.email : 'Not found');

    if (!nv) {
      return NextResponse.json({ success: false, error: 'Email không tồn tại trong hệ thống' }, { status: 401 });
    }

    const ACTIVE_STATUSES = ['đang làm', 'chính thức', 'thử việc'];
    const currentStatus = (nv.trang_thai || '').trim().toLowerCase();

    if (!ACTIVE_STATUSES.includes(currentStatus)) {
      return NextResponse.json({ success: false, error: 'Tài khoản đã bị khóa' }, { status: 401 });
    }

    // Password check: Prioritize nv.mat_khau, fallback to '123456'
    const storedPassword = nv.mat_khau || '123456';
    if (mat_khau !== storedPassword) {
      return NextResponse.json({ success: false, error: 'Mật khẩu không đúng' }, { status: 401 });
    }

    // Set session cookie
    const sessionData = JSON.stringify({
      id_nhan_vien: nv.id_nhan_vien,
      ho_ten: nv.ho_ten,
      email: nv.email,
      vai_tro: nv.vai_tro,
      employee_type: nv.employee_type,
    });

    // Use btoa for Edge compatibility (Note: handle UTF-8 if needed)
    const base64Session = btoa(unescape(encodeURIComponent(sessionData)));

    const isProd = process.env.NODE_ENV === 'production';
    const cookieStore = await cookies();
    cookieStore.set('crm_session', base64Session, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      data: {
        id_nhan_vien: nv.id_nhan_vien,
        ho_ten: nv.ho_ten,
        email: nv.email,
        vai_tro: nv.vai_tro,
        employee_type: nv.employee_type,
      },
    });
  } catch (error: any) {
    console.error('[Auth] Login Catch Error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống: ' + error.message }, { status: 500 });
  }
}

// GET /api/auth — Get current session (always re-read vai_tro + employee_type from sheet)
export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('crm_session');
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }

    // Use atob for Edge compatibility
    const decoded = decodeURIComponent(escape(atob(session.value)));
    const userData = JSON.parse(decoded);

    // Re-read vai_tro & employee_type từ sheet để role changes có hiệu lực ngay
    // mà không cần user logout/login lại. Bỏ qua DEV_ADMIN (không có row trong sheet).
    if (userData.id_nhan_vien !== 'DEV_ADMIN' && userData.email) {
      try {
        const nv = await findNhanVienByEmail(userData.email);
        if (nv) {
          userData.vai_tro     = nv.vai_tro     || userData.vai_tro;
          userData.employee_type = nv.employee_type || userData.employee_type;
        }
      } catch (refreshErr) {
        // Nếu sheet không đọc được (timeout, quota...) → fallback về dữ liệu cookie
        console.warn('[Auth] Could not refresh vai_tro from sheet, using cached value:', refreshErr);
      }
    }

    return NextResponse.json({ success: true, data: userData });
  } catch (error: any) {
    console.error('[Auth] Session Catch Error:', error);
    return NextResponse.json({ success: false, error: 'Session không hợp lệ' }, { status: 401 });
  }
}

// DELETE /api/auth — Logout
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('crm_session');
  return NextResponse.json({ success: true });
}
