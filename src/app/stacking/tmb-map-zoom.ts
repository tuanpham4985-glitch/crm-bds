/** Toán học zoom/pan thuần cho Tổng mặt bằng — tách khỏi component để test
 * deterministic không cần DOM/React (wheel handler + effect trong TmbMap.tsx
 * chỉ gọi lại các hàm này với dữ liệu đọc từ DOM tại thời điểm sự kiện). */

export interface ZoomRange {
  min: number;
  max: number;
}

export function clampZoom(value: number, range: ZoomRange): number {
  return Math.min(range.max, Math.max(range.min, value));
}

/** wheel lên (deltaY < 0) => zoom in (nhân lên); wheel xuống (deltaY > 0) =>
 * zoom out (chia) — nhân tương đối nên bước mượt hơn bước cộng của nút +/-. */
export function applyWheelZoom(current: number, deltaY: number, factor: number, range: ZoomRange): number {
  const multiplier = deltaY < 0 ? 1 + factor : 1 / (1 + factor);
  return clampZoom(+(current * multiplier).toFixed(3), range);
}

/** Điểm content-space (BASE_SCALE=1, chưa nhân effectiveScale) đang nằm dưới
 * 1 vị trí trên container — dựa theo scroll hiện tại + effectiveScale hiện
 * tại (TRƯỚC khi đổi zoom). */
export function screenPointToContentPoint(
  scrollLeft: number, scrollTop: number, cursorX: number, cursorY: number, effectiveScale: number
): { x: number; y: number } {
  return { x: (scrollLeft + cursorX) / effectiveScale, y: (scrollTop + cursorY) / effectiveScale };
}

/** scrollLeft/scrollTop cần để 1 điểm content-space (native) xuất hiện đúng
 * tại anchor (vị trí trên container, VD vị trí con trỏ) ở effectiveScale MỚI
 * (SAU khi đổi zoom) — giữ điểm đó đứng yên trên màn hình qua zoom. */
export function contentPointToScroll(
  nativeX: number, nativeY: number, effectiveScale: number, anchorX: number, anchorY: number
): { scrollLeft: number; scrollTop: number } {
  return { scrollLeft: nativeX * effectiveScale - anchorX, scrollTop: nativeY * effectiveScale - anchorY };
}
