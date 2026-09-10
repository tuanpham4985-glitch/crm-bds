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

// ─── Pinch-to-zoom (2 ngón tay, mobile) ─────────────────────────────────────

export interface ScreenPoint { x: number; y: number }

/** Khoảng cách Euclid giữa 2 điểm màn hình (VD vị trí 2 ngón tay đang chạm)
 * — dùng để tính tỉ lệ pinch VÀ (gián tiếp, qua touchMidpoint) điểm neo zoom. */
export function touchDistance(p1: ScreenPoint, p2: ScreenPoint): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/** Trung điểm màn hình giữa 2 ngón tay — dùng làm anchor cho
 * screenPointToContentPoint/contentPointToScroll (CÙNG cơ chế "zoom quanh 1
 * điểm" wheel zoom đã dùng, chỉ đổi anchor từ vị trí con trỏ sang trung điểm
 * 2 ngón) để nội dung dưới 2 ngón không nhảy giật khi pinch. */
export function touchMidpoint(p1: ScreenPoint, p2: ScreenPoint): ScreenPoint {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

// Khuếch đại tỉ lệ pinch (phản hồi User thực tế trên iPhone thật, 2026-09-10:
// zoom "chỉ nhích nhẹ" mỗi lượt vuốt) — nếu dùng ĐÚNG tỉ lệ 1:1 vật lý thì 1
// lượt pinch thoải mái trên màn hình điện thoại (bị giới hạn bởi bề ngang
// màn hình) chỉ kéo dài khoảng cách 2 ngón được ~2-4 lần, trong khi khoảng
// zoom cho phép rất rộng (1x-20x) — nên phần lớn range gần như không đụng
// tới nổi trong 1 lượt vuốt. Nâng ratio lên số mũ > 1 để CÙNG 1 khoảng di
// chuyển ngón tay tạo zoom SÂU hơn nhiều (1 lượt pinch vừa phải đã có thể đi
// gần hết range), vẫn là hàm mũ đơn điệu liên tục của ratio nên vẫn mượt,
// không giật cục — ratio=1 (chưa di chuyển) -> vẫn = 1, không nhảy đột ngột
// lúc bắt đầu pinch dù có khuếch đại.
const PINCH_SENSITIVITY = 1.7;

/** Zoom tính từ TỈ LỆ khoảng cách 2 ngón tay HIỆN TẠI so với khoảng cách LÚC
 * BẮT ĐẦU pinch (currentDistance/startDistance), khuếch đại qua số mũ
 * PINCH_SENSITIVITY rồi nhân lên `startZoom` (zoom NGAY LÚC ngón thứ 2 chạm
 * xuống, KHÔNG PHẢI zoom hiện tại tại mỗi lần gọi) — 2 ngón tách xa hơn lúc
 * bắt đầu => zoom in, gần lại => zoom out. Neo theo TỈ LỆ so với 1 mốc cố
 * định (startZoom/startDistance) thay vì nhân dồn từng bước nhỏ (khác
 * applyWheelZoom, vốn xử lý từng tick wheel RỜI RẠC) — mỗi lần gọi lại (mỗi
 * pointermove trong lúc pinch) tính LẠI TỪ ĐẦU theo CÙNG 1 mốc, nên không
 * trôi/tích luỹ sai số qua nhiều lần gọi liên tiếp, và không nhảy đột ngột
 * ngay lúc bắt đầu pinch (ratio = 1 tại chính thời điểm đó, mọi số mũ của 1
 * vẫn = 1). distance <= 0 (ngón tay trùng vị trí/dữ liệu lỗi) -> giữ nguyên
 * startZoom đã clamp, không chia cho 0/số âm. */
export function applyPinchZoom(startZoom: number, startDistance: number, currentDistance: number, range: ZoomRange): number {
  if (startDistance <= 0 || currentDistance <= 0) return clampZoom(startZoom, range);
  const amplifiedRatio = Math.pow(currentDistance / startDistance, PINCH_SENSITIVITY);
  return clampZoom(+(startZoom * amplifiedRatio).toFixed(3), range);
}
