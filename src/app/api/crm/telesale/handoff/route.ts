import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, getKhachHang, getNhanVien } from '@/lib/data-access';
import { canManageCustomer, getCrmSessionUser, isDirectManager, isTelesale } from '@/lib/crm-auth';
import { transitionHandoffTransactional, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';
import { canActOnHandoff, validRejectionReason } from '@/lib/crm-funnel/handoff-policy';

export async function POST(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { customer_id, idempotency_key, action, sale_nhan, ghi_chu } = await request.json() as {
      customer_id?: string; idempotency_key?: string; action?: 'handoff' | 'accept' | 'reject'; sale_nhan?: string; ghi_chu?: string;
    };
    if (!customer_id || !idempotency_key || !action) return NextResponse.json({ success: false, error: 'Thiếu customer_id, idempotency_key hoặc action' }, { status: 400 });
    const [customers, projects, employees] = await Promise.all([getKhachHang(), getDuAn(), getNhanVien()]);
    const customer = customers.find(item => item.id_khach_hang === customer_id);
    if (!customer) return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    const manager = canManageCustomer(user, customer, projects) || isDirectManager(user, customer, employees);
    const receiver = customer.sale_nhan_khach === user.ho_ten;
    if (!canActOnHandoff({ action, isManager: manager, isReceiver: receiver })) return NextResponse.json({ success: false, error: 'Bạn không có quyền thực hiện bàn giao này' }, { status: 403 });
    if (action === 'reject' && !validRejectionReason(ghi_chu)) return NextResponse.json({ success: false, error: 'Từ chối phải có lý do' }, { status: 400 });
    let targetSale: { id_nhan_vien: string; ho_ten: string } | undefined;
    if (action === 'handoff') {
      const target = employees.find(item => item.ho_ten === sale_nhan && item.trang_thai !== 'Nghỉ việc');
      if (!target || isTelesale(target) || target.vai_tro === 'HR') return NextResponse.json({ success: false, error: 'Sale nhận khách không hợp lệ' }, { status: 400 });
      targetSale = { id_nhan_vien: target.id_nhan_vien, ho_ten: target.ho_ten };
    }
    const result = await transitionHandoffTransactional({
      customerId: customer.id_khach_hang, actor: user, idempotencyKey: idempotency_key,
      action, targetSale, reason: String(ghi_chu || '').trim() || undefined,
    });
    return NextResponse.json({ success: true, data: result.customer, handoff: result.handoff, pipeline: result.pipeline });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    const code = error instanceof Error ? error.message : '';
    const status = ['HANDOFF_ALREADY_ACCEPTED', 'ACTIVE_HANDOFF_NOT_FOUND'].includes(code) ? 409 : code === 'NOT_HANDOFF_RECEIVER' ? 403 : 500;
    const messages: Record<string, string> = {
      HANDOFF_ALREADY_ACCEPTED: 'Sale đã nhận khách; ownership đã khóa', ACTIVE_HANDOFF_NOT_FOUND: 'Không có handoff active',
      NOT_HANDOFF_RECEIVER: 'Bạn không phải người nhận handoff', REJECTION_REASON_REQUIRED: 'Từ chối phải có lý do',
    };
    return NextResponse.json({ success: false, error: messages[code] || 'Không thể xử lý bàn giao' }, { status });
  }
}
