import { NextRequest, NextResponse } from 'next/server';
import { getNhanVien, addNhanVien, updateNhanVien, deleteNhanVien } from '@/lib/google-sheets';
import { generateId } from '@/lib/utils';

export async function GET() {
  try {
    const data = await getNhanVien();
    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error) {
    console.error('NhanVien GET error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi đọc dữ liệu' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const nv = {
      ...body,
      id_nhan_vien: generateId('NV'),
      ngay_tao: new Date().toISOString(),
    };
    await addNhanVien(nv);
    return NextResponse.json({ success: true, data: nv });
  } catch (error) {
    console.error('NhanVien POST error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi thêm nhân viên' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updated = await updateNhanVien(body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy nhân viên' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('NhanVien PUT error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi cập nhật' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    const deleted = await deleteNhanVien(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy nhân viên' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('NhanVien DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi xóa' }, { status: 500 });
  }
}
