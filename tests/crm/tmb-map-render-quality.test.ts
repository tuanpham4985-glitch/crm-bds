import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampDevicePixelRatio, snapToRenderQualityBucket, computeMaxRenderScale,
  computeRenderQuality, shouldUpgradeRenderQuality, DEFAULT_RENDER_QUALITY_CAPS,
  type RenderQualityCaps,
} from '../../src/app/stacking/tmb-map-render-quality';

// Kích thước thật của trang 1 PDF TMB ở scale=1 — đo bằng pdf.js trực tiếp
// trên file public/tmb-poc/tmb-khu-1-2-vhsgp.pdf (KHÔNG đoán số liệu).
const REAL_NATIVE_SIZE = { w: 3370.39, h: 2383.94 };

// ─── clampDevicePixelRatio ──────────────────────────────────────────────────

test('clampDevicePixelRatio: dpr trong khoảng cho phép -> giữ nguyên', () => {
  assert.equal(clampDevicePixelRatio(1, 2), 1);
  assert.equal(clampDevicePixelRatio(1.5, 2), 1.5);
  assert.equal(clampDevicePixelRatio(2, 2), 2);
});

test('clampDevicePixelRatio: dpr vượt cap (VD màn Retina 3x) -> kẹp về cap', () => {
  assert.equal(clampDevicePixelRatio(3, 2), 2);
});

test('clampDevicePixelRatio: dpr vô nghĩa (0/âm/NaN) -> fallback 1, không lan truyền giá trị lỗi', () => {
  assert.equal(clampDevicePixelRatio(0, 2), 1);
  assert.equal(clampDevicePixelRatio(-1, 2), 1);
  assert.equal(clampDevicePixelRatio(NaN, 2), 1);
});

// ─── snapToRenderQualityBucket ──────────────────────────────────────────────

test('snapToRenderQualityBucket: giá trị đúng bằng 1 bucket -> giữ nguyên', () => {
  assert.equal(snapToRenderQualityBucket(2, [1, 1.5, 2, 3, 4]), 2);
});

test('snapToRenderQualityBucket: giá trị nằm GIỮA 2 bucket -> nhảy LÊN bucket kế tiếp (không mờ hơn mức cần)', () => {
  assert.equal(snapToRenderQualityBucket(1.7, [1, 1.5, 2, 3, 4]), 2);
  assert.equal(snapToRenderQualityBucket(2.01, [1, 1.5, 2, 3, 4]), 3);
});

test('snapToRenderQualityBucket: giá trị nhỏ hơn bucket nhỏ nhất -> lấy bucket nhỏ nhất', () => {
  assert.equal(snapToRenderQualityBucket(0.5, [1, 1.5, 2, 3, 4]), 1);
});

test('snapToRenderQualityBucket: giá trị vượt bucket lớn nhất -> kẹp về bucket lớn nhất', () => {
  assert.equal(snapToRenderQualityBucket(999, [1, 1.5, 2, 3, 4]), 4);
});

// ─── computeMaxRenderScale ──────────────────────────────────────────────────

test('computeMaxRenderScale: giới hạn CẠNH DÀI là bên chặt hơn -> dùng giới hạn cạnh', () => {
  // 1000x1000, maxDimension=2000 (scale tối đa theo cạnh = 2), maxTotalPixels
  // rất lớn (không chặn) -> kết quả phải = 2.
  const scale = computeMaxRenderScale({ w: 1000, h: 1000 }, { maxDimensionPx: 2000, maxTotalPixels: 1_000_000_000 });
  assert.equal(scale, 2);
});

test('computeMaxRenderScale: giới hạn TỔNG PIXEL là bên chặt hơn -> dùng giới hạn tổng pixel', () => {
  // 1000x1000 (1MP gốc), maxTotalPixels=4,000,000 -> scale tối đa = sqrt(4) = 2;
  // maxDimensionPx rất lớn (không chặn) -> kết quả phải = 2.
  const scale = computeMaxRenderScale({ w: 1000, h: 1000 }, { maxDimensionPx: 100_000, maxTotalPixels: 4_000_000 });
  assert.equal(scale, 2);
});

test('computeMaxRenderScale: không bao giờ trả về < 1 (canvas gốc đã ở scale=1)', () => {
  const scale = computeMaxRenderScale({ w: 5000, h: 5000 }, { maxDimensionPx: 1000, maxTotalPixels: 1_000_000 });
  assert.equal(scale, 1);
});

