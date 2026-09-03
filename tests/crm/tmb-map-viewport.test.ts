import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeVisibleContentRect, applyOverscan, clampRectToPageBounds, rectSize,
  rectContains, rectToDisplayBox, OVERSCAN_FRACTION,
} from '../../src/app/stacking/tmb-map-viewport';
import { computeRenderQuality, shouldUpgradeRenderQuality, VIEWPORT_RENDER_QUALITY_CAPS } from '../../src/app/stacking/tmb-map-render-quality';

// Kích thước thật trang PDF TMB (đo bằng pdf.js) — dùng làm page bounds cho
// các test clamp/4-góc, khớp với tests/crm/tmb-map-render-quality.test.ts.
const REAL_PAGE_SIZE = { w: 3370.39, h: 2383.94 };

// ─── computeVisibleContentRect ──────────────────────────────────────────────

test('computeVisibleContentRect: scrollLeft/Top=0 -> rect bắt đầu từ (0,0), kích thước = container/effectiveScale', () => {
  const rect = computeVisibleContentRect(0, 0, { w: 1000, h: 700 }, 2);
  assert.deepEqual(rect, { minX: 0, minY: 0, maxX: 500, maxY: 350 });
});

test('computeVisibleContentRect: có scroll -> rect dịch đúng theo scrollLeft/Top / effectiveScale', () => {
  const rect = computeVisibleContentRect(400, 200, { w: 1000, h: 700 }, 2);
  assert.deepEqual(rect, { minX: 200, minY: 100, maxX: 700, maxY: 450 });
});

test('computeVisibleContentRect: effectiveScale cao hơn -> vùng content-space NHỎ hơn (đúng ý nghĩa "zoom vào 1 vùng nhỏ")', () => {
  const low = computeVisibleContentRect(0, 0, { w: 1000, h: 700 }, 1);
  const high = computeVisibleContentRect(0, 0, { w: 1000, h: 700 }, 10);
  const lowSize = rectSize(low), highSize = rectSize(high);
  assert.ok(highSize.w < lowSize.w && highSize.h < lowSize.h, 'zoom cao hơn phải cho vùng visible nhỏ hơn');
});

test('computeVisibleContentRect: resize container (containerSize đổi) -> rect đổi kích thước tương ứng, cùng scroll/scale', () => {
  const small = computeVisibleContentRect(0, 0, { w: 800, h: 600 }, 1);
  const large = computeVisibleContentRect(0, 0, { w: 1600, h: 1200 }, 1);
  assert.deepEqual(rectSize(small), { w: 800, h: 600 });
  assert.deepEqual(rectSize(large), { w: 1600, h: 1200 });
});

// ─── applyOverscan ───────────────────────────────────────────────────────────

test('applyOverscan: mở rộng đều 4 phía theo đúng OVERSCAN_FRACTION đang dùng thật', () => {
  const rect = { minX: 100, minY: 100, maxX: 200, maxY: 300 }; // 100x200
  const padded = applyOverscan(rect, OVERSCAN_FRACTION);
  const padX = 100 * OVERSCAN_FRACTION, padY = 200 * OVERSCAN_FRACTION;
  assert.equal(padded.minX, 100 - padX);
  assert.equal(padded.maxX, 200 + padX);
  assert.equal(padded.minY, 100 - padY);
  assert.equal(padded.maxY, 300 + padY);
});

test('applyOverscan: fraction=0 -> không đổi gì', () => {
  const rect = { minX: 10, minY: 20, maxX: 30, maxY: 40 };
  assert.deepEqual(applyOverscan(rect, 0), rect);
});

test('applyOverscan: rect đã overscan LUÔN chứa rect gốc (rectContains true)', () => {
  const rect = { minX: 50, minY: 50, maxX: 150, maxY: 250 };
  const padded = applyOverscan(rect, OVERSCAN_FRACTION);
  assert.equal(rectContains(padded, rect), true);
});

// ─── clampRectToPageBounds — bao gồm 4 góc trang ────────────────────────────

test('clampRectToPageBounds: rect nằm hoàn toàn trong trang -> giữ nguyên', () => {
  const rect = { minX: 100, minY: 100, maxX: 200, maxY: 200 };
  assert.deepEqual(clampRectToPageBounds(rect, REAL_PAGE_SIZE), rect);
});

