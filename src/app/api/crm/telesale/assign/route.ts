import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, getKhachHang, getNhanVien } from '@/lib/data-access';
import { canManageCustomer, getCrmSessionUser, isDirectManager, isTelesale } from '@/lib/crm-auth';
import { assignTelesaleTransactional, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

export async function POST(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { customer_id, telesale } = await request.json() as { customer_id?: string; telesale?: string };
    if (!customer_id) return NextResponse.json({ success: false, error: 'Thiếu customer_id' }, { status: 400 });
    const [customers, projects, employees] = await Promise.all([getKhachHang(), getDuAn(), getNhanVien()]);
    const customer = customers.find(item => item.id_khach_hang === customer_id);
    if (!customer) return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    if (!canManageCustomer(user, customer, projects) && !isDirectManager(user, customer, employees)) {
      return NextResponse.json({ success: false, error: 'Bạn không có quyền phân data khách này' }, { status: 403 });
    }
    if (customer.trang_thai_ban_giao === 'Đã nhận') {
      return NextResponse.json({ success: false, error: 'Ownership đã khóa sau khi Sale nhận khách' }, { status: 409 });
    }
    if (telesale) {
      const target = employees.find(item => item.ho_ten === telesale && item.trang_thai !== 'Nghỉ việc');
      if (!target || !isTelesale(target)) return NextResponse.json({ success: false, error: 'Người được chọn không phải Telesale/CSKH đang hoạt động' }, { status: 400 });
    }
    const updated = await assignTelesaleTransactional({ customerId: customer.id_khach_hang, telesaleName: telesale || '', actor: user });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    const message = error instanceof Error && error.message === 'OWNERSHIP_LOCKED' ? 'Ownership đã khóa sau khi Sale nhận khách' : 'Không thể phân data';
    return NextResponse.json({ success: false, error: message }, { status: error instanceof Error && error.message === 'OWNERSHIP_LOCKED' ? 409 : 500 });
  }
}
