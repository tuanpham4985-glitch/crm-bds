// ============================================================
// CRM BĐS — Web Push helper
//
// Cấu hình VAPID và gửi thông báo đẩy tới các thiết bị đã đăng ký.
// Subscription lưu ở bảng push_subscription (Postgres).
// ============================================================
import webpush from 'web-push';
import { prisma } from '@/lib/db/client';

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:hr@victoryholdings.com.vn';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  count?: number; // số hiển thị trên icon app (badge)
}

/**
 * Gửi push tới TẤT CẢ thiết bị của các nhân viên (theo id_nhan_vien).
 * Tự dọn subscription đã hết hạn (HTTP 404/410). Không ném lỗi ra ngoài.
 */
export async function sendPushToEmployees(ids: string[], payload: PushPayload): Promise<void> {
  if (!configure()) return;
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { id_nhan_vien: { in: uniqueIds } },
  });
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
        } else {
          console.error('[push] send failed:', err instanceof Error ? err.message : err);
        }
      }
    }),
  );
}
