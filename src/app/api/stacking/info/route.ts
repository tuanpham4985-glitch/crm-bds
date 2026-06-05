import { NextResponse } from 'next/server';

// Trả về thông tin public để UI hướng dẫn user share sheet
export async function GET() {
  return NextResponse.json({
    success: true,
    sa_email: process.env.GOOGLE_CLIENT_EMAIL || '',
  });
}
