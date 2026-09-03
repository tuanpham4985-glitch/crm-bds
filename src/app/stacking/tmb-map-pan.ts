/** Toán học drag-to-pan thuần cho Tổng mặt bằng — tách khỏi component để
 * test deterministic không cần DOM (pointer handler trong TmbMap.tsx chỉ
 * gọi lại các hàm này với toạ độ đọc từ pointer event + scrollLeft/scrollTop
 * hiện tại). Phần còn lại (pointerdown/move/up/cancel/leave, setPointerCapture,
 * cursor grab/grabbing) là dây nối DOM thuần, không có logic đáng test riêng —
 * đã browser-validate cùng cơ chế với wheel zoom trước đó. */

/** Ngưỡng pixel để phân biệt "click ngắn" (mở popup căn) và "kéo" (pan) —
 * dưới ngưỡng vẫn coi là click, vượt ngưỡng mới khoá thành drag và chặn
 * click phát sinh ngoài ý muốn trên marker. */
export function exceedsDragThreshold(dx: number, dy: number, thresholdPx: number): boolean {
  return Math.abs(dx) > thresholdPx || Math.abs(dy) > thresholdPx;
}

/** scrollLeft/scrollTop mới khi kéo pointer từ điểm bắt đầu tới điểm hiện
 * tại — kéo sang phải (dx dương) phải làm nội dung "đi theo tay" nên
 * scrollLeft GIẢM (view dịch trái), đúng hành vi pan bản đồ chuẩn. */
export function applyPanScroll(
  startScrollLeft: number, startScrollTop: number, dx: number, dy: number
): { scrollLeft: number; scrollTop: number } {
  return { scrollLeft: startScrollLeft - dx, scrollTop: startScrollTop - dy };
}