test('clampRectToPageBounds: góc TRÊN-TRÁI (0,0) — overscan âm bị kẹp về 0, không âm', () => {
  const visible = computeVisibleContentRect(0, 0, { w: 500, h: 400 }, 2); // rect = [0,250]x[0,200]
  const overscanned = applyOverscan(visible, OVERSCAN_FRACTION); // minX/minY âm
  const clamped = clampRectToPageBounds(overscanned, REAL_PAGE_SIZE);
  assert.equal(clamped.minX, 0);
  assert.equal(clamped.minY, 0);
  assert.ok(clamped.maxX > 0 && clamped.maxY > 0);
});

test('clampRectToPageBounds: góc DƯỚI-PHẢI (maxX/maxY trang) — overscan vượt mép phải/dưới bị kẹp về đúng pageSize', () => {
  const rect = { minX: REAL_PAGE_SIZE.w - 200, minY: REAL_PAGE_SIZE.h - 150, maxX: REAL_PAGE_SIZE.w + 500, maxY: REAL_PAGE_SIZE.h + 500 };
  const clamped = clampRectToPageBounds(rect, REAL_PAGE_SIZE);
  assert.equal(clamped.maxX, REAL_PAGE_SIZE.w);
  assert.equal(clamped.maxY, REAL_PAGE_SIZE.h);
});

test('clampRectToPageBounds: góc TRÊN-PHẢI — minX/maxY hợp lệ, maxX vượt phải bị kẹp, minY âm bị kẹp về 0', () => {
  const rect = { minX: REAL_PAGE_SIZE.w - 100, minY: -50, maxX: REAL_PAGE_SIZE.w + 300, maxY: 100 };
  const clamped = clampRectToPageBounds(rect, REAL_PAGE_SIZE);
  assert.equal(clamped.maxX, REAL_PAGE_SIZE.w);
  assert.equal(clamped.minY, 0);
  assert.equal(clamped.minX, REAL_PAGE_SIZE.w - 100); // không đổi, đã hợp lệ
});

test('clampRectToPageBounds: góc DƯỚI-TRÁI — minX âm bị kẹp về 0, maxY vượt dưới bị kẹp', () => {
  const rect = { minX: -300, minY: REAL_PAGE_SIZE.h - 100, maxX: 100, maxY: REAL_PAGE_SIZE.h + 300 };
  const clamped = clampRectToPageBounds(rect, REAL_PAGE_SIZE);
  assert.equal(clamped.minX, 0);
  assert.equal(clamped.maxY, REAL_PAGE_SIZE.h);
});

