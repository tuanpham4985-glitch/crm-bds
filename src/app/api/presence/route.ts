import { NextResponse } from 'next/server';
import { getNhanVien } from '@/lib/data-access';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { isActiveSale } from '@/lib/campaign-sale-eligibility';
import { prisma } from '@/lib/db/client';
import { PRESENCE_TRACKING_ENABLED } from '@/lib/presence-config';

const ONLINE_WINDOW_MS = 3 * 60 * 1000;

export async function POST() {
  if (!PRESENCE_TRACKING_ENABLED) return NextResponse.json({ success: false, error: 'Tính năng Sale Online đang tạm dừng' }, { status: 503 });
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    await prisma.userPresence.upsert({
      where: { employee_id: user.id_nhan_vien },
      create: { employee_id: user.id_nhan_vien, last_seen_at: new Date() },
      update: { last_seen_at: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Presence heartbeat]', error);
    return NextResponse.json({ success: false, error: 'Không thể cập nhật trạng thái online' }, { status: 503 });
  }
}

export async function GET() {
  if (!PRESENCE_TRACKING_ENABLED) return NextResponse.json({ success: false, error: 'Tính năng Sale Online đang tạm dừng' }, { status: 503 });
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Chỉ Admin được xem trạng thái online' }, { status: 403 });
  try {
    const employees = (await getNhanVien()).filter(isActiveSale);
    const ids = employees.map(employee => employee.id_nhan_vien);
    const presences = ids.length
      ? await prisma.userPresence.findMany({ where: { employee_id: { in: ids } } })
      : [];
    const presenceById = new Map(presences.map(item => [item.employee_id, item]));
    const onlineSince = Date.now() - ONLINE_WINDOW_MS;
    const data = employees
      .map(employee => {
        const presence = presenceById.get(employee.id_nhan_vien);
        const lastSeenAt = presence?.last_seen_at?.toISOString() || null;
        return {
          id_nhan_vien: employee.id_nhan_vien,
          ho_ten: employee.ho_ten,
          email: employee.email,
          phong_KD: employee.phong_KD || '',
          last_seen_at: lastSeenAt,
          status: presence && presence.last_seen_at.getTime() >= onlineSince ? 'online' : 'offline',
        } as const;
      })
      .sort((a, b) => Number(b.status === 'online') - Number(a.status === 'online') || a.ho_ten.localeCompare(b.ho_ten, 'vi'));
    return NextResponse.json({ success: true, data, onlineWindowMinutes: 3 });
  } catch (error) {
    console.error('[Presence list]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải trạng thái online' }, { status: 503 });
  }
}
