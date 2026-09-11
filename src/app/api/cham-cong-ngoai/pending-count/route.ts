import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getChamCongNgoaiPendingCount } from '@/lib/data-access';

interface SessionUser {
  id_nhan_vien: string;
  ho_ten: string;
  vai_tro: string;
}

async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const c = cookieStore.get('crm_session');
  if (!c?.value) return null;
  try {
    return JSON.parse(Buffer.from(c.value, 'base64').toString()) as SessionUser;
  } catch {
    return null;
  }
}

// GET /api/cham-cong-ngoai/pending-count
// Trả về số đơn đang chờ duyệt mà user cần xử lý:
// - Admin/HR: tất cả đơn cho_duyet
// - Quản lý: đơn cho_duyet của nhóm mình (không tính đơn của bản thân)
export async function GET() {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ count: 0 });

    const isAdminOrHR = user.vai_tro === 'Admin' || user.vai_tro === 'HR';

    if (isAdminOrHR) {
      const count = await getChamCongNgoaiPendingCount();
      return NextResponse.json({ count });
    }

    // Quản lý: đơn của nhóm mình đang chờ (không tính đơn chính mình)
    const count = await getChamCongNgoaiPendingCount(undefined, user.ho_ten, user.id_nhan_vien);
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
