import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/client';

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

// POST /api/push/subscribe — lưu đăng ký nhận thông báo của thiết bị hiện tại
export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json();
    const sub = body?.subscription ?? body;
    const endpoint: string | undefined = sub?.endpoint;
    const p256dh: string | undefined = sub?.keys?.p256dh;
    const auth: string | undefined = sub?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin subscription' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') ?? '';
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { id_nhan_vien: user.id_nhan_vien, endpoint, p256dh, auth, user_agent: userAgent },
      update: { id_nhan_vien: user.id_nhan_vien, p256dh, auth, user_agent: userAgent },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[API push/subscribe]', error);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}
