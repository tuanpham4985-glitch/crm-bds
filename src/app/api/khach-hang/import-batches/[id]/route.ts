import { NextResponse } from 'next/server';
import { getPipeline } from '@/lib/data-access';
import { customerDeleteBlockReason, getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getImportBatch, getImportBatchCustomers } from '@/lib/crm-funnel/import-batch';
import { assertTransactionalCrm, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Không có quyền xem lịch sử import' }, { status: 403 });
  try {
    assertTransactionalCrm();
    const { id } = await context.params;
    const [batch, customers, pipelines] = await Promise.all([getImportBatch(id), getImportBatchCustomers(id), getPipeline()]);
    if (!batch) return NextResponse.json({ success: false, error: 'Không tìm thấy đợt import' }, { status: 404 });

    // Preview xóa: tính sẵn eligibility cho từng customer đang thuộc batch,
    // dùng đúng authority với single-delete/bulk-delete (customerDeleteBlockReason).
    const customersWithEligibility = customers.map(customer => {
      const blockReason = customerDeleteBlockReason(customer, pipelines);
      return {
        id_khach_hang: customer.id_khach_hang,
        ten_KH: customer.ten_KH,
        so_dien_thoai: customer.so_dien_thoai,
        email: customer.email,
        eligible: !blockReason,
        blockReason,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        batch,
        customers: customersWithEligibility,
        eligibleCount: customersWithEligibility.filter(c => c.eligible).length,
        protectedCount: customersWithEligibility.filter(c => !c.eligible).length,
      },
    });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Import batch detail]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải chi tiết đợt import' }, { status: 500 });
  }
}
