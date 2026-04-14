import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const session = request.cookies.get('crm_session');
  const isLoginPage = request.nextUrl.pathname.startsWith('/login');

  // Allow API auth route so users can login
  if (request.nextUrl.pathname === '/api/auth') {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icons).*)'],
};
