import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { canCreatePrivateGroup, filterPrivateGroupsForUser } from '@/lib/private-group-auth';
import { createPrivateGroup, listAllPrivateGroupMembers, listPrivateGroups } from '@/lib/crm-funnel/private-group';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// GET  /api/private-groups — danh sách Nhóm riêng ĐÃ LỌC theo quyền (Admin
// thấy hết; Leader/Sale chỉ thấy nhóm mình là Leader hoặc member) — server-side
// authority, KHÔNG trả nguyên danh sách rồi tin client tự lọc.
export async function GET() {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const [groups, members] = await Promise.all([listPrivateGroups(), listAllPrivateGroupMembers()]);
    const visible = filterPrivateGroupsForUser(user, groups, members);
    const memberCountByGroup = new Map<string, number>();
    for (const m of members) memberCountByGroup.set(m.group_id, (memberCountByGroup.get(m.group_id) || 0) + 1);
    const data = visible.map(g => ({ ...g, memberCount: memberCountByGroup.get(g.id) || 0 }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroups list]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải danh sách Nhóm riêng' }, { status: 500 });
  }
}

// POST /api/private-groups — tạo Nhóm riêng mới. CHỈ Admin (giống tạo Campaign
// — thay đổi cấu trúc team, không phải business data hàng ngày của Sale).
export async function POST(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  if (!canCreatePrivateGroup(user)) {
    return NextResponse.json({ success: false, error: 'Chỉ Admin được tạo Nhóm riêng' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = String(body?.name || '').trim();
    if (!name) return NextResponse.json({ success: false, error: 'Thiếu tên nhóm' }, { status: 400 });
    const leader_id = String(body?.leader_id || '').trim();
    const leader_name = String(body?.leader_name || '').trim();
    if (!leader_id || !leader_name) {
      return NextResponse.json({ success: false, error: 'Phải chọn đúng 1 Leader cho nhóm' }, { status: 400 });
    }
    const group = await createPrivateGroup({ name, leader_id, leader_name, actor: user });
    return NextResponse.json({ success: true, data: group });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroup create]', error);
    return NextResponse.json({ success: false, error: 'Không thể tạo Nhóm riêng' }, { status: 500 });
  }
}
