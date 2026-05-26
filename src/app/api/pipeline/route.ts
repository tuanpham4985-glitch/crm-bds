import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPipeline, addPipeline, updatePipeline, deletePipeline } from '@/lib/google-sheets';
import { generateId, getMonthKey } from '@/lib/utils';
import { SENIOR_EMPLOYEE_TYPES } from '@/lib/constants';

async function getSessionUser(): Promise<{ ho_ten: string; isAdmin: boolean }> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('crm_session');
    if (!session) return { ho_ten: '', isAdmin: false };
    const decoded = decodeURIComponent(escape(atob(session.value)));
    const u = JSON.parse(decoded);
    const isAdmin = u.vai_tro === 'Admin' || (SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(u.employee_type || '');
    return { ho_ten: u.ho_ten || '', isAdmin };
  } catch {
    return { ho_ten: '', isAdmin: false };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const giai_doan = searchParams.get('giai_doan') || '';
    const du_an = searchParams.get('du_an') || '';
    const sale = searchParams.get('sale') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    let data = await getPipeline();

    // Phân quyền: nhân viên thường chỉ thấy deals mà họ tham gia (bất kỳ vai trò nào)
    const { ho_ten, isAdmin } = await getSessionUser();
    if (!isAdmin && ho_ten) {
      data = data.filter(pl =>
        pl.sale_phu_trach === ho_ten ||
        (pl.gdda || '') === ho_ten ||
        (pl.gdkd || '') === ho_ten ||
        (pl.tkkd || '') === ho_ten
      );
    }

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

    const plDate = body.ngay_cap_nhat ? new Date(body.ngay_cap_nhat).toISOString() : new Date().toISOString();

    // Helper: chuẩn hoá tỷ lệ — nếu người dùng nhập 60 (%) thì hiểu là 0.60
    const norm = (v: number) => (v > 1 ? v / 100 : v);

    const ty_le_tra_sale = norm(Number(body.ty_le_tra_sale) || 0);
    const ty_le_kh       = norm(Number(body.ty_le_kh)       || 0);
    const ty_le_gdda     = norm(Number(body.ty_le_gdda)     || 0);
    const ty_le_gdkd     = norm(Number(body.ty_le_gdkd)     || 0);
    const ty_le_mkt      = norm(Number(body.ty_le_mkt)      || 0);

    // Công thức hoa hồng chính xác
    // phi_tra_sale / kh / mkt  = ty_le × gia_tri_thuc_te
    // phi_tra_gdda / gdkd      = ty_le × tien_hoa_hong
    const pl = {
      ...body,
      id_pipeline: generateId('PL'),
      gia_tri_thuc_te: gia_tri,
      hoa_hong: hoa_hong,
      tien_hoa_hong: tien_hoa_hong,
      ty_le_tra_sale,
      ty_le_kh,
      ty_le_gdda,
      ty_le_gdkd,
      ty_le_mkt,
      phi_tra_sale: ty_le_tra_sale * gia_tri,
      phi_tra_kh:   ty_le_kh       * gia_tri,
      phi_tra_gdda: ty_le_gdda     * tien_hoa_hong,
      phi_tra_gdkd: ty_le_gdkd     * tien_hoa_hong,
      phi_tra_mkt:  ty_le_mkt      * gia_tri,
      phi_tkkd: Number(body.phi_tkkd) || 0,
      ngay_cap_nhat: plDate,
      thang: getMonthKey(plDate),
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

    const plDate = body.ngay_cap_nhat ? new Date(body.ngay_cap_nhat).toISOString() : new Date().toISOString();

    const tien_hh = gia_tri * hoa_hong;
    const normPut = (v: number) => (v > 1 ? v / 100 : v);

    const tls  = normPut(Number(body.ty_le_tra_sale) || 0);
    const tlkh = normPut(Number(body.ty_le_kh)       || 0);
    const tlgd = normPut(Number(body.ty_le_gdda)     || 0);
    const tlgk = normPut(Number(body.ty_le_gdkd)     || 0);
    const tlmk = normPut(Number(body.ty_le_mkt)      || 0);

    body.gia_tri_thuc_te = gia_tri;
    body.hoa_hong        = hoa_hong;
    body.tien_hoa_hong   = tien_hh;
    body.ty_le_tra_sale  = tls;
    body.ty_le_kh        = tlkh;
    body.ty_le_gdda      = tlgd;
    body.ty_le_gdkd      = tlgk;
    body.ty_le_mkt       = tlmk;
    // phi_tra_sale / kh / mkt = ty_le × gia_tri_thuc_te
    // phi_tra_gdda / gdkd     = ty_le × tien_hoa_hong
    body.phi_tra_sale    = tls  * gia_tri;
    body.phi_tra_kh      = tlkh * gia_tri;
    body.phi_tra_gdda    = tlgd * tien_hh;
    body.phi_tra_gdkd    = tlgk * tien_hh;
    body.phi_tra_mkt     = tlmk * gia_tri;
    body.phi_tkkd        = Number(body.phi_tkkd) || 0;
    body.ngay_cap_nhat   = plDate;
    body.thang           = getMonthKey(plDate);

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