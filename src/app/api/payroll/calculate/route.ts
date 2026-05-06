import { NextRequest, NextResponse } from 'next/server';
import { generatePayroll, DEFAULT_PAYROLL_CONFIG } from '@/lib/payroll';

/**
 * POST /api/payroll/calculate
 * Body: { thang: number, nam: number }
 *
 * Trả về preview bảng lương — chưa lưu vào Sheets.
 * Bao gồm: gross, bao_hiem, thue, tong_luong (NET).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const thang = Number(body.thang);
    const nam   = Number(body.nam);

    if (!thang || thang < 1 || thang > 12) {
      return NextResponse.json(
        { success: false, error: 'Tháng không hợp lệ (1–12)' },
        { status: 400 }
      );
    }
    if (!nam || nam < 2000 || nam > 2100) {
      return NextResponse.json(
        { success: false, error: 'Năm không hợp lệ' },
        { status: 400 }
      );
    }

    // Có thể truyền config override từ client nếu cần (để mở rộng sau)
    const config = { ...DEFAULT_PAYROLL_CONFIG };

    const results = await generatePayroll(thang, nam, config);

    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        thang,
        nam,
        total_employees: results.length,
        monthKey: `${String(thang).padStart(2, '0')}-${nam}`,
      },
    });
  } catch (error) {
    console.error('[API /payroll/calculate] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi tính toán bảng lương' },
      { status: 500 }
    );
  }
}
