import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, getKhachHang, getNhanVien, getPipeline, addKhachHang, updateKhachHang, deleteKhachHang } from '@/lib/data-access';
import { canManageCustomer, canViewCustomer, customerDeleteBlockReason, getCrmSessionUser, isCrmAdmin, isDirectManager } from '@/lib/crm-auth';
import { getCampaignMembershipCustomerRefs, getCampaignNamesByCustomerIds } from '@/lib/crm-funnel/campaign';
import { getDatasetMembershipCustomerRefs } from '@/lib/crm-funnel/dataset';
import { matchesCampaignStatusFilter, summarizeCampaignMembership, type CampaignStatusFilter } from '@/lib/khach-hang-campaign-status';
import type { KhachHang } from '@/lib/types';

const CAMPAIGN_STATUS_FILTERS = new Set<string>(['all', 'in_campaign', 'not_in_campaign']);

export async function GET(request: NextRequest) {
  try {
    const user = await getCrmSessionUser();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const id = searchParams.get('id') || '';
    const nguon = searchParams.get('nguon') || '';
    const sale = searchParams.get('sale') || '';
    const du_an = searchParams.get('du_an') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const campaignStatusRaw = searchParams.get('campaignStatus') || 'all';
    const campaignStatus: CampaignStatusFilter = CAMPAIGN_STATUS_FILTERS.has(campaignStatusRaw) ? (campaignStatusRaw as CampaignStatusFilter) : 'all';
    const datasetId = searchParams.get('datasetId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // CUSTOMER USED-IN-CAMPAIGN VISIBILITY — getCampaignMembershipCustomerRefs()
    // trả về distinct customer_id đã có >=1 CampaignMembership qua ĐÚNG 1 query
    // (đã dùng sẵn cho delete-guard ở DELETE bên dưới) — KHÔNG query
    // CampaignMembership theo từng customer (N+1) dù dataset có hàng nghìn dòng.
    const [projects, employees, allCustomers, membershipRefs] = await Promise.all([
      getDuAn(), getNhanVien(), getKhachHang(), getCampaignMembershipCustomerRefs(),
    ]);
    const membershipSet = new Set(membershipRefs.map(ref => ref.customer_id));
    // CUSTOMER DATASET — query RIÊNG (không gộp vào Promise.all trên, giữ
    // đúng shape khoá bởi test), chỉ chạy khi có datasetId.
    const datasetMembershipRefs = datasetId ? await getDatasetMembershipCustomerRefs(datasetId) : [];
    const datasetMembershipSet = new Set(datasetMembershipRefs.map(ref => ref.customer_id));
    let data = allCustomers.filter(customer => canViewCustomer(user, customer, projects) || isDirectManager(user, customer, employees));

    if (id) data = data.filter(kh => kh.id_khach_hang === id);
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
    if (sale === '__none__') data = data.filter(kh => !kh.sale_phu_trach);
    else if (sale) data = data.filter(kh => kh.sale_phu_trach === sale);
    if (du_an) data = data.filter(kh => kh.du_an === du_an);
    if (from) data = data.filter(kh => new Date(kh.ngay_tao) >= new Date(from));
    if (to) data = data.filter(kh => new Date(kh.ngay_tao) <= new Date(to + 'T23:59:59'));

    // "total" giữ NGUYÊN ý nghĩa cũ (khớp mọi filter phía trên, KHÔNG tính
    // campaignStatus) — Customer Range trên client (validateListRangeAgainstTotal)
    // và "Chọn tất cả N phù hợp bộ lọc" đều dựa vào đúng con số này, và
    // resolveCustomerIdsByRange/resolveCustomerIdsByFilter (Locked authority)
    // cũng KHÔNG biết gì về campaignStatus — đổi ý nghĩa "total" ở đây sẽ làm
    // range/select-all lệch với dữ liệu server thật sự resolve khi submit.
    const total = data.length;
    const campaignSummary = summarizeCampaignMembership(data.map(kh => kh.id_khach_hang), membershipSet);

    // campaignStatus là filter MỚI, tách biệt hoàn toàn khỏi total/scope ở
    // trên — chỉ thu hẹp tập hiển thị + phân trang, không đụng "total".
    data = data.filter(kh => matchesCampaignStatusFilter(kh.id_khach_hang, membershipSet, campaignStatus));
    // CUSTOMER DATASET — cùng tinh thần campaignStatus: filter MỚI, không đụng
    // "total" (đã tính ở trên trước khi áp dụng cả 2 filter này).
    if (datasetId) data = data.filter(kh => datasetMembershipSet.has(kh.id_khach_hang));

    const filteredTotal = data.length;
    const start = (page - 1) * limit;
    const paginatedData = data.slice(start, start + limit);
    // Badge/tooltip "Đã vào Campaign": chỉ query tên Campaign cho id CỦA TRANG
    // ĐANG HIỂN THỊ (tối đa `limit` dòng) đã có membership — 1 query duy nhất,
    // không tải toàn bộ CampaignMembership/Customer object nào khác về.
    const campaignByCustomer = await getCampaignNamesByCustomerIds(
      paginatedData.filter(kh => membershipSet.has(kh.id_khach_hang)).map(kh => kh.id_khach_hang),
    );

    return NextResponse.json({
      success: true,
      data: paginatedData,
      total,
      filteredTotal,
      campaignSummary,
      campaignByCustomer,
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
    const user = await getCrmSessionUser();
    if (!isCrmAdmin(user)) {
      return NextResponse.json({ success: false, error: 'Không có quyền thêm khách hàng' }, { status: 403 });
    }
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
    const phoneKey = (value: string) => value.replace(/\D/g, '').slice(-9);
    if ((await getKhachHang()).some(customer => phoneKey(customer.so_dien_thoai) === phoneKey(sdt))) {
      return NextResponse.json({ success: false, error: 'Số điện thoại đã tồn tại trong CRM' }, { status: 409 });
    }

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
      du_an: body.du_an || '',
      telesale_phu_trach: body.telesale_phu_trach || '',
      sale_nhan_khach: body.sale_nhan_khach || '',
      trang_thai_cham_soc: body.trang_thai_cham_soc || 'Chưa gọi',
      muc_do_quan_tam: body.muc_do_quan_tam || 'Chưa xác định',
      so_lan_lien_he: 0,
      lich_su_cham_soc: '[]',
      trang_thai_ban_giao: 'Chưa bàn giao',
      lich_su_ban_giao: '[]',
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
    const user = await getCrmSessionUser();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const [customers, projects, employees] = await Promise.all([getKhachHang(), getDuAn(), getNhanVien()]);
    const current = customers.find(customer => customer.id_khach_hang === body.id_khach_hang);
    if (!current) return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    if (!canManageCustomer(user, current, projects) && !isDirectManager(user, current, employees)) {
      return NextResponse.json({ success: false, error: 'Không có quyền cập nhật khách hàng' }, { status: 403 });
    }

    const phoneKey = (value: string) => value.replace(/\D/g, '').slice(-9);
    const requestedPhone = String(body.so_dien_thoai ?? current.so_dien_thoai);
    if ((await getKhachHang()).some(customer => customer.id_khach_hang !== current.id_khach_hang
      && phoneKey(customer.so_dien_thoai) === phoneKey(requestedPhone))) {
      return NextResponse.json({ success: false, error: 'Số điện thoại đã tồn tại trong CRM' }, { status: 409 });
    }
    const safeUpdate: KhachHang = {
      ...current,
      ten_KH: String(body.ten_KH ?? current.ten_KH),
      so_dien_thoai: String(body.so_dien_thoai ?? current.so_dien_thoai),
      email: String(body.email ?? current.email),
      nguon: String(body.nguon ?? current.nguon),
      nhu_cau: String(body.nhu_cau ?? current.nhu_cau),
      ghi_chu: String(body.ghi_chu ?? current.ghi_chu),
      du_an: String(body.du_an ?? current.du_an ?? ''),
      label_khach: `${String(body.ten_KH ?? current.ten_KH)} - ${String(body.so_dien_thoai ?? current.so_dien_thoai)}`,
    };
    const updated = await updateKhachHang(safeUpdate);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: safeUpdate });
  } catch (error) {
    console.error('KhachHang PUT error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi cập nhật' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCrmSessionUser();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    const { id } = await request.json();
    const [customers, projects, employees, pipelines, campaignMemberships] = await Promise.all([
      getKhachHang(), getDuAn(), getNhanVien(), getPipeline(), getCampaignMembershipCustomerRefs(),
    ]);
    const current = customers.find(customer => customer.id_khach_hang === id);
    if (!current) return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    if (!canManageCustomer(user, current, projects) && !isDirectManager(user, current, employees)) {
      return NextResponse.json({ success: false, error: 'Không có quyền xóa khách hàng' }, { status: 403 });
    }
    const blockReason = customerDeleteBlockReason(current, pipelines, campaignMemberships);
    if (blockReason) {
      return NextResponse.json({ success: false, error: blockReason }, { status: 409 });
    }
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
