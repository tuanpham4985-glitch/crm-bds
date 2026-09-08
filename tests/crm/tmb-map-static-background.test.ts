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

// ─── VBM1 cũng chuyển sang static-image (page.render() không hoàn tất được
// cho PDF này qua pdf.js — PDF nhúng ảnh nền 12000×7978px ~96MP, xem
// tmb-map-data.ts) — CÙNG khổ trang 1600×1200/rotation=0 với TĐNĐ1 (đã verify
// trực tiếp bằng pdfjs-dist: page.view=[0,0,1600,1200]), nên dùng lại NGUYÊN
// hàm này. Fixtures dưới đây là 5 mã unit THẬT của VBM1 (TMB_HLX_VBM_UNITS,
// tmb-map-data.ts) — kết quả pdf.js.convertToViewportPoint() đo thật đã đối
// chiếu khớp TUYỆT ĐỐI với mapPdfPointToStaticImagePoint trước khi chuyển
// kiến trúc (không suy đoán, quy định — regression lock).

test('VBM1: 5 mã unit thật (TMB_HLX_VBM_UNITS) — khớp CHÍNH XÁC pdf.js viewport.convertToViewportPoint() đo thật trên chính file PDF VBM1', () => {
  const vbm1Units = [
    { unitCode: 'BM34-25', pdfX: 980.4717800000002, pdfY: 731.690335, expected: { viewX: 980.4717800000002, viewY: 468.309665 } },
    { unitCode: 'BM17-12', pdfX: 900.1126679000002, pdfY: 610.4550035000001, expected: { viewX: 900.1126679000002, viewY: 589.5449964999999 } },
    { unitCode: 'BM6-13', pdfX: 1044.8478556, pdfY: 687.5826086, expected: { viewX: 1044.8478556, viewY: 512.4173914 } },
    { unitCode: 'BM54-03', pdfX: 1073.4441127000002, pdfY: 492.8106311, expected: { viewX: 1073.4441127000002, viewY: 707.1893689 } },
    { unitCode: 'BM57-28', pdfX: 975.3666729000005, pdfY: 433.41757970000003, expected: { viewX: 975.3666729000005, viewY: 766.5824202999999 } },
  ];
  for (const u of vbm1Units) {
    const result = mapPdfPointToStaticImagePoint(u.pdfX, u.pdfY, 1200);
    assert.ok(Math.abs(result.viewX - u.expected.viewX) < 1e-6 && Math.abs(result.viewY - u.expected.viewY) < 1e-6,
      `${u.unitCode}: expected ${JSON.stringify(u.expected)}, got ${JSON.stringify(result)}`);
  }
});
