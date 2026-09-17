import { NextRequest, NextResponse } from 'next/server';
import { getHrmSessionUser, canManageHRM } from '@/lib/auth/hrm-authority';
import { runAppointmentSheetSync } from '@/lib/hrm/appointment-sheet-sync-service';

export const maxDuration = 60;

// POST — Đồng bộ THEO DÕI BỔ NHIỆM (Sheet, HR authority) → BoNhiemChucVu
// (Postgres). Chỉ HR/Admin (canManageHRM) — approved architecture §10, không
// tin frontend visibility. `dryRun: true` KHÔNG ghi gì vào Postgres, chỉ trả
// về plan để xem trước.
export async function POST(request: NextRequest) {
  try {
    const user = await getHrmSessionUser();
    if (!canManageHRM(user)) {
      return NextResponse.json({ success: false, error: 'Không có quyền thực hiện' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { dryRun?: boolean };
    const summary = await runAppointmentSheetSync({ dryRun: !!body.dryRun });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error('[BoNhiemChucVu] sync POST error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Lỗi đồng bộ dữ liệu từ Sheet HR' }, { status: 500 });
  }
}
