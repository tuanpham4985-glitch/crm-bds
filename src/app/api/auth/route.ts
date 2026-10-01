import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findEmployeeForAuth, normalizeAuthEmail } from '@/lib/auth/employee-source';
import { signSessionValue, verifySessionValue } from '@/lib/auth/session-signature';
import type { AccessScope } from '@/lib/auth/access-scope';

// Ghi cookie phiên + chữ ký. access_scope nằm TRONG phần được ký nên proxy.ts
// tin được để chặn trang/API cho nhân viên "Học việc" (attendance_only).
async function writeSessionCookies(session: Record<string, unknown>): Promise<void> {
  const base64Session = btoa(unescape(encodeURIComponent(JSON.stringify(session))));
  const isProd = process.env.NODE_ENV === 'production';
  const opts = { httpOnly: true, secure: isProd, sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' };
  const cookieStore = await cookies();
  cookieStore.set('crm_session', base64Session, opts);
  cookieStore.set('crm_session_sig', signSessionValue(base64Session), opts);
}

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
        avatar_url: '',
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
        data: { id_nhan_vien: 'DEV_ADMIN', ho_ten: devName, email: devEmail, vai_tro: 'Admin', employee_type: 'Admin', avatar_url: '' },
      });
    }

    const lookup = await findEmployeeForAuth(email, { allowAttendanceOnly: true });
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

    await writeSessionCookies({
      id_nhan_vien: nv.id_nhan_vien,
      ho_ten: nv.ho_ten,
      email: nv.email,
      vai_tro: nv.vai_tro,
      employee_type: nv.employee_type,
      avatar_url: nv.avatar_url || '',
      access_scope: lookup.scope,
    });

    return NextResponse.json({
      success: true,
      data: {
        id_nhan_vien: nv.id_nhan_vien,
        ho_ten: nv.ho_ten,
        email: nv.email,
        vai_tro: nv.vai_tro,
        employee_type: nv.employee_type,
        avatar_url: nv.avatar_url || '',
        access_scope: lookup.scope,
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
        const lookup = await findEmployeeForAuth(userData.email, { allowAttendanceOnly: true });
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
        userData.avatar_url   = nv.avatar_url || '';
        // phong_KD KHÔNG có trong crm_session cookie gốc (xem POST ở trên) —
        // bổ sung tại đây (cùng cách re-read vai_tro/employee_type) để client
        // (Sidebar/useAuth) có đủ tín hiệu cho canAccessHrmAppointment mà
        // KHÔNG cần mở rộng shape cookie — approved architecture
        // HRM_APPOINTMENT_ACCESS_CONTROL §5 (menu visibility).
        userData.phong_KD     = nv.phong_KD || '';

        // Trạng thái đổi (vd. Học việc → Thử việc, hoặc ngược lại) → ký lại
        // cookie với access_scope mới để proxy.ts áp quyền ngay, không cần đăng nhập lại.
        const prevScope: AccessScope = userData.access_scope === 'attendance_only' ? 'attendance_only' : 'full';
        userData.access_scope = lookup.scope;
        if (prevScope !== lookup.scope) {
          await writeSessionCookies({
            id_nhan_vien: nv.id_nhan_vien,
            ho_ten: nv.ho_ten,
            email: nv.email,
            vai_tro: nv.vai_tro,
            employee_type: nv.employee_type,
            avatar_url: nv.avatar_url || '',
            access_scope: lookup.scope,
          });
        }
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
