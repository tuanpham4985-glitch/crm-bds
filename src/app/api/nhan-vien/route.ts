import { NextRequest, NextResponse } from 'next/server';
import {
  getNhanVien,
  addNhanVien,
  updateNhanVien,
  deleteNhanVien
} from '@/lib/google-sheets';
import { generateId } from '@/lib/utils';

// ==============================
// Fields không public ra UI
// ==============================
const HIDDEN_FIELDS = ['email', 'khach_hang', 'hoa_hong'] as const;

// Helper: lọc dữ liệu trả về frontend
function sanitizeNhanVien(data: any[]) {
  return data
    .filter(nv => nv.trang_thai !== 'Nghỉ việc')
    .map(nv => {
      const clean = { ...nv };
      HIDDEN_FIELDS.forEach((f) => {
        delete clean[f];
      });
      return clean;
    });
}

// ==============================
// GET
// ==============================
export async function GET() {
  try {
    const all = await getNhanVien();
    const data = sanitizeNhanVien(all);

    return NextResponse.json({
      success: true,
      data,
      total: data.length
    });
  } catch (error) {
    console.error('NhanVien GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi đọc dữ liệu' },
      { status: 500 }
    );
  }
}

// ==============================
// POST
// ==============================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const nv = {
      ...body,
      id_nhan_vien: generateId('NV'),
      ngay_tao: new Date().toISOString(),
    };

    await addNhanVien(nv);

    return NextResponse.json({
      success: true,
      data: nv
    });
  } catch (error) {
    console.error('NhanVien POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi thêm nhân viên' },
      { status: 500 }
    );
  }
}

// ==============================
// PUT
// ==============================
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const updated = await updateNhanVien(body);

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy nhân viên' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: body
    });
  } catch (error) {
    console.error('NhanVien PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi cập nhật' },
      { status: 500 }
    );
  }
}

// ==============================
// DELETE
// ==============================
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    const deleted = await deleteNhanVien(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy nhân viên' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('NhanVien DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi xóa' },
      { status: 500 }
    );
  }
}