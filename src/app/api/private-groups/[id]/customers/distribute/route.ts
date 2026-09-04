import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { canReassignGroupCustomer } from '@/lib/private-group-auth';
import { getPrivateGroup, listPrivateGroupMembers, distributeGroupCustomersTransactional } from '@/lib/crm-funnel/private-group';
import type { TelesaleRef } from '@/lib/crm-funnel/campaign';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// POST /api/private-groups/[id]/customers/distribute — "Chia đều" (round-
// robin) TOÀN BỘ Customer hiện có của nhóm cho các Sale được chọn. CÙNG
// authority với giao lại 1 Customer (canReassignGroupCustomer — Admin/Leader
// của nhóm này, Sale thường KHÔNG tự chia lại data của cả nhóm) — "chia đều"
// là hành động quản lý hàng loạt, KHÔNG mở cho mọi member như "+ Thêm khách
// hàng"/"Import Excel" (2 việc đó chỉ THÊM data của chính actor, không đụng
// assignment của người khác).
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

    const body = await request.json().catch(() => null) as { member_ids?: unknown } | null;
    const memberIds = Array.isArray(body?.member_ids)
      ? body!.member_ids.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
    if (memberIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Chọn ít nhất 1 Sale để chia đều' }, { status: 400 });
    }

    // assigned_to PHẢI là Leader hoặc member ĐÃ có trong nhóm — cùng validate
    // với PATCH .../customers/[relationId] (không chia cho người ngoài nhóm).
    const members = await listPrivateGroupMembers(id);
    const telesales: TelesaleRef[] = [];
    for (const memberId of memberIds) {
      if (memberId === group.leader_id) {
        telesales.push({ id_nhan_vien: group.leader_id, ho_ten: group.leader_name });
        continue;
      }
      const match = members.find(m => m.employee_id === memberId);
      if (!match) {
        return NextResponse.json({ success: false, error: 'Chỉ được chia cho Leader hoặc Sale thành viên của chính nhóm này' }, { status: 400 });
      }
      telesales.push({ id_nhan_vien: match.employee_id, ho_ten: match.employee_name });
    }

    const result = await distributeGroupCustomersTransactional({ groupId: id, telesales });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroup customers distribute]', error);
    return NextResponse.json({ success: false, error: 'Không thể chia đều khách hàng' }, { status: 500 });
  }
}
