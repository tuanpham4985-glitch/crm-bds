import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const session = request.cookies.get('crm_session');
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname.startsWith('/login');

  // Các đường dẫn CÔNG KHAI (không cần đăng nhập):
  // - /api/auth để đăng nhập
  // - /api/pwa/icon: iOS/Android tải icon app KHÔNG kèm cookie phiên → phải mở public,
  //   nếu không sẽ bị 401 và icon màn hình chính rơi về ảnh mặc định.
  if (pathname === '/api/auth' || pathname === '/api/pwa/icon') {
    return NextResponse.next();
  }
  
  // If no session and trying to access anything other than login
  if (!session && !isLoginPage) {
    if (request.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If already have session and visiting login page, redirect to Dashboard
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
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
