import assert from 'node:assert/strict';
import test from 'node:test';
import { mapPdfPointToStaticImagePoint } from '../../src/app/stacking/tmb-map-static-background';

// TĐNĐ1 chuyển sang static-image background (WebP rasterize offline) — TmbMap
// KHÔNG còn chạy pdf.js client-side cho profile này (loại bỏ ~207K operator
// gây crash mobile). mapPdfPointToStaticImagePoint THAY THẾ page.getViewport()
// .convertToViewportPoint() — fixtures dưới đây là kết quả THẬT đo bằng
// pdfjs-dist trực tiếp trên public/tmb-poc/tmb-hlx-tdnd1.pdf (getPage(1),
// scale=1, rotation=page.rotate=0, page.view=[0,0,1600,1200]) TRƯỚC khi
// rasterize — KHÔNG suy đoán, quy định (regression lock).

const NATIVE_H = 1200; // page.view=[0,0,1600,1200] — đã verify bằng pdfjs-dist

test('4 góc trang — khớp CHÍNH XÁC pdf.js viewport.convertToViewportPoint() đo thật (transform=[1,0,0,-1,0,1200])', () => {
  assert.deepEqual(mapPdfPointToStaticImagePoint(0, 0, NATIVE_H), { viewX: 0, viewY: 1200 });
  assert.deepEqual(mapPdfPointToStaticImagePoint(1600, 0, NATIVE_H), { viewX: 1600, viewY: 1200 });
  assert.deepEqual(mapPdfPointToStaticImagePoint(0, 1200, NATIVE_H), { viewX: 0, viewY: 0 });
  assert.deepEqual(mapPdfPointToStaticImagePoint(1600, 1200, NATIVE_H), { viewX: 1600, viewY: 0 });
});

test('điểm giữa trang — khớp pdf.js đo thật', () => {
  assert.deepEqual(mapPdfPointToStaticImagePoint(800, 600, NATIVE_H), { viewX: 800, viewY: 600 });
});

test('viewX luôn = pdfX (không đổi trục ngang) — chỉ Y bị lật', () => {
  for (const x of [0, 123.45, 800, 1600]) {
    assert.equal(mapPdfPointToStaticImagePoint(x, 999, NATIVE_H).viewX, x);
  }
});

test('viewY = nativeHeight - pdfY — tổng quát hoá với nativeHeight KHÁC 1200 (không hard-code 1200 trong hàm)', () => {
  assert.deepEqual(mapPdfPointToStaticImagePoint(100, 50, 2000), { viewX: 100, viewY: 1950 });
  assert.deepEqual(mapPdfPointToStaticImagePoint(100, 0, 900), { viewX: 100, viewY: 900 });
});

test('deterministic — cùng input luôn ra cùng output (thuần hàm, không side-effect/random)', () => {
  const a = mapPdfPointToStaticImagePoint(437.2, 918.6, 1200);
  const b = mapPdfPointToStaticImagePoint(437.2, 918.6, 1200);
  assert.deepEqual(a, b);
});
