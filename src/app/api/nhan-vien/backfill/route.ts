import { NextResponse } from 'next/server';
import { backfillNhanVienIds } from '@/lib/google-sheets';

/**
 * POST /api/nhan-vien/backfill
 * One-time endpoint to fix imported employees missing id_nhan_vien.
 */
export async function POST() {
  try {
    const result = await backfillNhanVienIds();
    return NextResponse.json({
      success: true,
      message: `Đã tạo ID cho ${result.fixed}/${result.total} nhân viên`,
      ...result,
    });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi backfill ID nhân viên' },
      { status: 500 }
    );
  }
}
