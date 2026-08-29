// CSKH TABLE UX — windowing thuần cho các bảng có thể lên tới hàng nghìn dòng
// (CSKH → Theo Campaign, ...). KHÔNG mang authority nghiệp vụ nào — chỉ cắt
// một mảng ĐÃ được lọc/sort sẵn bởi caller thành "trang 50 dòng" để render,
// tách biệt HOÀN TOÀN với list-range.ts (range Admin tự gõ "Từ x đến y" để
// Chia đều Sale — business selection, vẫn phải resolve trên TOÀN tập đã lọc,
// không phải trên 1 trang). Không được dùng module này cho bất kỳ tính toán
// range/summary/distribution nào — chỉ dùng để quyết định hiển thị dòng nào.
export interface PageWindow<T> {
  items: T[];
  /** Trang hiện tại đã được clamp về [1, totalPages] — luôn hợp lệ. */
  page: number;
  totalPages: number;
  /** Tổng số phần tử của TOÀN tập truyền vào (đã lọc), không phải số trên trang. */
  total: number;
  /** Vị trí 0-indexed của phần tử đầu tiên trên trang trong mảng gốc — dùng để tính STT liên tục qua các trang (page 2 bắt đầu từ 51, không reset về 1). */
  startIndex: number;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageWindow<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  return { items: items.slice(startIndex, startIndex + pageSize), page: safePage, totalPages, total, startIndex };
}
