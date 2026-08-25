import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, getKhachHang, getNhanVien } from '@/lib/data-access';
import { canManageCustomer, getCrmSessionUser, isDirectManager, isTelesale } from '@/lib/crm-auth';
import { updateQualificationTransactional, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';
import type { KhachHang } from '@/lib/types';
import { validateQualificationInput } from '@/lib/crm-funnel/qualification-input';

type QualificationPatch = Pick<KhachHang,
  'du_an' | 'san_pham_quan_tam' | 'nhu_cau' | 'ngan_sach_min' | 'ngan_sach_max' |
  'muc_dich' | 'thoi_gian_du_kien' | 'phuong_an_tai_chinh' | 'khu_vuc_yeu_cau' |
  'muc_do_quan_tam' | 'hanh_dong_tiep_theo' | 'nguon'
>;

function cleanPatch(body: Record<string, unknown>, customer: KhachHang): QualificationPatch {
  const numberOrUndefined = (value: unknown) => value === '' || value === null || value === undefined ? undefined : Number(value);
  return {
    du_an: String(body.du_an ?? customer.du_an ?? '').trim(),
    san_pham_quan_tam: String(body.san_pham_quan_tam ?? customer.san_pham_quan_tam ?? '').trim(),
    nhu_cau: String(body.nhu_cau ?? customer.nhu_cau ?? '').trim(),
    ngan_sach_min: numberOrUndefined(body.ngan_sach_min ?? customer.ngan_sach_min),
    ngan_sach_max: numberOrUndefined(body.ngan_sach_max ?? customer.ngan_sach_max),
    muc_dich: (body.muc_dich ?? customer.muc_dich) as QualificationPatch['muc_dich'],
    thoi_gian_du_kien: (body.thoi_gian_du_kien ?? customer.thoi_gian_du_kien) as QualificationPatch['thoi_gian_du_kien'],
    phuong_an_tai_chinh: String(body.phuong_an_tai_chinh ?? customer.phuong_an_tai_chinh ?? '').trim(),
    khu_vuc_yeu_cau: String(body.khu_vuc_yeu_cau ?? customer.khu_vuc_yeu_cau ?? '').trim(),
    muc_do_quan_tam: (body.muc_do_quan_tam ?? customer.muc_do_quan_tam ?? 'Chưa xác định') as QualificationPatch['muc_do_quan_tam'],
    hanh_dong_tiep_theo: String(body.hanh_dong_tiep_theo ?? customer.hanh_dong_tiep_theo ?? '').trim(),
    nguon: String(body.nguon ?? customer.nguon ?? '').trim(),
  };
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const idempotencyKey = String(body.idempotency_key || '');
    if (!idempotencyKey) return NextResponse.json({ success: false, error: 'Thiếu idempotency_key' }, { status: 400 });
    const validationError = validateQualificationInput(body);
    if (validationError) return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    const [customers, projects, employees] = await Promise.all([getKhachHang(), getDuAn(), getNhanVien()]);
    const customer = customers.find(item => item.id_khach_hang === id);
    if (!customer) return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    const assignee = customer.telesale_phu_trach === user.ho_ten;
    if (!assignee && !canManageCustomer(user, customer, projects) && !isDirectManager(user, customer, employees)) {
      return NextResponse.json({ success: false, error: 'Không có quyền qualification khách này' }, { status: 403 });
    }
    const telesale = employees.find(item => item.ho_ten === customer.telesale_phu_trach);
    const manager = employees.find(item => item.ho_ten === telesale?.ql_truc_tiep && item.trang_thai !== 'Nghỉ việc');
    const directManager = manager && !isTelesale(manager) && manager.vai_tro !== 'HR'
      ? { id_nhan_vien: manager.id_nhan_vien, ho_ten: manager.ho_ten } : null;
    const result = await updateQualificationTransactional({
      customerId: id, actor: user, idempotencyKey, patch: cleanPatch(body, customer), directManager,
    });
    return NextResponse.json({ success: true, data: result.customer, score: result.score, handoff: result.handoff });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Qualified lead update]', error);
    return NextResponse.json({ success: false, error: 'Không thể cập nhật qualification' }, { status: 500 });
  }
}
