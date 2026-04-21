import { NextRequest, NextResponse } from 'next/server';
import { addBangLuong } from '@/lib/google-sheets';
import type { BangLuong } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const data: Omit<BangLuong, 'id' | 'created_at'>[] = await request.json();

    if (!Array.isArray(data)) {
      return NextResponse.json({ success: false, error: 'Dữ liệu không hợp lệ (cần mảng)' }, { status: 400 });
    }

    let savedCount = 0;
    for (const bl of data) {
      if (!bl.id_nhan_vien || !bl.thang || !bl.nam) continue;
      
      // Auto-generates id and created_at inside addBangLuong
      await addBangLuong(bl);
      savedCount++;
    }

    return NextResponse.json({ success: true, message: `Đã lưu ${savedCount} bản ghi bảng lương` });
  } catch (error) {
    console.error('Save payroll error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi lưu dữ liệu' }, { status: 500 });
  }
}
