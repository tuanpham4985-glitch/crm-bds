import { NextResponse } from 'next/server';
import { getTinhTrangGiaoDich } from '@/lib/google-sheets';

export async function GET() {
  try {
    const data = await getTinhTrangGiaoDich();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API] tinh-trang-giao-dich error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
