import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampZoom,
  applyWheelZoom,
  screenPointToContentPoint,
  contentPointToScroll,
  touchDistance,
  touchMidpoint,
  applyPinchZoom,
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

// ─── pinch-to-zoom (2 ngón tay) ─────────────────────────────────────────────

test('touchDistance: khoảng cách Euclid giữa 2 điểm', () => {
  assert.equal(touchDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(touchDistance({ x: 10, y: 10 }, { x: 10, y: 10 }), 0);
});

test('touchMidpoint: trung điểm giữa 2 ngón tay', () => {
  assert.deepEqual(touchMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 }), { x: 5, y: 10 });
  assert.deepEqual(touchMidpoint({ x: -10, y: 5 }, { x: 10, y: 5 }), { x: 0, y: 5 });
});

test('applyPinchZoom: 2 ngón tách xa hơn lúc bắt đầu -> tăng zoom', () => {
  const next = applyPinchZoom(2, 100, 200, RANGE);
  assert.ok(next > 2, `expected > 2, got ${next}`);
  assert.equal(next, 4);
});

test('applyPinchZoom: 2 ngón gần lại hơn lúc bắt đầu -> giảm zoom', () => {
  const next = applyPinchZoom(4, 200, 100, RANGE);
  assert.ok(next < 4, `expected < 4, got ${next}`);
  assert.equal(next, 2);
});

test('applyPinchZoom: currentDistance === startDistance -> giữ nguyên startZoom (không nhảy đột ngột lúc bắt đầu pinch)', () => {
  assert.equal(applyPinchZoom(3, 150, 150, RANGE), 3);
});

test('applyPinchZoom: kẹp về max khi pinch-out mạnh vượt giới hạn', () => {
  const next = applyPinchZoom(RANGE.max - 0.5, 100, 1000, RANGE);
  assert.equal(next, RANGE.max);
});

test('applyPinchZoom: kẹp về min khi pinch-in mạnh dưới giới hạn', () => {
  const next = applyPinchZoom(RANGE.min + 0.5, 1000, 10, RANGE);
  assert.equal(next, RANGE.min);
});

test('applyPinchZoom: distance <=0 (dữ liệu lỗi/ngón tay trùng vị trí) -> giữ nguyên startZoom đã clamp, không chia cho 0', () => {
  assert.equal(applyPinchZoom(3, 0, 100, RANGE), 3);
  assert.equal(applyPinchZoom(3, 100, 0, RANGE), 3);
  assert.equal(applyPinchZoom(999, 0, 0, RANGE), RANGE.max);
});

test('applyPinchZoom: nhiều bước pinch-out liên tiếp cùng 1 mốc (startZoom/startDistance) tăng đơn điệu theo tỉ lệ, không tích luỹ sai số', () => {
  const startZoom = 1, startDistance = 100;
  const z1 = applyPinchZoom(startZoom, startDistance, 120, RANGE);
  const z2 = applyPinchZoom(startZoom, startDistance, 150, RANGE);
  const z3 = applyPinchZoom(startZoom, startDistance, 200, RANGE);
  assert.ok(z1 < z2 && z2 < z3, `expected monotonic increase, got ${z1}, ${z2}, ${z3}`);
});
