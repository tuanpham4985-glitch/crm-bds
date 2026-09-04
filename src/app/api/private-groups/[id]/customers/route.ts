import { NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { canViewPrivateGroup, filterGroupCustomersForUser } from '@/lib/private-group-auth';
import { getPrivateGroup, getPrivateGroupCustomersWithDetails, listPrivateGroupMembers } from '@/lib/crm-funnel/private-group';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// GET /api/private-groups/[id]/customers — danh sách Customer của nhóm ĐÃ LỌC
// theo quyền (filterGroupCustomersForUser): Admin/Leader/Sale THÀNH VIÊN của
// nhóm này thấy TOÀN BỘ Customer của nhóm (NEW policy — group membership =
// group-wide READ, xem comment đầu private-group-auth.ts) — enforce server-
// side, KHÔNG trả nguyên mảng cho client tự lọc.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const group = await getPrivateGroup(id);
    if (!group) return NextResponse.json({ success: false, error: 'Không tìm thấy Nhóm riêng' }, { status: 404 });
    const members = await listPrivateGroupMembers(id);
    if (!canViewPrivateGroup(user, group, members)) {
      return NextResponse.json({ success: false, error: 'Không có quyền xem Nhóm riêng này' }, { status: 403 });
    }
    const relations = await getPrivateGroupCustomersWithDetails(id);
    const visible = filterGroupCustomersForUser(user, group, members, relations);
    return NextResponse.json({ success: true, data: visible });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroup customers list]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải danh sách khách hàng của nhóm' }, { status: 500 });
  }
}
