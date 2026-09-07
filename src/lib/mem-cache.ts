// Simple in-memory TTL cache for Vercel serverless containers.
// Lives in process memory — per-container, no cross-instance sharing.
// Reduces repeated PG/GS calls within the same warm lambda.

type Entry<T> = { data: T; expiresAt: number };
const store = new Map<string, Entry<unknown>>();

// In-flight Promise sharing (audit "GOOGLE_SHEETS_READ_AMPLIFICATION_ROOT_CAUSE_PROVEN")
// — TRƯỚC ĐÂY `cached()` chỉ nhớ KẾT QUẢ đã resolve, không nhớ Promise ĐANG
// CHẠY: 2 lời gọi CÙNG key gần như đồng thời (VD 2 request trùng do
// re-render/race) đều thấy cache miss và MỖI request tự gọi `fn()` riêng —
// gấp đôi số Sheets read cho đúng 1 dữ liệu. Map riêng này giữ Promise ĐANG
// CHẠY theo key — lời gọi thứ 2 trở đi (trong lúc lời gọi đầu CHƯA xong) dùng
// LẠI CHÍNH promise đó thay vì gọi `fn()` lần nữa. Lỗi (kể cả 429) KHÔNG được
// cache — xoá khỏi inFlight rồi throw lại nguyên vẹn, để caller luôn thấy lỗi
// thật (không "che" 429 thành dữ liệu rỗng) và lần gọi kế tiếp được thử lại
// từ đầu (không bị kẹt vĩnh viễn ở 1 lỗi cũ).
const inFlight = new Map<string, Promise<unknown>>();

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() < hit.expiresAt) return Promise.resolve(hit.data);

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fn()
    .then(data => {
      store.set(key, { data, expiresAt: Date.now() + ttlMs });
      inFlight.delete(key);
      return data;
    })
    .catch(err => {
      inFlight.delete(key);
      throw err;
    });
  inFlight.set(key, promise);
  return promise;
}

export function invalidate(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
