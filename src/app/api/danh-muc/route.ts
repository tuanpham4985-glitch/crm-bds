import { NextResponse } from 'next/server';
import { getDanhMuc } from '@/lib/google-sheets';

export async function GET() {
  try {
    const data = await getDanhMuc();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('DanhMuc error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi đọc danh mục' }, { status: 500 });
  }
}
