import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { canChangePrivateGroupLeader, canRenamePrivateGroup, canViewPrivateGroup } from '@/lib/private-group-auth';
import { getPrivateGroup, listPrivateGroupMembers, updatePrivateGroup } from '@/lib/crm-funnel/private-group';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// GET /api/private-groups/[id] — chi tiết nhóm + danh sách member. Admin/
// Leader/Sale thành viên xem được (canViewPrivateGroup) — người ngoài nhóm bị
// 403, KHÔNG lộ tên/Leader nhóm khác qua route detail dù biết id.
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
    return NextResponse.json({ success: true, data: { group, members } });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroup detail]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải chi tiết Nhóm riêng' }, { status: 500 });
  }
}

// PATCH /api/private-groups/[id] — đổi tên (Admin hoặc Leader của nhóm) và/
// hoặc đổi Leader (CHỈ Admin — Leader hiện tại không được tự đổi Leader của
// chính nhóm mình, cùng pattern campaignOwnerFieldsTouched). Check theo field
// presence (hasOwnProperty), KHÔNG theo truthiness, để leader_id gửi rỗng/null
// không lách được gate.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const group = await getPrivateGroup(id);
    if (!group) return NextResponse.json({ success: false, error: 'Không tìm thấy Nhóm riêng' }, { status: 404 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ success: false, error: 'Thiếu dữ liệu cập nhật' }, { status: 400 });

    const touchesLeader = Object.prototype.hasOwnProperty.call(body, 'leader_id')
      || Object.prototype.hasOwnProperty.call(body, 'leader_name');
    const touchesName = Object.prototype.hasOwnProperty.call(body, 'name');

    if (touchesName && !canRenamePrivateGroup(user, group)) {
      return NextResponse.json({ success: false, error: 'Không có quyền đổi tên nhóm này' }, { status: 403 });
    }
    if (touchesLeader && !canChangePrivateGroupLeader(user)) {
      return NextResponse.json({ success: false, error: 'Chỉ Admin được đổi Leader của Nhóm riêng' }, { status: 403 });
    }
    if (!touchesName && !touchesLeader) {
      return NextResponse.json({ success: false, error: 'Không có gì để cập nhật' }, { status: 400 });
    }

    let leaderPatch: { leader_id?: string; leader_name?: string } = {};
    if (touchesLeader) {
      const leader_id = String(body.leader_id || '').trim();
      const leader_name = String(body.leader_name || '').trim();
      if (!leader_id || !leader_name) {
        return NextResponse.json({ success: false, error: 'Phải chọn đúng 1 Leader cho nhóm' }, { status: 400 });
      }
      leaderPatch = { leader_id, leader_name };
    }
    const name = touchesName ? String(body.name || '').trim() : undefined;
    if (touchesName && !name) return NextResponse.json({ success: false, error: 'Tên nhóm không được để trống' }, { status: 400 });

    const updated = await updatePrivateGroup(id, { name, ...leaderPatch });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroup update]', error);
    return NextResponse.json({ success: false, error: 'Không thể cập nhật Nhóm riêng' }, { status: 500 });
  }
}
