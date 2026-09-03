import assert from 'node:assert/strict';
import test from 'node:test';
import { exceedsDragThreshold, applyPanScroll } from '../../src/app/stacking/tmb-map-pan';

// ─── applyPanScroll: kéo map → scrollLeft/scrollTop thay đổi đúng ──────────

test('applyPanScroll: kéo sang phải/xuống → scrollLeft/scrollTop giảm (nội dung đi theo tay)', () => {
  const { scrollLeft, scrollTop } = applyPanScroll(100, 50, 30, 10);
  assert.equal(scrollLeft, 70);
  assert.equal(scrollTop, 40);
});

test('applyPanScroll: kéo hướng ngược (trái/lên) → pan đúng chiều ngược lại (scroll tăng)', () => {
  const { scrollLeft, scrollTop } = applyPanScroll(100, 50, -30, -10);
  assert.equal(scrollLeft, 130);
  assert.equal(scrollTop, 60);
});

test('applyPanScroll: dx/dy = 0 → không đổi scroll', () => {
  const { scrollLeft, scrollTop } = applyPanScroll(200, 80, 0, 0);
  assert.equal(scrollLeft, 200);
  assert.equal(scrollTop, 80);
});

test('applyPanScroll: trục X và Y độc lập nhau (kéo chỉ theo 1 trục)', () => {
  const onlyX = applyPanScroll(100, 100, 40, 0);
  assert.equal(onlyX.scrollLeft, 60);
  assert.equal(onlyX.scrollTop, 100);
  const onlyY = applyPanScroll(100, 100, 0, -25);
  assert.equal(onlyY.scrollLeft, 100);
  assert.equal(onlyY.scrollTop, 125);
});

// ─── exceedsDragThreshold: phân biệt click ngắn vs kéo ─────────────────────

test('exceedsDragThreshold: di chuyển nhỏ dưới ngưỡng → false (vẫn coi là click)', () => {
  assert.equal(exceedsDragThreshold(2, 1, 4), false);
  assert.equal(exceedsDragThreshold(0, 0, 4), false);
});

test('exceedsDragThreshold: đúng bằng ngưỡng → false (chỉ vượt mới tính là drag)', () => {
  assert.equal(exceedsDragThreshold(4, 0, 4), false);
  assert.equal(exceedsDragThreshold(0, 4, 4), false);
});

test('exceedsDragThreshold: vượt ngưỡng ở 1 trong 2 trục → true', () => {
  assert.equal(exceedsDragThreshold(5, 0, 4), true);
  assert.equal(exceedsDragThreshold(0, -5, 4), true);
});

test('exceedsDragThreshold: âm/dương đều tính theo trị tuyệt đối', () => {
  assert.equal(exceedsDragThreshold(-10, 2, 4), true);
  assert.equal(exceedsDragThreshold(-2, -1, 4), false);
});
