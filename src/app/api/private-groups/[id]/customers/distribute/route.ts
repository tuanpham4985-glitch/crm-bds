import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { canReassignGroupCustomer } from '@/lib/private-group-auth';
import { getPrivateGroup, listPrivateGroupMembers, distributeGroupCustomersTransactional } from '@/lib/crm-funnel/private-group';
import type { TelesaleRef } from '@/lib/crm-funnel/campaign';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// POST /api/private-groups/[id]/customers/distribute — "Chia đều" (round-
// robin) Customer của nhóm cho các Sale được chọn. CÙNG authority với giao
// lại 1 Customer (canReassignGroupCustomer — Admin/Leader của nhóm này, Sale
// thường KHÔNG tự chia lại data của cả nhóm) — "chia đều" là hành động quản
// lý hàng loạt, KHÔNG mở cho mọi member như "+ Thêm khách hàng"/"Import
// Excel" (2 việc đó chỉ THÊM data của chính actor, không đụng assignment của
// người khác).
//
// source_assigned_to_id (optional) — CHỈ chia lại Customer đang giao cho
// ĐÚNG người này (VD vừa Import Excel/Thêm khách dồn hết vào 1 người), KHÔNG
// đụng khách đã được giao ổn định từ trước trong CÙNG nhóm. Bỏ trống -> chia
// lại TOÀN BỘ Customer của nhóm (xem distributeGroupCustomersTransactional).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const group = await getPrivateGroup(id);
    if (!group) return NextResponse.json({ success: false, error: 'Không tìm thấy Nhóm riêng' }, { status: 404 });
    if (!canReassignGroupCustomer(user, group)) {
      return NextResponse.json({ success: false, error: 'Không có quyền chia đều khách hàng trong nhóm này' }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { member_ids?: unknown; source_assigned_to_id?: unknown } | null;
    const memberIds = Array.isArray(body?.member_ids)
      ? body!.member_ids.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
    if (memberIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Chọn ít nhất 1 Sale để chia đều' }, { status: 400 });
    }

    // assigned_to (đích chia tới, VÀ nguồn lọc nếu có) PHẢI là Leader hoặc
    // member ĐÃ có trong nhóm — cùng validate với PATCH .../customers/[relationId]
    // (không chia cho/lọc theo người ngoài nhóm).
    const members = await listPrivateGroupMembers(id);
    function resolveGroupPerson(personId: string): TelesaleRef | null {
      if (personId === group!.leader_id) return { id_nhan_vien: group!.leader_id, ho_ten: group!.leader_name };
      const match = members.find(m => m.employee_id === personId);
      return match ? { id_nhan_vien: match.employee_id, ho_ten: match.employee_name } : null;
    }

    const telesales: TelesaleRef[] = [];
    for (const memberId of memberIds) {
      const resolved = resolveGroupPerson(memberId);
      if (!resolved) {
        return NextResponse.json({ success: false, error: 'Chỉ được chia cho Leader hoặc Sale thành viên của chính nhóm này' }, { status: 400 });
      }
      telesales.push(resolved);
    }

    let onlyCurrentlyAssignedToId: string | undefined;
    if (typeof body?.source_assigned_to_id === 'string' && body.source_assigned_to_id.trim()) {
      const resolvedSource = resolveGroupPerson(body.source_assigned_to_id.trim());
      if (!resolvedSource) {
        return NextResponse.json({ success: false, error: 'Nguồn lọc "đang giao cho" phải là Leader hoặc Sale thành viên của chính nhóm này' }, { status: 400 });
      }
      onlyCurrentlyAssignedToId = resolvedSource.id_nhan_vien;
    }

    const result = await distributeGroupCustomersTransactional({ groupId: id, telesales, onlyCurrentlyAssignedToId });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroup customers distribute]', error);
    return NextResponse.json({ success: false, error: 'Không thể chia đều khách hàng' }, { status: 500 });
  }
}
