import { NextResponse } from 'next/server';
import { getNhiemVu } from '@/lib/google-sheets';

/**
 * GET /api/nhiem-vu
 * Trả về map { [vi_tri/chuc_danh]: cong_viec_phai_lam }
 * Đọc từ sheet NHIEM_VU (cột "Vị trí" và "Công việc phải làm").
 */
export async function GET() {
  try {
    const data = await getNhiemVu();
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /nhiem-vu] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi đọc dữ liệu nhiệm vụ' },
      { status: 500 }
    );
  }
}
