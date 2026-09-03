import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { canManagePrivateGroupMembers } from '@/lib/private-group-auth';
import { addPrivateGroupMember, getPrivateGroup, removePrivateGroupMember } from '@/lib/crm-funnel/private-group';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// POST /api/private-groups/[id]/members — thêm Sale vào nhóm. Admin hoặc
// ĐÚNG Leader của nhóm này (canManagePrivateGroupMembers) — Leader nhóm khác
// không thêm được member cho nhóm này.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const group = await getPrivateGroup(id);
    if (!group) return NextResponse.json({ success: false, error: 'Không tìm thấy Nhóm riêng' }, { status: 404 });
    if (!canManagePrivateGroupMembers(user, group)) {
      return NextResponse.json({ success: false, error: 'Không có quyền thêm thành viên vào nhóm này' }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const employee_id = String(body?.employee_id || '').trim();
    const employee_name = String(body?.employee_name || '').trim();
    if (!employee_id || !employee_name) {
      return NextResponse.json({ success: false, error: 'Thiếu nhân viên cần thêm' }, { status: 400 });
    }
    if (employee_id === group.leader_id) {
      return NextResponse.json({ success: false, error: 'Leader đã tự động có toàn quyền trong nhóm, không cần thêm làm member' }, { status: 400 });
    }
    const member = await addPrivateGroupMember({ group_id: id, employee_id, employee_name, actor: user });
    return NextResponse.json({ success: true, data: member });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroup member add]', error);
    return NextResponse.json({ success: false, error: 'Không thể thêm thành viên' }, { status: 500 });
  }
}

// DELETE /api/private-groups/[id]/members?employee_id=... — gỡ Sale khỏi nhóm.
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const group = await getPrivateGroup(id);
    if (!group) return NextResponse.json({ success: false, error: 'Không tìm thấy Nhóm riêng' }, { status: 404 });
    if (!canManagePrivateGroupMembers(user, group)) {
      return NextResponse.json({ success: false, error: 'Không có quyền gỡ thành viên khỏi nhóm này' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const employee_id = searchParams.get('employee_id') || '';
    if (!employee_id) return NextResponse.json({ success: false, error: 'Thiếu employee_id' }, { status: 400 });
    await removePrivateGroupMember(id, employee_id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroup member remove]', error);
    return NextResponse.json({ success: false, error: 'Không thể gỡ thành viên' }, { status: 500 });
  }
}
