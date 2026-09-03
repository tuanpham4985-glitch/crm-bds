/** Toán học thuần cho VIEWPORT high-resolution rendering của TMB — tách khỏi
 * component để test deterministic không cần DOM/pdf.js.
 *
 * BỐI CẢNH: whole-page adaptive rendering (tmb-map-render-quality.ts) bị hard
 * cap ~2.23x cho TOÀN trang PDF (40MP budget) vì canvas backing store phải đủ
 * lớn để phủ HẾT trang — ở zoom 10x/20x, effectiveScale hiển thị vượt xa cap
 * đó nên nền PDF vẫn mờ dù đã "adaptive". Vùng NGƯỜI DÙNG ĐANG NHÌN (viewport)
 * luôn nhỏ hơn NHIỀU so với toàn trang, nên có thể render CHỈ vùng đó ở scale
 * cao hơn nhiều mà backing store vẫn nhỏ (tỉ lệ theo kích thước khung nhìn,
 * KHÔNG theo kích thước trang) — xem computeRenderQuality (tmb-map-render-quality.ts)
 * tái dùng với nativeSize = kích thước vùng visible (đã overscan+clamp), không
 * phải kích thước toàn trang.
 *
 * Hệ toạ độ: TẤT CẢ rect dưới đây là "content-space" — CHÍNH XÁC cùng hệ toạ
 * độ BASE_SCALE=1 mà marker (viewX/viewY) và whole-page canvas đã dùng (xem
 * TmbMap.tsx). Không tạo hệ toạ độ thứ 2 — mọi phép nhân hiển thị vẫn là
 * `contentCoord * effectiveScale`, y hệt marker. */

export interface Rect { minX: number; minY: number; maxX: number; maxY: number }
export interface Size { w: number; h: number }

/** 30% mỗi phía (~1.6x kích thước gốc mỗi trục, ~2.56x diện tích) — đủ để pan
 * nhẹ (VD 1-2 lượt kéo chuột nhỏ) không lập tức lộ vùng chưa render, nhưng
 * không quá lớn để vẫn nằm gọn trong VIEWPORT_RENDER_QUALITY_CAPS (giữ canvas
 * overlay nhỏ, tỉ lệ theo khung nhìn — xem tmb-map-render-quality.ts). */
export const OVERSCAN_FRACTION = 0.3;

/** Vùng PDF (content-space) đang hiển thị trong khung nhìn — tính từ
 * scrollLeft/scrollTop + kích thước container + effectiveScale. Dùng ĐÚNG
 * công thức screenPointToContentPoint (tmb-map-zoom.ts, đã dùng cho wheel-zoom
 * cursor-anchor) áp cho 2 góc (0,0) và (clientWidth, clientHeight) — không
 * tạo phép biến đổi toạ độ thứ 2. Cùng giả định như wheel-zoom hiện có: content
 * đã tràn khung (đúng với mọi zoom > fit); sai số ở đúng lúc fit hệt 1 trục
 * (còn margin canh giữa) không đáng kể — chấp nhận như cơ chế cursor-anchor cũ. */
export function computeVisibleContentRect(
  scrollLeft: number, scrollTop: number, containerSize: Size, effectiveScale: number
): Rect {
  const scale = effectiveScale > 0 ? effectiveScale : 1;
  return {
    minX: scrollLeft / scale,
    minY: scrollTop / scale,
    maxX: (scrollLeft + containerSize.w) / scale,
    maxY: (scrollTop + containerSize.h) / scale,
  };
}

/** Mở rộng rect thêm overscan (tỉ lệ theo CHÍNH kích thước rect đó, mỗi phía)
 * — để pan nhẹ trong vùng overscan không lập tức cần render lại/gây blank.
 * fraction=0.3 nghĩa là mở rộng thêm 30% chiều rộng/cao mỗi bên (tổng ~1.6x
 * kích thước gốc mỗi trục, ~2.56x diện tích) — xem OVERSCAN_FRACTION cho cap
 * thực tế đang dùng + lý do chọn con số này. */
export function applyOverscan(rect: Rect, fraction: number): Rect {
  const w = rect.maxX - rect.minX, h = rect.maxY - rect.minY;
  const padX = w * fraction, padY = h * fraction;
  return { minX: rect.minX - padX, minY: rect.minY - padY, maxX: rect.maxX + padX, maxY: rect.maxY + padY };
}

/** Kẹp rect vào biên trang [0, pageSize] — không bao giờ yêu cầu render ra
 * ngoài trang thật (viewport/overscan có thể tràn ra ngoài khi content nhỏ
 * hơn container ở gần fit, hoặc overscan đẩy rect ra quá mép trang). */
export function clampRectToPageBounds(rect: Rect, pageSize: Size): Rect {
  return {
    minX: Math.max(0, Math.min(rect.minX, pageSize.w)),
    minY: Math.max(0, Math.min(rect.minY, pageSize.h)),
    maxX: Math.max(0, Math.min(rect.maxX, pageSize.w)),
    maxY: Math.max(0, Math.min(rect.maxY, pageSize.h)),
  };
}

export function rectSize(rect: Rect): Size {
  return { w: Math.max(0, rect.maxX - rect.minX), h: Math.max(0, rect.maxY - rect.minY) };
}

/** True nếu `inner` nằm HOÀN TOÀN trong `outer` — dùng để biết vùng đang
 * render sẵn (outer, đã overscan) còn phủ đủ vùng visible hiện tại (inner,
 * KHÔNG overscan) hay đã pan ra ngoài, cần render lại. */
export function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX
    && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

export interface DisplayBox { left: number; top: number; width: number; height: number }

/** CSS position/size (px) của overlay layer cho 1 rect content-space, tại
 * effectiveScale hiển thị hiện tại — ĐÚNG CÔNG THỨC marker đã dùng
 * (`viewX * effectiveScale`), để overlay luôn khớp tuyệt đối với marker/canvas
 * nền ở MỌI mức zoom (kể cả trước khi render high-res kịp bắt kịp zoom mới —
 * overlay cũ vẫn tự scale đúng vị trí/kích thước qua CSS, không bị lệch). */
export function rectToDisplayBox(rect: Rect, effectiveScale: number): DisplayBox {
  return {
    left: rect.minX * effectiveScale,
    top: rect.minY * effectiveScale,
    width: (rect.maxX - rect.minX) * effectiveScale,
    height: (rect.maxY - rect.minY) * effectiveScale,
  };
}
