import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { canReassignGroupCustomer } from '@/lib/private-group-auth';
import { getPrivateGroup, listPrivateGroupMembers, reassignGroupCustomer } from '@/lib/crm-funnel/private-group';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// PATCH /api/private-groups/[id]/customers/[relationId] — giao lại 1 Customer
// trong nhóm cho Sale khác. CHỈ Admin/Leader của nhóm này (canReassignGroupCustomer)
// — Sale (kể cả người đang chăm sóc) không tự chuyển customer của mình cho
// người khác qua route này. assigned_to PHẢI là Leader hoặc member ĐÃ có
// trong nhóm — không giao cho người ngoài nhóm.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; relationId: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id, relationId } = await context.params;
    const group = await getPrivateGroup(id);
    if (!group) return NextResponse.json({ success: false, error: 'Không tìm thấy Nhóm riêng' }, { status: 404 });
    if (!canReassignGroupCustomer(user, group)) {
      return NextResponse.json({ success: false, error: 'Không có quyền giao khách hàng trong nhóm này' }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const assigned_to_id = String(body?.assigned_to_id || '').trim();
    const assigned_to_name = String(body?.assigned_to_name || '').trim();
    if (!assigned_to_id || !assigned_to_name) {
      return NextResponse.json({ success: false, error: 'Thiếu Sale được giao' }, { status: 400 });
    }
    const members = await listPrivateGroupMembers(id);
    const isEligible = assigned_to_id === group.leader_id || members.some(m => m.employee_id === assigned_to_id);
    if (!isEligible) {
      return NextResponse.json({ success: false, error: 'Chỉ được giao cho Leader hoặc Sale thành viên của chính nhóm này' }, { status: 400 });
    }
    const ok = await reassignGroupCustomer({ relationId, groupId: id, assigned_to_id, assigned_to_name });
    if (!ok) return NextResponse.json({ success: false, error: 'Không tìm thấy quan hệ khách hàng-nhóm này' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroup customer reassign]', error);
    return NextResponse.json({ success: false, error: 'Không thể giao lại khách hàng' }, { status: 500 });
  }
}