test('clampRectToPageBounds: rect hoàn toàn ngoài trang (VD toàn bộ âm) -> collapse về (0,0), không lỗi/NaN', () => {
  const rect = { minX: -500, minY: -500, maxX: -100, maxY: -100 };
  const clamped = clampRectToPageBounds(rect, REAL_PAGE_SIZE);
  assert.deepEqual(clamped, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
});

// ─── rectSize / rectContains ─────────────────────────────────────────────────

test('rectSize: tính đúng w/h, không âm dù rect suy biến (min > max)', () => {
  assert.deepEqual(rectSize({ minX: 0, minY: 0, maxX: 100, maxY: 50 }), { w: 100, h: 50 });
  assert.deepEqual(rectSize({ minX: 100, minY: 50, maxX: 0, maxY: 0 }), { w: 0, h: 0 });
});

test('rectContains: inner nằm trọn trong outer -> true; inner tràn ra ngoài dù chỉ 1 cạnh -> false', () => {
  const outer = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  assert.equal(rectContains(outer, { minX: 10, minY: 10, maxX: 90, maxY: 90 }), true);
  assert.equal(rectContains(outer, { minX: 10, minY: 10, maxX: 110, maxY: 90 }), false); // tràn phải
  assert.equal(rectContains(outer, { minX: -5, minY: 10, maxX: 90, maxY: 90 }), false); // tràn trái
  assert.equal(rectContains(outer, { minX: 10, minY: 10, maxX: 90, maxY: 100 }), true); // đúng khít biên vẫn true
});

// ─── rectToDisplayBox — công thức hiển thị PHẢI khớp marker (contentCoord * effectiveScale) ─

test('rectToDisplayBox: đúng công thức contentCoord * effectiveScale (giống hệt marker)', () => {
  const box = rectToDisplayBox({ minX: 100, minY: 200, maxX: 300, maxY: 500 }, 2.5);
  assert.deepEqual(box, { left: 250, top: 500, width: 500, height: 750 });
});

test('rectToDisplayBox: effectiveScale đổi (zoom tiếp) -> box tự scale theo, KHÔNG cần render lại mới đúng vị trí', () => {
  const rect = { minX: 100, minY: 100, maxX: 200, maxY: 200 };
  const boxAt2x = rectToDisplayBox(rect, 2);
  const boxAt4x = rectToDisplayBox(rect, 4);
  assert.equal(boxAt4x.left, boxAt2x.left * 2);
  assert.equal(boxAt4x.width, boxAt2x.width * 2);
});

// ─── computeRenderQuality với VIEWPORT_RENDER_QUALITY_CAPS ở zoom 1x/5x/10x/20x
// (mô phỏng vùng visible thật sau overscan+clamp, container ~1000x700 CSS) ───

test('computeRenderQuality (viewport caps) ở zoom 1x/5x/10x/20x: quality tăng dần, không vượt hard cap viewport (nhỏ hơn NHIỀU whole-page cap)', () => {
  const container = { w: 1000, h: 700 };
  const fitScale = Math.min(container.w / REAL_PAGE_SIZE.w, container.h / REAL_PAGE_SIZE.h);
  const dpr = 2;

  const results: number[] = [];
  for (const zoomMultiplier of [1, 5, 10, 20]) {
    const effectiveScale = fitScale * zoomMultiplier;
    const visible = computeVisibleContentRect(0, 0, container, effectiveScale);
    const overscanned = applyOverscan(visible, OVERSCAN_FRACTION);
    const clamped = clampRectToPageBounds(overscanned, REAL_PAGE_SIZE);
    const regionSize = rectSize(clamped);
    const quality = computeRenderQuality(effectiveScale, dpr, regionSize, VIEWPORT_RENDER_QUALITY_CAPS);
    results.push(quality);

    // Canvas backing store thực tế (nếu render đúng quality này) phải nằm
    // trong budget đã khai báo — khoá cứng, không để vượt ngầm.
    const pxW = regionSize.w * quality, pxH = regionSize.h * quality;
    assert.ok(pxW <= VIEWPORT_RENDER_QUALITY_CAPS.maxDimensionPx + 1, `mult=${zoomMultiplier}: width ${pxW} vượt maxDimensionPx`);
    assert.ok(pxH <= VIEWPORT_RENDER_QUALITY_CAPS.maxDimensionPx + 1, `mult=${zoomMultiplier}: height ${pxH} vượt maxDimensionPx`);
    assert.ok(pxW * pxH <= VIEWPORT_RENDER_QUALITY_CAPS.maxTotalPixels * 1.01, `mult=${zoomMultiplier}: total px ${pxW * pxH} vượt maxTotalPixels`);
  }

  assert.ok(results[0] <= results[1] && results[1] <= results[2] && results[2] <= results[3],
    `expected non-decreasing quality theo zoom, got ${results.join(', ')}`);
  // Ở zoom sâu (10x/20x), quality PHẢI cao hơn HẲN cap whole-page (~2.23x đã
  // đo trong tmb-map-render-quality.test.ts) — đây chính là lợi ích cốt lõi
  // của viewport rendering so với whole-page adaptive cũ.
  assert.ok(results[2] > 2.3, `zoom 10x: quality ${results[2]} phải > whole-page cap ~2.23x`);
  assert.ok(results[3] > 2.3, `zoom 20x: quality ${results[3]} phải > whole-page cap ~2.23x`);
});

test('computeRenderQuality (viewport caps): zoom sâu vẫn KHÔNG downgrade khi shouldUpgradeRenderQuality so với baseline whole-page cũ', () => {
  const container = { w: 1000, h: 700 };
  const fitScale = Math.min(container.w / REAL_PAGE_SIZE.w, container.h / REAL_PAGE_SIZE.h);
  const effectiveScale = fitScale * 20;
  const visible = computeVisibleContentRect(0, 0, container, effectiveScale);
  const clamped = clampRectToPageBounds(applyOverscan(visible, OVERSCAN_FRACTION), REAL_PAGE_SIZE);
  const quality = computeRenderQuality(effectiveScale, 2, rectSize(clamped), VIEWPORT_RENDER_QUALITY_CAPS);
  const wholePageBaseline = 2.23; // cap whole-page đã khoá ở tmb-map-render-quality.test.ts
  assert.equal(shouldUpgradeRenderQuality(quality, wholePageBaseline), true);
});
