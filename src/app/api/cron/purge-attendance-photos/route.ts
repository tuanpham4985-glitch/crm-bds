// Cron job: xóa ảnh Chấm công online đã hết hạn lưu (giữ đến hết ngày 15 tháng sau)
// Chạy hàng ngày lúc 01:00 sáng giờ Việt Nam (18:00 UTC)
import { NextRequest } from 'next/server';
import { purgeExpiredChamCongNgoaiPhotos } from '@/lib/data-access';
import { photoRetentionCutoff } from '@/lib/attendance-photo-retention';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const cutoff = photoRetentionCutoff();
    const purged = await purgeExpiredChamCongNgoaiPhotos(cutoff);
    console.log(`[CronPurgeCcnPhotos] cutoff ${cutoff}: đã xóa ảnh ${purged} đơn`);
    return Response.json({ success: true, cutoff, purged });
  } catch (err) {
    console.error('[CronPurgeCcnPhotos] error:', err);
    return Response.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
