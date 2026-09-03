/** Toán học thuần cho adaptive high-resolution rendering của canvas TMB —
 * tách khỏi component để test deterministic không cần DOM/pdf.js.
 *
 * BỐI CẢNH: pdf.js chỉ vẽ canvas backing store 1 LẦN ở BASE_SCALE=1 (độ phân
 * giải gốc trang PDF, ~3370×2384px thật — đã đo bằng pdf.js trên chính file
 * TMB), rồi CSS-scale bitmap đó lên tới effectiveScale×MAX_ZOOM_MULT(20) —
 * tức phóng 1 bitmap cố định lên gấp nhiều lần kích thước gốc, gây mờ ở zoom
 * sâu (browser upscale, không có thêm dữ liệu điểm ảnh nào). Các hàm dưới
 * đây tính lại 1 "renderScale" (relative BASE_SCALE=1, tức bội số so với
 * viewport scale=1 GỐC — KHÔNG PHẢI effectiveScale hiển thị) để re-render lại
 * canvas ở độ phân giải cao hơn khi cần, có hard cap để không tạo canvas
 * khổng lồ gây OOM/crash trên các thiết bị yếu hoặc browser giới hạn kích
 * thước canvas (Safari/mobile lịch sử giới hạn thấp hơn nhiều so với Chrome
 * desktop).
 *
 * QUAN TRỌNG — geometry guard: renderScale ở đây CHỈ dùng để quyết định độ
 * phân giải RASTER (canvas.width/height, tức backing store) khi gọi lại
 * page.render(). Nó KHÔNG được dùng để tính vị trí marker (viewX/viewY luôn
 * lấy từ viewport BASE_SCALE=1 cố định, nhân với effectiveScale hiển thị —
 * xem TmbMap.tsx) và KHÔNG được dùng để tính CSS width/height hiển thị của
 * canvas (luôn = kích thước canvas gốc × effectiveScale, xem
 * computeScaledContentSize trong tmb-map-pan.ts). 2 hệ toạ độ này độc lập
 * hoàn toàn — đổi renderScale không bao giờ làm lệch marker hay layout. */

export interface NativeSize { w: number; h: number }

export interface RenderQualityCaps {
  /** Cap devicePixelRatio đóng góp vào renderScale — màn Retina 3x so với
   * cap=2 chỉ tăng thêm rất ít lợi ích thị giác nhưng tăng gấp 2.25 lần bộ
   * nhớ canvas, không đáng đánh đổi. */
  maxDpr: number;
  /** Hard cap TỔNG số pixel canvas backing store (w×h) — đã đo thực tế trên
   * chính file PDF TMB (3370×2384 ở scale=1): scale=2 ≈ 32MP (an toàn),
   * scale=3 ≈ 72MP (rủi ro alloc fail trên nhiều browser/thiết bị yếu) —
   * chọn cap nằm giữa 2 mốc này. */
  maxTotalPixels: number;
  /** Hard cap 1 CẠNH canvas (px) — an toàn dưới giới hạn texture/canvas phổ
   * biến của các browser hiện đại (Safari lịch sử giới hạn thấp hơn Chrome). */
  maxDimensionPx: number;
  /** Bucket rời rạc — chỉ re-render khi quality mục tiêu NHẢY sang bucket
   * mới, tránh render lại canvas cho từng chút thay đổi zoom nhỏ (mỗi lần
   * render ở resolution cao tốn CPU đáng kể). */
  buckets: readonly number[];
}

export const DEFAULT_RENDER_QUALITY_CAPS: RenderQualityCaps = {
  maxDpr: 2,
  maxTotalPixels: 40_000_000,
  maxDimensionPx: 16384,
  buckets: [1, 1.5, 2, 2.5, 3, 4, 6, 8, 12, 16, 20],
};

