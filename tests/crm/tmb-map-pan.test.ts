import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exceedsDragThreshold, applyPanScroll,
  computeScaledContentSize, computeCenteringMargin,
} from '../../src/app/stacking/tmb-map-pan';

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

// ─── computeScaledContentSize / computeCenteringMargin: geometry thay thế
// flex-center — khoá đúng scaled size + margin để không tái diễn bug
// "chỉ pan được ~nửa phạm vi cần, không tới được góc" (đã đo thực tế trên
// browser: flex `alignItems/justifyContent:center` + overflow:auto với
// content tràn khung khiến scrollWidth chỉ báo cáo ~64% kích thước thật) ─

test('computeScaledContentSize: nhân đúng effectiveScale, độc lập W/H', () => {
  const size = computeScaledContentSize({ w: 3370, h: 2000 }, 0.5);
  assert.equal(size.w, 1685);
  assert.equal(size.h, 1000);
});

test('computeCenteringMargin: content NHỎ hơn container cả 2 trục -> margin lấp đầy vừa khít (canh giữa, không sinh scroll thừa)', () => {
  const container = { w: 1000, h: 600 };
  const scaled = { w: 800, h: 400 };
  const { marginX, marginY } = computeCenteringMargin(container, scaled);
  assert.equal(marginX, 100);
  assert.equal(marginY, 100);
  // Tổng kích thước sau margin phải khớp CHÍNH XÁC container (không dư/thiếu)
  assert.equal(scaled.w + marginX * 2, container.w);
  assert.equal(scaled.h + marginY * 2, container.h);
});

test('computeCenteringMargin: content TRÀN khung cả 2 trục -> margin = 0 (không cắt bớt phạm vi scroll)', () => {
  const container = { w: 1000, h: 600 };
  const scaled = { w: 2000, h: 1200 };
  const { marginX, marginY } = computeCenteringMargin(container, scaled);
  assert.equal(marginX, 0);
  assert.equal(marginY, 0);
});

test('computeCenteringMargin: đúng khít 1 trục (fit), dư viền trục kia -> margin đúng 0 ở trục khít, >0 ở trục dư (mô phỏng "Vừa khung" thật)', () => {
  const container = { w: 1000, h: 600 };
  const canvas = { w: 3370, h: 2000 };
  const fitScale = Math.min(container.w / canvas.w, container.h / canvas.h); // trục W khít
  const scaled = computeScaledContentSize(canvas, fitScale);
  const { marginX, marginY } = computeCenteringMargin(container, scaled);
  // Sai số dấu phẩy động cực nhỏ (fitScale nhân/chia không tròn) — không phải
  // margin thật, chấp nhận ngưỡng như các test round-trip khác trong repo.
  assert.ok(Math.abs(marginX) < 1e-9, `trục khít (W) không có margin, got ${marginX}`);
  assert.ok(marginY > 0, 'trục dư viền (H) phải có margin canh giữa');
});

test('computeCenteringMargin ở zoom 2x/5x/10x/20x: content tràn cả 2 trục -> margin=0 và max scroll = ĐỦ (scaled - container), không bị hụt như bug flex-center cũ', () => {
  const container = { w: 1000, h: 600 };
  const canvas = { w: 3370, h: 2000 };
  const fitScale = Math.min(container.w / canvas.w, container.h / canvas.h);

  for (const mult of [2, 5, 10, 20]) {
    const effectiveScale = fitScale * mult;
    const scaled = computeScaledContentSize(canvas, effectiveScale);
    const { marginX, marginY } = computeCenteringMargin(container, scaled);
    assert.equal(marginX, 0, `mult=${mult}: marginX phải = 0 (đã tràn khung)`);
    assert.equal(marginY, 0, `mult=${mult}: marginY phải = 0 (đã tràn khung)`);

    // Phạm vi scroll thật (scrollWidth/Height = scaled + margin*2 = scaled khi
    // margin=0) phải bằng ĐÚNG scaled - container ở CẢ 2 trục — đây là điều
    // flex-center cũ KHÔNG đảm bảo (đo thực tế chỉ ra scrollWidth báo thiếu,
    // cắt mất ~nửa phạm vi này, khiến kéo một đoạn thì dừng, không tới góc).
    const maxScrollLeft = scaled.w + marginX * 2 - container.w;
    const maxScrollTop = scaled.h + marginY * 2 - container.h;
    assert.equal(maxScrollLeft, scaled.w - container.w, `mult=${mult}: maxScrollLeft phải phản ánh ĐỦ chiều rộng đã scale`);
    assert.equal(maxScrollTop, scaled.h - container.h, `mult=${mult}: maxScrollTop phải phản ánh ĐỦ chiều cao đã scale`);
    assert.ok(maxScrollLeft > 0 && maxScrollTop > 0, `mult=${mult}: phải có phạm vi pan (không phải 0)`);
  }
});

test('computeCenteringMargin + applyPanScroll: kéo đủ xa theo cả 4 hướng phải chạm ĐÚNG 4 biên (0 và max), không dừng giữa chừng', () => {
  const container = { w: 1000, h: 600 };
  const canvas = { w: 3370, h: 2000 };
  const fitScale = Math.min(container.w / canvas.w, container.h / canvas.h);
  const scaled = computeScaledContentSize(canvas, fitScale * 5); // zoom 5x, tràn cả 2 trục
  const maxScrollLeft = scaled.w - container.w;
  const maxScrollTop = scaled.h - container.h;

  // Bắt đầu giữa phạm vi scroll, kéo cực xa mỗi hướng -> giá trị thô có thể
  // vượt biên (đúng, browser sẽ clamp khi gán vào scrollLeft/scrollTop thật);
  // clamp thủ công ở đây để mô phỏng đúng hành vi native setter.
  // applyPanScroll: scrollLeft = start - dx -> kéo tay SANG PHẢI (dx dương)
  // làm scrollLeft GIẢM (lộ mép TRÁI nội dung), kéo LÊN (dy âm) làm scrollTop
  // TĂNG (lộ mép DƯỚI) — đúng chiều "nội dung đi theo tay" đã test ở trên.
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  const startLeft = maxScrollLeft / 2, startTop = maxScrollTop / 2;
  const HUGE = 999999;

  const topLeft = applyPanScroll(startLeft, startTop, HUGE, HUGE); // kéo tay sang phải+xuống hết mức -> lộ góc trên-trái
  assert.equal(clamp(topLeft.scrollLeft, maxScrollLeft), 0);
  assert.equal(clamp(topLeft.scrollTop, maxScrollTop), 0);

  const bottomRight = applyPanScroll(startLeft, startTop, -HUGE, -HUGE); // kéo tay sang trái+lên hết mức -> lộ góc dưới-phải
  assert.equal(clamp(bottomRight.scrollLeft, maxScrollLeft), maxScrollLeft);
  assert.equal(clamp(bottomRight.scrollTop, maxScrollTop), maxScrollTop);

  const topRight = applyPanScroll(startLeft, startTop, -HUGE, HUGE); // sang trái (lộ phải) + xuống (lộ trên)
  assert.equal(clamp(topRight.scrollLeft, maxScrollLeft), maxScrollLeft);
  assert.equal(clamp(topRight.scrollTop, maxScrollTop), 0);

  const bottomLeft = applyPanScroll(startLeft, startTop, HUGE, -HUGE); // sang phải (lộ trái) + lên (lộ dưới)
  assert.equal(clamp(bottomLeft.scrollLeft, maxScrollLeft), 0);
  assert.equal(clamp(bottomLeft.scrollTop, maxScrollTop), maxScrollTop);
});