test('computeMaxRenderScale: số liệu THẬT của PDF TMB + cap mặc định -> khoá kết quả cụ thể (regression lock)', () => {
  const scale = computeMaxRenderScale(REAL_NATIVE_SIZE, DEFAULT_RENDER_QUALITY_CAPS);
  // byDimension = min(16384/3370.39, 16384/2383.94) ≈ 4.86 (không chặn)
  // byTotalPixels = sqrt(40_000_000 / (3370.39*2383.94)) ≈ 2.23 (chặn — bên nhỏ hơn thắng)
  assert.ok(scale > 2.2 && scale < 2.3, `expected ~2.23, got ${scale}`);
});

// ─── computeRenderQuality ───────────────────────────────────────────────────

const SMALL_CAPS: RenderQualityCaps = { maxDpr: 2, maxTotalPixels: 100_000_000, maxDimensionPx: 100_000, buckets: [1, 2, 4, 8, 16, 20] };

test('computeRenderQuality: effectiveScale thấp (fit/zoom nhẹ) -> quality = 1 (không render quá mức cần)', () => {
  const q = computeRenderQuality(0.3, 1, { w: 1000, h: 1000 }, SMALL_CAPS);
  assert.equal(q, 1);
});

test('computeRenderQuality: effectiveScale tăng -> quality tăng theo (không giảm)', () => {
  const q1 = computeRenderQuality(1, 1, { w: 1000, h: 1000 }, SMALL_CAPS);
  const q2 = computeRenderQuality(3, 1, { w: 1000, h: 1000 }, SMALL_CAPS);
  const q3 = computeRenderQuality(6, 1, { w: 1000, h: 1000 }, SMALL_CAPS);
  assert.ok(q1 <= q2 && q2 <= q3, `expected monotonic non-decreasing, got ${q1}, ${q2}, ${q3}`);
});

test('computeRenderQuality: devicePixelRatio cao hơn -> quality cao hơn (khi chưa chạm hard cap)', () => {
  const q_dpr1 = computeRenderQuality(2, 1, { w: 1000, h: 1000 }, SMALL_CAPS);
  const q_dpr2 = computeRenderQuality(2, 2, { w: 1000, h: 1000 }, SMALL_CAPS);
  assert.ok(q_dpr2 > q_dpr1, `expected dpr=2 quality > dpr=1, got ${q_dpr2} vs ${q_dpr1}`);
});

test('computeRenderQuality: effectiveScale + dpr rất cao -> KHÔNG BAO GIỜ vượt hard cap, dù bucket ladder cho phép cao hơn', () => {
  const q = computeRenderQuality(20, 2, REAL_NATIVE_SIZE, DEFAULT_RENDER_QUALITY_CAPS);
  const maxAllowed = computeMaxRenderScale(REAL_NATIVE_SIZE, DEFAULT_RENDER_QUALITY_CAPS);
  assert.ok(q <= maxAllowed + 1e-9, `quality ${q} vượt hard cap ${maxAllowed}`);
  // Zoom tối đa 20x thật (MAX_ZOOM_MULT) vẫn phải rõ hơn đáng kể so với hiện
  // tại (fixed 1x) — xác nhận quality > 1 dù bị hard cap kẹp lại.
  assert.ok(q > 1, `expected meaningful improvement over baseline 1x, got ${q}`);
});

test('computeRenderQuality: không bao giờ < 1 dù effectiveScale < 1 (fit hẹp hơn 1 trục)', () => {
  const q = computeRenderQuality(0.05, 1, { w: 1000, h: 1000 }, SMALL_CAPS);
  assert.equal(q, 1);
});

// ─── shouldUpgradeRenderQuality ─────────────────────────────────────────────

test('shouldUpgradeRenderQuality: target cao hơn đáng kể current -> true (cần re-render)', () => {
  assert.equal(shouldUpgradeRenderQuality(4, 2), true);
});

test('shouldUpgradeRenderQuality: target thấp hơn current (zoom ra) -> false (không downgrade)', () => {
  assert.equal(shouldUpgradeRenderQuality(2, 4), false);
});

test('shouldUpgradeRenderQuality: target xấp xỉ bằng current (sai số float) -> false, tránh render lặp vô ích', () => {
  assert.equal(shouldUpgradeRenderQuality(2.0000001, 2), false);
  assert.equal(shouldUpgradeRenderQuality(2, 2), false);
});
