import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, addDuAn, updateDuAn, deleteDuAn } from '@/lib/google-sheets';
import { generateId } from '@/lib/utils';

export async function GET() {
  try {
    const data = await getDuAn();
    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error) {
    console.error('DuAn GET error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi đọc dữ liệu' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const da = {
      ...body,
      id_du_an: generateId('DA_'),
      label: `${body.ma_du_an} - ${body.ten_du_an}`,
    };
    await addDuAn(da);
    return NextResponse.json({ success: true, data: da });
  } catch (error) {
    console.error('DuAn POST error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi thêm dự án' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updated = await updateDuAn(body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy dự án' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('DuAn PUT error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi cập nhật' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    const deleted = await deleteDuAn(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy dự án' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DuAn DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi xóa' }, { status: 500 });
  }
}