/** Cap dành riêng cho VIEWPORT high-res rendering (tmb-map-viewport.ts) — áp
 * dụng computeRenderQuality/computeMaxRenderScale với nativeSize = kích thước
 * VÙNG ĐANG NHÌN (đã overscan+clamp), KHÔNG PHẢI kích thước toàn trang PDF.
 * Vì vùng này luôn nhỏ (tỉ lệ theo khung nhìn modal TMB, thực tế ~1100×~900px
 * CSS tối đa), budget nhỏ hơn NHIỀU so với whole-page (40MP) vẫn đủ dư —
 * maxDimensionPx=4096 là giới hạn canvas an toàn phổ biến trên hầu hết
 * browser/thiết bị (kể cả cũ), 12MP đủ cho container ~1100px × dpr=2 ×
 * overscan (~3500×2500px ≈ 8.75MP thực tế đo được, xem test). */
export const VIEWPORT_RENDER_QUALITY_CAPS: RenderQualityCaps = {
  maxDpr: 2,
  maxTotalPixels: 12_000_000,
  maxDimensionPx: 4096,
  buckets: [1, 1.5, 2, 2.5, 3, 4, 6, 8, 12, 16, 20],
};

/** Bound devicePixelRatio an toàn — NaN/0/âm (môi trường lạ, SSR...) fallback
 * về 1 thay vì lan truyền giá trị vô nghĩa vào phép tính scale. */
export function clampDevicePixelRatio(dpr: number, maxDpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(dpr, maxDpr);
}

/** Kẹp scale mong muốn vào bucket rời rạc GẦN NHẤT PHÍA TRÊN (không bao giờ
 * làm mờ hơn mức cần) — bucket vượt quá phần tử cuối cùng thì kẹp về đó. */
export function snapToRenderQualityBucket(rawScale: number, buckets: readonly number[]): number {
  for (const b of buckets) {
    if (rawScale <= b) return b;
  }
  return buckets[buckets.length - 1];
}

/** renderScale TỐI ĐA an toàn cho 1 kích thước canvas gốc cụ thể, theo cả 2
 * giới hạn (cạnh dài nhất VÀ tổng pixel) — trả về giá trị NHỎ HƠN trong 2,
 * không bao giờ vượt quá 1 giới hạn nào dù giới hạn kia còn dư. */
export function computeMaxRenderScale(
  nativeSize: NativeSize, caps: Pick<RenderQualityCaps, 'maxTotalPixels' | 'maxDimensionPx'>
): number {
  if (nativeSize.w <= 0 || nativeSize.h <= 0) return 1;
  const byDimension = Math.min(caps.maxDimensionPx / nativeSize.w, caps.maxDimensionPx / nativeSize.h);
  const byTotalPixels = Math.sqrt(caps.maxTotalPixels / (nativeSize.w * nativeSize.h));
  return Math.max(1, Math.min(byDimension, byTotalPixels));
}

/** Quyết định cuối cùng: renderScale cần re-render canvas tới, tính từ
 * effectiveScale hiển thị hiện tại (geometry authority, KHÔNG đổi) + DPR +
 * kích thước canvas gốc — đã bucket hoá + kẹp hard cap. Không bao giờ < 1
 * (canvas gốc đã ở scale=1 sẵn, không cần render lại thấp hơn). */
export function computeRenderQuality(
  effectiveScale: number,
  devicePixelRatio: number,
  nativeSize: NativeSize,
  caps: RenderQualityCaps = DEFAULT_RENDER_QUALITY_CAPS,
): number {
  const dpr = clampDevicePixelRatio(devicePixelRatio, caps.maxDpr);
  const idealScale = Math.max(1, effectiveScale) * dpr;
  const bucketed = snapToRenderQualityBucket(idealScale, caps.buckets);
  const maxAllowed = computeMaxRenderScale(nativeSize, caps);
  return Math.min(bucketed, maxAllowed);
}

/** "Không downgrade vô lý" — chỉ coi là cần re-render khi quality mục tiêu
 * CAO HƠN ĐÁNG KỂ quality đang có (ngưỡng 0.1% tránh thrashing do sai số
 * dấu phẩy động giữa 2 giá trị gần bằng nhau) — giữ nguyên bitmap chất
 * lượng cao đã render khi zoom RA, không tự ý render lại ở resolution thấp
 * hơn (lãng phí CPU, không có lợi ích hiển thị vì CSS vẫn scale xuống đúng). */
export function shouldUpgradeRenderQuality(targetScale: number, currentRenderedScale: number): boolean {
  return targetScale > currentRenderedScale * 1.001;
}
