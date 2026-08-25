import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, getKhachHang, getNhanVien } from '@/lib/data-access';
import { canManageCustomer, getCrmSessionUser, isDirectManager, isTelesale } from '@/lib/crm-auth';
import { recordInteractionTransactional, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';
import type { MucDoQuanTam, TrangThaiChamSoc } from '@/lib/types';

const STATUSES: TrangThaiChamSoc[] = ['Chưa gọi', 'Không nghe máy', 'Gọi lại', 'Đã liên hệ', 'Quan tâm', 'Không phù hợp', 'Sai số'];
const INTERESTS: MucDoQuanTam[] = ['Chưa xác định', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];

export async function POST(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const body = await request.json() as {
      customer_id?: string; idempotency_key?: string; ket_qua?: TrangThaiChamSoc;
      muc_do_quan_tam?: MucDoQuanTam; ghi_chu?: string; ngay_lien_he_tiep?: string;
    };
    if (!body.customer_id || !body.idempotency_key || !body.ket_qua || !STATUSES.includes(body.ket_qua)) {
      return NextResponse.json({ success: false, error: 'Thiếu customer_id, idempotency_key hoặc kết quả chăm sóc' }, { status: 400 });
    }
    if (body.muc_do_quan_tam && !INTERESTS.includes(body.muc_do_quan_tam)) {
      return NextResponse.json({ success: false, error: 'Mức độ quan tâm không hợp lệ' }, { status: 400 });
    }
    const [customers, projects, employees] = await Promise.all([getKhachHang(), getDuAn(), getNhanVien()]);
    const customer = customers.find(item => item.id_khach_hang === body.customer_id);
    if (!customer) return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    const isAssignee = customer.telesale_phu_trach === user.ho_ten;
    if (!isAssignee && !canManageCustomer(user, customer, projects) && !isDirectManager(user, customer, employees)) {
      return NextResponse.json({ success: false, error: 'Khách hàng không được giao cho bạn' }, { status: 403 });
    }
    const telesale = employees.find(item => item.ho_ten === (customer.telesale_phu_trach || user.ho_ten));
    const manager = employees.find(item => item.ho_ten === telesale?.ql_truc_tiep && item.trang_thai !== 'Nghỉ việc');
    const directManager = manager && !isTelesale(manager) && manager.vai_tro !== 'HR'
      ? { id_nhan_vien: manager.id_nhan_vien, ho_ten: manager.ho_ten } : null;
    const result = await recordInteractionTransactional({
      customerId: customer.id_khach_hang,
      actor: user,
      idempotencyKey: body.idempotency_key,
      result: body.ket_qua,
      interest: body.muc_do_quan_tam || 'Chưa xác định',
      note: String(body.ghi_chu || '').trim(),
      nextContact: body.ngay_lien_he_tiep || undefined,
      directManager,
    });
    return NextResponse.json({
      success: true,
      data: result.customer,
      handoff: result.handoff,
      idempotent: result.idempotent,
      warning: result.handoff?.status === 'NEEDS_MANAGER' ? 'Khách đã xác nhận quan tâm nhưng chưa có Sale quản lý trực tiếp; đã đưa vào hàng chờ quản lý xử lý.' : undefined,
    });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[CRM Telesale interaction]', error);
    return NextResponse.json({ success: false, error: 'Không thể lưu kết quả chăm sóc' }, { status: 500 });
  }
}
