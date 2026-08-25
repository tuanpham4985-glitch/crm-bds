import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findEmployeeForAuth, normalizeAuthEmail } from '@/lib/auth/employee-source';
import { signSessionValue, verifySessionValue } from '@/lib/auth/session-signature';

// Simple session-based auth using cookies
// POST /api/auth — Login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeAuthEmail(String(body.email || ''));
    const { mat_khau } = body;
    
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
      cookieStore.set('crm_session_sig', signSessionValue(devBase64), {
        httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', maxAge: 60 * 60 * 24 * 7, path: '/',
      });
      return NextResponse.json({
        success: true,
        data: { id_nhan_vien: 'DEV_ADMIN', ho_ten: devName, email: devEmail, vai_tro: 'Admin', employee_type: 'Admin' },
      });
    }

    const lookup = await findEmployeeForAuth(email);
    console.log('[Auth] Result of findEmployeeForAuth:', lookup.ok ? lookup.employee.email : lookup.reason);

    if (!lookup.ok && lookup.reason === 'inactive') {
      return NextResponse.json({ success: false, error: 'Tài khoản đã bị khóa' }, { status: 401 });
    }
    if (!lookup.ok) {
      return NextResponse.json({ success: false, error: 'Email không tồn tại trong hệ thống' }, { status: 401 });
    }
    const nv = lookup.employee;

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
    cookieStore.set('crm_session_sig', signSessionValue(base64Session), {
      httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', maxAge: 60 * 60 * 24 * 7, path: '/',
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
  } catch (error: unknown) {
    console.error('[Auth] Login Catch Error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống: ' + message }, { status: 500 });
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
    if (!verifySessionValue(session.value, cookieStore.get('crm_session_sig')?.value)) {
      cookieStore.delete('crm_session');
      cookieStore.delete('crm_session_sig');
      return NextResponse.json({ success: false, error: 'Session không hợp lệ, vui lòng đăng nhập lại' }, { status: 401 });
    }

    // Use atob for Edge compatibility
    const decoded = decodeURIComponent(escape(atob(session.value)));
    const userData = JSON.parse(decoded);

    // Re-read vai_tro & employee_type từ sheet để role changes có hiệu lực ngay
    // mà không cần user logout/login lại. Bỏ qua DEV_ADMIN (không có row trong sheet).
    if (userData.id_nhan_vien !== 'DEV_ADMIN' && userData.email) {
      try {
        const lookup = await findEmployeeForAuth(userData.email);
        if (!lookup.ok) {
          cookieStore.delete('crm_session');
          cookieStore.delete('crm_session_sig');
          return NextResponse.json({
            success: false,
            error: lookup.reason === 'inactive' ? 'Tài khoản đã bị khóa' : 'Session không còn hợp lệ',
          }, { status: 401 });
        }
        const nv = lookup.employee;
        userData.id_nhan_vien = nv.id_nhan_vien;
        userData.ho_ten       = nv.ho_ten;
        userData.email        = nv.email;
        userData.vai_tro      = nv.vai_tro || userData.vai_tro;
        userData.employee_type = nv.employee_type || userData.employee_type;
      } catch (refreshErr) {
        // Auth phải fail-closed: không dùng cookie cũ khi không xác thực được NHAN_VIEN.
        cookieStore.delete('crm_session');
        cookieStore.delete('crm_session_sig');
        console.warn('[Auth] Could not validate session against NHAN_VIEN:', refreshErr);
        return NextResponse.json({ success: false, error: 'Không xác thực được session' }, { status: 401 });
      }
    }

    return NextResponse.json({ success: true, data: userData });
  } catch (error: unknown) {
    console.error('[Auth] Session Catch Error:', error);
    return NextResponse.json({ success: false, error: 'Session không hợp lệ' }, { status: 401 });
  }
}

// DELETE /api/auth — Logout
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('crm_session');
  cookieStore.delete('crm_session_sig');
  return NextResponse.json({ success: true });
}
