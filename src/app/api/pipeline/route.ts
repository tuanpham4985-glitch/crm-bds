import { NextRequest, NextResponse } from 'next/server';
import { getPipeline, addPipeline, updatePipeline, deletePipeline, addCongViec } from '@/lib/data-access';
import { generateId, getMonthKey } from '@/lib/utils';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';

// Task được tạo tự động khi pipeline chuyển sang giai đoạn mới
const STAGE_TASKS: Record<string, { ten: string; days: number }> = {
  'Đã liên hệ':           { ten: 'Gọi tư vấn thêm',                    days: 1 },
  'Hẹn xem':              { ten: 'Xác nhận lịch hẹn & chuẩn bị hồ sơ', days: 2 },
  'Đặt cọc':              { ten: 'Soạn hợp đồng đặt cọc',              days: 3 },
  'Ký HĐ':                { ten: 'Hoàn tất thủ tục ký hợp đồng',       days: 5 },
  'Hủy - Không nghe máy': { ten: 'Ghi nhận lý do & lưu hồ sơ khách',   days: 1 },
  'Hủy - Không đủ tiền':  { ten: 'Ghi nhận lý do & lưu hồ sơ khách',   days: 1 },
  'Hủy - Không thích':    { ten: 'Ghi nhận lý do & lưu hồ sơ khách',   days: 1 },
};

function isTelesaleSession(user: { vai_tro: string; employee_type?: string }): boolean {
  return `${user.vai_tro} ${user.employee_type || ''}`.toLowerCase().includes('telesale')
    || `${user.vai_tro} ${user.employee_type || ''}`.toLowerCase().includes('cskh');
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCrmSessionUser();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const giai_doan = searchParams.get('giai_doan') || '';
    const du_an = searchParams.get('du_an') || '';
    const sale = searchParams.get('sale') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    let data = await getPipeline();

    // Phân quyền: nhân viên thường chỉ thấy deals mà họ tham gia (bất kỳ vai trò nào)
    const ho_ten = user.ho_ten;
    if (!isCrmAdmin(user)) {
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
    const user = await getCrmSessionUser();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    if (isTelesaleSession(user) || (!isCrmAdmin(user) && body.sale_phu_trach !== user.ho_ten)) {
      return NextResponse.json({ success: false, error: 'Không có quyền tạo deal cho Sale này' }, { status: 403 });
    }
    if (body.id_khach_hang && (await getPipeline()).some(item => item.id_khach_hang === body.id_khach_hang)) {
      return NextResponse.json({ success: false, error: 'Khách hàng đã có deal trong Pipeline' }, { status: 409 });
    }
    // ===== CHUẨN HÓA DỮ LIỆU =====
    const gia_tri = Number(body.gia_tri_thuc_te) || 0;

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
    const user = await getCrmSessionUser();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const existing = (await getPipeline()).find(item => item.id_pipeline === body.id_pipeline);
    if (!existing) return NextResponse.json({ success: false, error: 'Không tìm thấy deal' }, { status: 404 });
    if (isTelesaleSession(user) || (!isCrmAdmin(user) && existing.sale_phu_trach !== user.ho_ten)) {
      return NextResponse.json({ success: false, error: 'Không có quyền cập nhật deal' }, { status: 403 });
    }
    if (!isCrmAdmin(user)) body.sale_phu_trach = existing.sale_phu_trach;

    // ===== CHUẨN HÓA DỮ LIỆU =====
    const gia_tri = Number(body.gia_tri_thuc_te) || 0;
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

    const { updated, oldGiaiDoan } = await updatePipeline(body);

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy deal' }, { status: 404 });
    }

    // Tự động tạo task khi giai đoạn thay đổi
    if (oldGiaiDoan && oldGiaiDoan !== body.giai_doan) {
      const taskDef = STAGE_TASKS[body.giai_doan];
      if (taskDef) {
        const ngayHen = new Date();
        ngayHen.setDate(ngayHen.getDate() + taskDef.days);
        await addCongViec({
          id_cong_viec:   `CV_${Date.now()}`,
          ngay_tao:       new Date().toISOString(),
          ghi_chu:        taskDef.ten,
          id_pipeline:    body.id_pipeline,
          trang_thai:     'Chưa xử lý',
          ngay_hen:       ngayHen.toISOString(),
          sale_phu_trach: body.sale_phu_trach || '',
          ket_qua:        '',
        }).catch(e => console.warn('[pipeline] auto-task failed:', e));
      }
    }

    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('Pipeline PUT error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi cập nhật' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCrmSessionUser();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Chỉ quản lý được xóa deal' }, { status: 403 });
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
