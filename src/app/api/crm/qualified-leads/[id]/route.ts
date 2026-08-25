import { NextResponse } from 'next/server';
import { getDuAn, getNhanVien } from '@/lib/data-access';
import { buildCrmManagerScope, customerInManagerScope, getCrmSessionUser } from '@/lib/crm-auth';
import { prisma } from '@/lib/db/client';
import { assertTransactionalCrm, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    assertTransactionalCrm();
    const { id } = await context.params;
    const [projects, employees, customer] = await Promise.all([
      getDuAn(), getNhanVien(), prisma.khachHang.findUnique({ where: { id_khach_hang: id } }),
    ]);
    if (!customer) return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    const scope = buildCrmManagerScope(user, projects, employees);
    const assigned = customer.telesale_phu_trach === user.ho_ten || customer.sale_nhan_khach === user.ho_ten;
    if (!assigned && !customerInManagerScope(customer, scope)) return NextResponse.json({ success: false, error: 'Không có quyền xem khách hàng' }, { status: 403 });
    const [handoffs, pipelines] = await Promise.all([
      prisma.crmHandoff.findMany({ where: { customer_id: id }, orderBy: { created_at: 'desc' } }),
      prisma.pipeline.findMany({ where: { id_khach_hang: id }, orderBy: { created_at: 'asc' } }),
    ]);
    return NextResponse.json({ success: true, data: { customer, handoffs, pipelines } });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    return NextResponse.json({ success: false, error: 'Không thể tải chi tiết lead' }, { status: 500 });
  }
}
