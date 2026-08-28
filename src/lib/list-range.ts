// Generic 1-indexed, inclusive "chọn theo STT" range — dùng chung bởi MỌI
// feature range-selection trong app (Campaign CSKH range tại /phan-khach,
// Customer range tại /khach-hang, ...). KHÔNG mang domain semantics nào —
// validate + cắt mảng thuần. Domain-specific ordering (created_at asc,
// ngay_tao desc, ...) và filter (search/bucket/date/...) luôn thuộc về
// caller — module này không biết và không cần biết dữ liệu là gì.
//
// "Không trộn hai authority" (Campaign membership range vs Customer range):
// dùng chung utility TOÁN HỌC thuần này KHÔNG làm 2 feature dùng chung
// authority/DB nguồn — mỗi feature vẫn tự query đúng bảng của mình
// (CampaignMembership vs KhachHang) và tự resolve/filter riêng, chỉ tái sử
// dụng đúng 1 phép validate+slice để tránh 2 nơi lệch off-by-one nhau.
export interface ListRangeInput {
  from: number;
  to: number;
}

export interface ListRangeValidation {
  ok: boolean;
  error?: string;
  total: number;
  /** Số phần tử trong range khi ok (to - from + 1) — dùng để preview mà không cần vật chất hoá mảng (VD client chỉ biết "total", chưa tải toàn bộ danh sách). */
  count: number;
}

/** Validate thuần theo TỔNG SỐ đã biết — không cần mảng thật, dùng cho preview client-side khi dataset chưa (hoặc không cần) tải hết về trình duyệt. */
export function validateListRangeAgainstTotal(total: number, range: ListRangeInput): ListRangeValidation {
  if (!Number.isInteger(range.from) || range.from < 1) {
    return { ok: false, error: 'Từ phải là số nguyên >= 1', total, count: 0 };
  }
  if (!Number.isInteger(range.to) || range.to < range.from) {
    return { ok: false, error: 'Đến phải là số nguyên >= Từ', total, count: 0 };
  }
  if (range.to > total) {
    return { ok: false, error: `Đến không được vượt quá tổng số khách phù hợp (${total})`, total, count: 0 };
  }
  return { ok: true, total, count: range.to - range.from + 1 };
}

export type ListRangeResult<T> =
  | { ok: true; ids: T[]; total: number }
  | { ok: false; error: string; total: number };

/**
 * orderedFiltered PHẢI đã đúng thứ tự + đã lọc sẵn trước khi gọi — hàm này
 * chỉ validate + cắt [from, to] (1-indexed, inclusive cả 2 đầu) trên CHÍNH
 * tập đã lọc đó. from=1,to=200 -> slice(0,200) -> đúng 200 phần tử (index
 * 0..199) — không off-by-one.
 */
export function resolveListRange<T>(orderedFiltered: readonly T[], range: ListRangeInput): ListRangeResult<T> {
  const validation = validateListRangeAgainstTotal(orderedFiltered.length, range);
  if (!validation.ok) return { ok: false, error: validation.error!, total: validation.total };
  return { ok: true, ids: orderedFiltered.slice(range.from - 1, range.to), total: validation.total };
}
