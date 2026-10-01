import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionValue } from '@/lib/auth/session-signature';
import { ATTENDANCE_ONLY_HOME, isPathAllowedForAttendanceOnly } from '@/lib/auth/access-scope';

// Đọc access_scope từ cookie phiên ĐÃ KÝ. Chữ ký sai → coi như chưa đăng nhập
// (GET /api/auth vốn cũng xoá phiên sai chữ ký), để không thể sửa tay cookie
// bỏ access_scope nhằm vượt giới hạn "Học việc".
function readSessionScope(request: NextRequest): 'none' | 'full' | 'attendance_only' {
  const value = request.cookies.get('crm_session')?.value;
  if (!value) return 'none';
  try {
    if (!verifySessionValue(value, request.cookies.get('crm_session_sig')?.value)) return 'none';
    const session = JSON.parse(decodeURIComponent(escape(atob(value))));
    return session?.access_scope === 'attendance_only' ? 'attendance_only' : 'full';
  } catch {
    return 'none';
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname.startsWith('/login');

  // Các đường dẫn CÔNG KHAI (không cần đăng nhập):
  // - /api/auth để đăng nhập
  // - /api/pwa/icon: iOS/Android tải icon app KHÔNG kèm cookie phiên → phải mở public,
  //   nếu không sẽ bị 401 và icon màn hình chính rơi về ảnh mặc định.
  if (pathname === '/api/auth' || pathname === '/api/pwa/icon') {
    return NextResponse.next();
  }

  const scope = readSessionScope(request);

  // If no session and trying to access anything other than login
  if (scope === 'none' && !isLoginPage) {
    if (request.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If already have session and visiting login page, redirect to Dashboard
  if (scope !== 'none' && isLoginPage) {
    return NextResponse.redirect(new URL(scope === 'attendance_only' ? ATTENDANCE_ONLY_HOME : '/', request.url));
  }

  // Nhân viên "Học việc": chỉ Chấm công online — chặn mọi trang/API khác
  if (scope === 'attendance_only' && !isPathAllowedForAttendanceOnly(pathname, request.method)) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ success: false, error: 'Tài khoản Học việc chỉ được dùng Chấm công online' }, { status: 403 });
    }
    return NextResponse.redirect(new URL(ATTENDANCE_ONLY_HOME, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // tmb-poc: asset tĩnh cho POC TMB (PDF + pdf.js worker) — không phải route
  // cần đăng nhập, phải bypass hoàn toàn để pdf.js fetch được kể cả khi
  // không có session (đúng như icons/favicon.ico/manifest.json đã bypass).
  //
  // sw.js/push-sw.js/workbox-*.js (service worker + Workbox runtime, PWA) và
  // icon-192.png/icon-512.png/apple-touch-icon.png (icon PWA/"Add to Home
  // Screen", tham chiếu trực tiếp từ manifest.json — CÙNG lý do đã bypass
  // /api/pwa/icon: iOS/Android tải các file này KHÔNG kèm cookie phiên) — đây
  // là asset tĩnh thuần, không có nội dung nhạy cảm, PHẢI mở public giống
  // favicon.ico/manifest.json đã bypass; trước đây exclusion "icons" ở trên
  // không khớp gì (3 file icon nằm ở public/ gốc, không có thư mục
  // public/icons/) nên các request này vẫn bị middleware chặn không session.
  // "icons" giữ nguyên (không xoá, phòng khi có route/thư mục khác đang dùng
  // đúng tên đó — ngoài phạm vi xác nhận của thay đổi này).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|tmb-poc|sw.js|push-sw.js|workbox-.*\\.js|icon-192.png|icon-512.png|apple-touch-icon.png).*)'],
};
