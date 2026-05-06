import { NextRequest, NextResponse } from 'next/server';
import { getBangLuong, updateBangLuong, deleteBangLuong } from '@/lib/google-sheets';
import { savePayroll } from '@/lib/payroll';
import type { PayrollEntry } from '@/lib/payroll';

/**
 * GET /api/payroll?thang=5&nam=2026
 * Lấy danh sách bảng lương đã lưu, lọc theo tháng/năm nếu có.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const thang = searchParams.get('thang') ? Number(searchParams.get('thang')) : null;
    const nam   = searchParams.get('nam')   ? Number(searchParams.get('nam'))   : null;

    const all = await getBangLuong();

    const filtered = all.filter(bl => {
      if (thang && bl.thang !== thang) return false;
      if (nam   && bl.nam   !== nam)   return false;
      return true;
    });

    return NextResponse.json({ success: true, data: filtered, total: filtered.length });
  } catch (error) {
    console.error('[API /payroll] GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi tải bảng lương' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payroll
 * Body: { thang: number, nam: number, entries: PayrollEntry[], forceOverwrite?: boolean }
 *
 * Lưu bảng lương vào BANG_LUONG sheet.
 * Tự động bỏ qua (skip) nếu id_nhan_vien+thang+nam đã tồn tại.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const thang: number = Number(body.thang);
    const nam: number   = Number(body.nam);
    const entries: PayrollEntry[] = body.entries;
    const forceOverwrite: boolean = body.forceOverwrite === true;

    if (!thang || !nam) {
      return NextResponse.json(
        { success: false, error: 'Thiếu thang hoặc nam' },
        { status: 400 }
      );
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Không có dữ liệu bảng lương để lưu' },
        { status: 400 }
      );
    }

    const result = await savePayroll(thang, nam, entries, forceOverwrite);

    return NextResponse.json({
      success: true,
      message: `Đã lưu ${result.saved} bản ghi. Bỏ qua ${result.skipped} trùng lặp.`,
      ...result,
    });
  } catch (error) {
    console.error('[API /payroll] POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi lưu bảng lương' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/payroll
 * Body: { id: string, trang_thai?, thuong?, phat?, tong_luong? }
 *
 * Cập nhật trạng thái hoặc điều chỉnh thưởng/phạt cho bản ghi đã lưu.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'Thiếu id bản ghi' },
        { status: 400 }
      );
    }

    const { id, ...updates } = body;
    const ok = await updateBangLuong(id, updates);

    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy bản ghi' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /payroll] PUT Error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi cập nhật' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/payroll
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'Thiếu id bản ghi' },
        { status: 400 }
      );
    }

    const ok = await deleteBangLuong(body.id);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy bản ghi' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /payroll] DELETE Error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi xóa bản ghi' },
      { status: 500 }
    );
  }
}
