import { NextRequest, NextResponse } from 'next/server';
import { getCongViec, addCongViec, updateCongViec, deleteCongViec } from '@/lib/google-sheets';
import { generateId } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trang_thai = searchParams.get('trang_thai') || '';
    const sale = searchParams.get('sale') || '';
    const pipeline = searchParams.get('pipeline') || '';

    let data = await getCongViec();

    if (trang_thai) data = data.filter(cv => cv.trang_thai === trang_thai);
    if (sale) data = data.filter(cv => cv.sale_phu_trach === sale);
    if (pipeline) data = data.filter(cv => cv.id_pipeline === pipeline);

    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error) {
    console.error('CongViec GET error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi đọc dữ liệu' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cv = {
      ...body,
      id_cong_viec: generateId('CV'),
      ngay_tao: new Date().toISOString(),
    };
    await addCongViec(cv);
    return NextResponse.json({ success: true, data: cv });
  } catch (error) {
    console.error('CongViec POST error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi thêm công việc' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updated = await updateCongViec(body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy công việc' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('CongViec PUT error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi cập nhật' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    const deleted = await deleteCongViec(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy công việc' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('CongViec DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi xóa' }, { status: 500 });
  }
}
