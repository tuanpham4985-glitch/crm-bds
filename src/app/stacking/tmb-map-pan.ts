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

export interface Size { w: number; h: number }

/** Kích thước canvas/content ĐÃ nhân effectiveScale (fitScale * zoomMultiplier)
 * — đúng bằng kích thước hiển thị thực tế trên màn hình, dùng làm cơ sở tính
 * margin canh giữa + xác định phạm vi scroll thật (scrollWidth/scrollHeight
 * của container phải phản ánh ĐÚNG số này để pan tới được đủ 4 góc). */
export function computeScaledContentSize(canvasSize: Size, effectiveScale: number): Size {
  return { w: canvasSize.w * effectiveScale, h: canvasSize.h * effectiveScale };
}

/** Margin canh giữa content khi nhỏ hơn container trên 1 trục (VD ở đúng
 * fit, trục còn lại dư viền) — bằng 0 khi content >= container (đã zoom to
 * hơn khung), để content nằm sát góc trên-trái của container.
 *
 * THAY cho flex `alignItems/justifyContent: 'center'` trước đây: đã đo thực
 * tế trên browser rằng flex-center + overflow:auto với content TRÀN khung
 * khiến scrollWidth/scrollHeight bị báo cáo THIẾU (chỉ ~64% kích thước thật)
 * và maxScrollLeft/Top chỉ còn ~50% phạm vi cần — đây là hành vi "unsafe
 * centering" mặc định của flexbox (browser cắt bỏ nửa overflow phía đầu
 * trái/trên khỏi vùng scroll được), không phải do sai số tính toán ở component.
 * Margin JS-computed + layout block bình thường tránh hoàn toàn cơ chế đó:
 * khi content tràn khung, margin=0 nên scrollWidth = đúng kích thước scaled
 * thật, scrollLeft/scrollTop cuộn được trọn (scaled - container), chạm đủ
 * 4 góc. */
export function computeCenteringMargin(containerSize: Size, scaledSize: Size): { marginX: number; marginY: number } {
  return {
    marginX: Math.max(0, (containerSize.w - scaledSize.w) / 2),
    marginY: Math.max(0, (containerSize.h - scaledSize.h) / 2),
  };
}
