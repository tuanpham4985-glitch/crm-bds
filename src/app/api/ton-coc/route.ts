import { NextResponse } from 'next/server';
import { getTonCoc } from '@/lib/google-sheets';

export async function GET() {
  try {
    const data = await getTonCoc();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API] ton-coc error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
