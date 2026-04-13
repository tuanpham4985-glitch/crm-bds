import { NextRequest, NextResponse } from 'next/server';
import { getKhachHang, addKhachHang, updateKhachHang, deleteKhachHang } from '@/lib/google-sheets';
import { generateId } from '@/lib/utils';
import type { KhachHang } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const nguon = searchParams.get('nguon') || '';
    const sale = searchParams.get('sale') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    let data = await getKhachHang();

    // Apply filters
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(kh =>
        kh.ten_KH.toLowerCase().includes(q) ||
        kh.so_dien_thoai.includes(q) ||
        kh.email.toLowerCase().includes(q)
      );
    }
    if (nguon) data = data.filter(kh => kh.nguon === nguon);
    if (sale) data = data.filter(kh => kh.sale_phu_trach === sale);
    if (from) data = data.filter(kh => new Date(kh.ngay_tao) >= new Date(from));
    if (to) data = data.filter(kh => new Date(kh.ngay_tao) <= new Date(to + 'T23:59:59'));

    const total = data.length;
    const start = (page - 1) * limit;
    const paginatedData = data.slice(start, start + limit);

    return NextResponse.json({
      success: true,
      data: paginatedData,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('KhachHang GET error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi đọc dữ liệu' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ✅ Validate
    if (!body.ten_KH || !body.so_dien_thoai) {
      return NextResponse.json(
        { success: false, error: 'Thiếu tên hoặc SĐT' },
        { status: 400 }
      );
    }

    // ✅ Fix số điện thoại
    const rawSdt = body.so_dien_thoai ?? '';
    const sdt = rawSdt.startsWith('0')
      ? rawSdt
      : '0' + rawSdt;

    // ✅ Tạo object chuẩn
    const kh: KhachHang = {
      id_khach_hang: `KH_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      ngay_tao: new Date().toISOString(),
      ten_KH: body.ten_KH,
      so_dien_thoai: sdt,
      email: body.email || '',
      nguon: body.nguon || '',
      nhu_cau: body.nhu_cau || '',
      ghi_chu: body.ghi_chu || '',
      sale_phu_trach: body.sale_phu_trach || '',
      label_khach: `${body.ten_KH} - ${sdt}`,
    };

    await addKhachHang(kh);

    return NextResponse.json({ success: true, data: kh });

  } catch (error) {
    console.error('KhachHang POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi thêm khách hàng' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updated = await updateKhachHang(body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('KhachHang PUT error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi cập nhật' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    const deleted = await deleteKhachHang(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('KhachHang DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi xóa' }, { status: 500 });
  }
}
