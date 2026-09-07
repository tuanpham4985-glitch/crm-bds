import assert from 'node:assert/strict';
import fs from 'node:fs';
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

// ─── TMB_MOBILE_LOAD_ROOT_CAUSE_PROVEN / TMB_MOBILE_RENDER_MEMORY_FIX_READY ──
// Root cause: idealScale CŨ là `Math.max(1, effectiveScale) * dpr` — floor
// effectiveScale về 1 TRƯỚC khi nhân dpr ép MỌI thiết bị dpr>=2 (gần như mọi
// điện thoại) render tối thiểu ở ĐỘ PHÂN GIẢI GỐC dù content đang hiển thị
// nhỏ hơn gốc rất nhiều (mobile fit-to-view effectiveScale ~0.10) -> canvas
// ~32MP/~123MB alloc không cần thiết, rủi ro OOM mobile (không xảy ra ở
// desktop dpr=1 vì Math.max(1,x)*1 luôn =1). Fix: bỏ floor TRƯỚC dpr, chuyển
// floor "không bao giờ < 1" xuống SAU CÙNG trên kết quả.

test('MOBILE fit-to-view (effectiveScale ~0.10, dpr=2/3) -> quality vẫn = 1, KHÔNG kích hoạt render lại (loại bỏ alloc canvas thừa gây OOM)', () => {
  // effectiveScale ~0.10 mô phỏng đúng kịch bản đã audit: modal TMB trên màn
  // hình mobile hẹp, canvas gốc lớn (REAL_NATIVE_SIZE) — content hiển thị chỉ
  // ~10% kích thước gốc dù dpr cao.
  const qDpr2 = computeRenderQuality(0.10, 2, REAL_NATIVE_SIZE, DEFAULT_RENDER_QUALITY_CAPS);
  const qDpr3 = computeRenderQuality(0.10, 3, REAL_NATIVE_SIZE, DEFAULT_RENDER_QUALITY_CAPS); // dpr=3 sẽ bị clamp về maxDpr=2, kết quả phải giống hệt dpr=2
  assert.equal(qDpr2, 1, `expected quality=1 (no upgrade needed) at effectiveScale=0.10 dpr=2, got ${qDpr2}`);
  assert.equal(qDpr3, 1, `expected quality=1 (no upgrade needed) at effectiveScale=0.10 dpr=3 (clamped), got ${qDpr3}`);
  // renderedRenderScaleRef bắt đầu ở BASE_SCALE=1 (TmbMap.tsx) — quality=1
  // nghĩa là shouldUpgradeRenderQuality phải trả về false, canvas nền KHÔNG
  // bị render lại (không có alloc canvas thứ 2 nào xảy ra).
  assert.equal(shouldUpgradeRenderQuality(qDpr2, 1), false);
  assert.equal(shouldUpgradeRenderQuality(qDpr3, 1), false);
});

test('DESKTOP fit-to-view (effectiveScale ~0.32, dpr=1) vẫn an toàn/không đổi hành vi -> quality = 1, không upgrade', () => {
  const q = computeRenderQuality(0.32, 1, REAL_NATIVE_SIZE, DEFAULT_RENDER_QUALITY_CAPS);
  assert.equal(q, 1);
  assert.equal(shouldUpgradeRenderQuality(q, 1), false);
});

test('Zoom sâu THẬT SỰ (effectiveScale >= 1, kể cả trên mobile dpr cao) vẫn phải upgrade khi cần — fix KHÔNG chặn nhu cầu nét thật', () => {
  // User mobile tự zoom tới lúc effectiveScale=1.2 (fitScale~0.10 * zoomMultiplier~12,
  // hoặc SEARCH_FOCUS_ZOOM=6 trên fitScale lớn hơn) — content giờ hiển thị
  // XẤP XỈ/VƯỢT kích thước gốc -> vẫn cần render lại nét hơn, không bị fix
  // này chặn mất tính năng sharpening khi thực sự cần.
  const q = computeRenderQuality(1.2, 2, REAL_NATIVE_SIZE, DEFAULT_RENDER_QUALITY_CAPS);
  assert.ok(q > 1, `expected quality > 1 when effectiveScale*dpr genuinely exceeds native res, got ${q}`);
  assert.equal(shouldUpgradeRenderQuality(q, 1), true);
});

test('Hard cap (max total pixels / max dimension) vẫn nguyên vẹn SAU fix, kể cả khi effectiveScale rất nhỏ nhưng dpr đẩy idealScale lên cao', () => {
  // Ngay cả ở effectiveScale thấp, nếu dpr đủ cao để idealScale vượt hard cap
  // (dùng SMALL_CAPS với maxDimensionPx/maxTotalPixels thấp để dễ chạm cap),
  // kết quả KHÔNG BAO GIỜ được vượt computeMaxRenderScale — bất biến này độc
  // lập với công thức idealScale, fix không được làm suy yếu cap.
  const tightCaps: RenderQualityCaps = { maxDpr: 2, maxTotalPixels: 100_000, maxDimensionPx: 500, buckets: [1, 2, 4, 8, 16, 20] };
  const q = computeRenderQuality(0.5, 2, { w: 1000, h: 1000 }, tightCaps);
  const maxAllowed = computeMaxRenderScale({ w: 1000, h: 1000 }, tightCaps);
  assert.ok(q <= maxAllowed + 1e-9, `quality ${q} vượt hard cap ${maxAllowed}`);
  assert.ok(q >= 1, `quality phải luôn >= 1, got ${q}`);
});

test('computeRenderQuality: KHÔNG có device/UA/mobile detection nào được thêm vào — logic vẫn thuần effectiveScale/dpr, generic cho mọi thiết bị', () => {
  const source = fs.readFileSync('src/app/stacking/tmb-map-render-quality.ts', 'utf8');
  const codeOnly = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // bỏ toàn bộ comment (giải thích root cause có nhắc "mobile" trong prose)
  assert.ok(!/navigator\.|userAgent|isMobile|is_mobile|matchMedia/i.test(codeOnly), 'không được thêm bất kỳ device/UA/mobile detection nào vào code thật (ngoài comment giải thích)');
  assert.ok(!codeOnly.includes('Math.max(1, effectiveScale)'), 'floor effectiveScale TRƯỚC khi nhân dpr đã bị loại bỏ (chính là root cause)');
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
