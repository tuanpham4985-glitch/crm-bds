import { NextRequest, NextResponse } from 'next/server';
import { getPipeline, addPipeline, updatePipeline, deletePipeline } from '@/lib/google-sheets';
import { generateId, getMonthKey } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const giai_doan = searchParams.get('giai_doan') || '';
    const du_an = searchParams.get('du_an') || '';
    const sale = searchParams.get('sale') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    let data = await getPipeline();

    if (giai_doan) data = data.filter(pl => pl.giai_doan === giai_doan);
    if (du_an) data = data.filter(pl => pl.id_du_an === du_an);
    if (sale) data = data.filter(pl => pl.sale_phu_trach === sale);
    if (from) data = data.filter(pl => new Date(pl.ngay_cap_nhat) >= new Date(from));
    if (to) data = data.filter(pl => new Date(pl.ngay_cap_nhat) <= new Date(to + 'T23:59:59'));

    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error) {
    console.error('Pipeline GET error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi đọc dữ liệu' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();

    // ===== CHUẨN HÓA DỮ LIỆU =====
    let gia_tri = Number(body.gia_tri_thuc_te) || 0;

    // 🔥 FIX QUAN TRỌNG Ở ĐÂY
    let hoa_hong = Number(
      body.hoa_hong !== undefined ? body.hoa_hong : body.hoa_hong_mac_dinh
    ) || 0;

    // Nếu nhập 2 → hiểu là 2%
    if (hoa_hong > 1) {
      hoa_hong = hoa_hong / 100;
    }

    const tien_hoa_hong = gia_tri * hoa_hong;

    const pl = {
      ...body,
      id_pipeline: generateId('PL'),
      gia_tri_thuc_te: gia_tri,
      hoa_hong: hoa_hong,
      tien_hoa_hong: tien_hoa_hong,
      ngay_cap_nhat: now,
      thang: getMonthKey(now),
    };

    await addPipeline(pl);

    return NextResponse.json({ success: true, data: pl });
  } catch (error) {
    console.error('Pipeline POST error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi thêm deal' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // ===== CHUẨN HÓA DỮ LIỆU =====
    let gia_tri = Number(body.gia_tri_thuc_te) || 0;
    let hoa_hong = Number(body.hoa_hong) || 0;

    if (hoa_hong > 1) {
      hoa_hong = hoa_hong / 100;
    }

    body.gia_tri_thuc_te = gia_tri;
    body.hoa_hong = hoa_hong;
    body.tien_hoa_hong = gia_tri * hoa_hong;

    const updated = await updatePipeline(body);

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy deal' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('Pipeline PUT error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi cập nhật' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    const deleted = await deletePipeline(id);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy deal' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Pipeline DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi xóa' }, { status: 500 });
  }
}