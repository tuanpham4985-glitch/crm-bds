import { NextResponse } from 'next/server';
import { triggerSyncEmployees } from '@/lib/gas-client';

export async function POST() {
  try {
    const res = await triggerSyncEmployees();
    if (!res.success) {
      return NextResponse.json(
        { success: false, error: res.error || 'Lỗi đồng bộ danh sách nhân viên từ GAS.' },
        { status: 500 }
      );
    }
    return NextResponse.json({
      success: true,
      data: res.data
    });
  } catch (error: any) {
    console.error('NhanVien Sync POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi kết nối đồng bộ' },
      { status: 500 }
    );
  }
}
