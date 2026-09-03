import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampZoom,
  applyWheelZoom,
  screenPointToContentPoint,
  contentPointToScroll,
} from '../../src/app/stacking/tmb-map-zoom';

const RANGE = { min: 1, max: 20 };

test('clampZoom: kẹp về min/max, giữ nguyên giá trị trong khoảng', () => {
  assert.equal(clampZoom(5, RANGE), 5);
  assert.equal(clampZoom(0.2, RANGE), 1);
  assert.equal(clampZoom(999, RANGE), 20);
});

// ─── wheel up = zoom in, wheel down = zoom out ─────────────────────────────

test('applyWheelZoom: wheel up (deltaY < 0) tăng zoom', () => {
  const next = applyWheelZoom(2, -100, 0.08, RANGE);
  assert.ok(next > 2, `expected > 2, got ${next}`);
});

test('applyWheelZoom: wheel down (deltaY > 0) giảm zoom', () => {
  const next = applyWheelZoom(2, 100, 0.08, RANGE);
  assert.ok(next < 2, `expected < 2, got ${next}`);
});

test('applyWheelZoom: kẹp ở max — wheel up liên tục không vượt max', () => {
  let z = RANGE.max - 0.5;
  for (let i = 0; i < 50; i++) z = applyWheelZoom(z, -100, 0.08, RANGE);
  assert.equal(z, RANGE.max);
});

test('applyWheelZoom: kẹp ở min — wheel down liên tục không xuống dưới min', () => {
  let z = RANGE.min + 0.5;
  for (let i = 0; i < 50; i++) z = applyWheelZoom(z, 100, 0.08, RANGE);
  assert.equal(z, RANGE.min);
});

test('applyWheelZoom: nhiều tick wheel up cộng dồn tăng dần (mượt, không nhảy cóc)', () => {
  const z1 = applyWheelZoom(1, -100, 0.08, RANGE);
  const z2 = applyWheelZoom(z1, -100, 0.08, RANGE);
  const z3 = applyWheelZoom(z2, -100, 0.08, RANGE);
  assert.ok(z1 < z2 && z2 < z3, `expected monotonic increase, got ${z1}, ${z2}, ${z3}`);
  // Bước nhỏ hơn nút +/- (0.25) ở vùng gần 1.0x
  assert.ok(z1 - 1 < 0.25, `wheel step ${z1 - 1} phải nhỏ hơn bước nút +/- (0.25)`);
});

// ─── cursor-anchor math: điểm dưới cursor giữ nguyên vị trí màn hình qua zoom ─

test('screenPointToContentPoint + contentPointToScroll: round-trip giữ đúng điểm content dưới cursor', () => {
  const scrollLeft = 200, scrollTop = 100, cursorX = 50, cursorY = 30, oldScale = 2;
  const content = screenPointToContentPoint(scrollLeft, scrollTop, cursorX, cursorY, oldScale);
  // content point cố định — đổi effectiveScale rồi tính lại scroll cần thiết
  // để cùng điểm đó xuất hiện đúng tại (cursorX, cursorY) lần nữa.
  const newScale = 4;
  const { scrollLeft: newScrollLeft, scrollTop: newScrollTop } = contentPointToScroll(content.x, content.y, newScale, cursorX, cursorY);
  // Verify: áp lại screenPointToContentPoint với scroll mới + scale mới phải ra ĐÚNG content point cũ.
  const recovered = screenPointToContentPoint(newScrollLeft, newScrollTop, cursorX, cursorY, newScale);
  assert.ok(Math.abs(recovered.x - content.x) < 1e-9, `x lệch: ${recovered.x} vs ${content.x}`);
  assert.ok(Math.abs(recovered.y - content.y) < 1e-9, `y lệch: ${recovered.y} vs ${content.y}`);
});

test('contentPointToScroll: marker vẫn derive đúng effectiveScale (vị trí marker = native * effectiveScale, không đổi công thức)', () => {
  // Mô phỏng: marker ở native (100, 200), effectiveScale=3 -> vị trí hiển thị = (300, 600)
  const nativeX = 100, nativeY = 200, effectiveScale = 3;
  const displayX = nativeX * effectiveScale;
  const displayY = nativeY * effectiveScale;
  assert.equal(displayX, 300);
  assert.equal(displayY, 600);
  // Zoom quanh chính điểm marker (anchor = 0,0) -> scroll phải đúng bằng vị trí hiển thị
  const { scrollLeft, scrollTop } = contentPointToScroll(nativeX, nativeY, effectiveScale, 0, 0);
  assert.equal(scrollLeft, displayX);
  assert.equal(scrollTop, displayY);
});
