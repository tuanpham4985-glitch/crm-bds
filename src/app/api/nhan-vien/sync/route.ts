import { NextResponse } from 'next/server';
import { syncEmployeesFromHrFile } from '@/lib/google-sheets';

export async function POST() {
  try {
    const result = await syncEmployeesFromHrFile();
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('NhanVien Sync POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi kết nối đồng bộ' },
      { status: 500 }
    );
  }
}
