import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

// POST /api/push/unsubscribe — xoá đăng ký theo endpoint (khi user tắt thông báo)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const endpoint: string | undefined = body?.endpoint;
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[API push/unsubscribe]', error);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}
