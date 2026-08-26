// Campaign CSKH work queue (M1B.1) — derive-only bucket cho membership, tách
// riêng thành module thuần (.ts, không JSX) để test được không cần React
// runtime — cùng pattern với khach-hang-selection.ts. KHÔNG lưu thành cột
// riêng trên schema (tránh field trạng thái dư thừa) — tính hoàn toàn từ
// trang_thai_cham_soc + ngay_lien_he_tiep đã có sẵn.
export const CSKH_BUCKETS = ['Chưa gọi', 'Gọi lại hôm nay', 'Quá lịch', 'Đang chăm sóc', 'Quan tâm', 'Hoàn tất / Không phù hợp'] as const;
export type MembershipBucket = typeof CSKH_BUCKETS[number];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isOverdue(value?: string | null, now: Date = new Date()): boolean {
  return Boolean(value && new Date(value).getTime() < now.getTime());
}

export function isToday(value?: string | null, now: Date = new Date()): boolean {
  return Boolean(value && isSameDay(new Date(value), now));
}

export function bucketOf(
  member: { trang_thai_cham_soc?: string | null; ngay_lien_he_tiep?: string | null },
  now: Date = new Date(),
): MembershipBucket {
  const status = member.trang_thai_cham_soc || 'Chưa gọi';
  if (status === 'Không phù hợp' || status === 'Sai số') return 'Hoàn tất / Không phù hợp';
  if (status === 'Quan tâm') return 'Quan tâm';
  if (isOverdue(member.ngay_lien_he_tiep, now)) return 'Quá lịch';
  if (status === 'Gọi lại' && isToday(member.ngay_lien_he_tiep, now)) return 'Gọi lại hôm nay';
  if (status === 'Đã liên hệ' || status === 'Không nghe máy' || status === 'Gọi lại') return 'Đang chăm sóc';
  return 'Chưa gọi';
}
