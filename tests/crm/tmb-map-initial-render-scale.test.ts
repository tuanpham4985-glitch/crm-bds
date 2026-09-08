import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Root cause đã audit (TMB_MOBILE_HLX_ROOT_CAUSE_PROVEN): canvas RASTER ban
// đầu (backing store) TRƯỚC ĐÂY luôn = kích thước NATIVE trang PDF ở
// BASE_SCALE=1, KHÔNG hề có cap — PDF trang nhỏ (Sài Gòn Park) an toàn, PDF
// raster nặng (HLX/TĐNĐ1) có thể alloc canvas vượt ngân sách mobile ngay lúc
// mở TMB. Fix: computeInitialRenderScale (tmb-map-render-quality.ts) kẹp
// scale raster BAN ĐẦU theo kích thước trang thật — nhưng viewport
// BASE_SCALE=1 vẫn PHẢI là geometry authority duy nhất cho marker/canvasSize.
// Không có React Testing Library/jsdom trong repo — theo ĐÚNG convention test
// hiện có (đọc SOURCE THẬT, assert cấu trúc/wiring bằng regex, không diễn giải).

const source = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');

function extractLoadEffectBlock(): string {
  // Từ "const page = await doc.getPage(...)" tới "setViewportPoints(points);"
  // — trọn vẹn đoạn getPage -> render -> setCanvasSize. Cố ý KHÔNG neo vào
  // bất kỳ marker nào của watchdog WIP (VD markProgress('page')) — đoạn WIP
  // đó chưa release, anchor phải khớp CẢ khi watchdog đã release/xoá lẫn khi
  // chưa (candidate cô lập không có watchdog).
  const m = source.match(/const page = await doc\.getPage\(pdfPageNumber\);[\s\S]*?setViewportPoints\(points\);/);
  assert.ok(m, 'không tìm thấy đoạn load PDF (getPage -> render -> setCanvasSize)');
  return m![0];
}

// ─── E. Geometry authority — viewport BASE_SCALE=1 KHÔNG BAO GIỜ đổi ───────

test('E1. viewport (geometry authority) LUÔN lấy scale: BASE_SCALE — KHÔNG đổi thành initialRenderScale/renderViewport', () => {
  const block = extractLoadEffectBlock();
  assert.match(block, /const viewport = page\.getViewport\(\{ scale: BASE_SCALE, rotation: page\.rotate \}\);/);
});

test('E2. Marker (points) tính TỪ `viewport` (BASE_SCALE=1) — KHÔNG PHẢI từ renderViewport/initialRenderScale', () => {
  const block = extractLoadEffectBlock();
  const pointsBlock = block.match(/const points = profile\.units\.map\(h => \{[\s\S]*?\}\);/)![0];
  assert.match(pointsBlock, /viewport\.convertToViewportPoint\(h\.pdfX, h\.pdfY\)/);
  assert.doesNotMatch(pointsBlock, /renderViewport/, 'marker KHÔNG được tính từ renderViewport (raster scale) — sẽ lệch vị trí khi bị cap');
});

test('E3. canvasSize (content-space cho fitScale/effectiveScale) lấy từ `viewport` (BASE_SCALE=1) — KHÔNG PHẢI canvas.width/height (raster, có thể bị cap nhỏ hơn)', () => {
  const block = extractLoadEffectBlock();
  assert.match(block, /setCanvasSize\(\{ w: Math\.ceil\(viewport\.width\), h: Math\.ceil\(viewport\.height\) \}\);/);
  assert.doesNotMatch(block, /setCanvasSize\(\{ w: canvas\.width, h: canvas\.height \}\)/, 'canvasSize KHÔNG được lấy từ canvas.width/height (raster) — phải luôn là kích thước native BASE_SCALE=1');
});

// ─── Wiring: initialRenderScale/renderViewport dùng ĐÚNG chỗ ───────────────

test('Wiring: initialRenderScale tính qua computeInitialRenderScale({w: viewport.width, h: viewport.height}) — dùng ĐÚNG viewport BASE_SCALE=1 làm input, không phải kích thước nào khác', () => {
  const block = extractLoadEffectBlock();
  assert.match(block, /const initialRenderScale = computeInitialRenderScale\(\{ w: viewport\.width, h: viewport\.height \}\);/);
});

test('Wiring: renderViewport (raster thật) dùng initialRenderScale — canvas.width/height + page.render() PHẢI dùng renderViewport, KHÔNG PHẢI viewport gốc', () => {
  const block = extractLoadEffectBlock();
  assert.match(block, /const renderViewport = initialRenderScale === BASE_SCALE\s*\n\s*\? viewport\s*\n\s*: page\.getViewport\(\{ scale: initialRenderScale, rotation: page\.rotate \}\);/);
  assert.match(block, /canvas\.width = Math\.ceil\(renderViewport\.width\);/);
  assert.match(block, /canvas\.height = Math\.ceil\(renderViewport\.height\);/);
  assert.match(block, /page\.render\(\{ canvasContext: ctx, viewport: renderViewport \}\)\.promise/);
});

test('Wiring: renderedRenderScaleRef.current PHẢI được gán = initialRenderScale (KHÔNG được im lặng giữ nguyên BASE_SCALE) — nếu không, renderHighRes sau này so sánh sai, bỏ lỡ lượt nâng chất lượng khi zoom', () => {
  const block = extractLoadEffectBlock();
  assert.match(block, /renderedRenderScaleRef\.current = initialRenderScale;/);
});

// ─── F. Adaptive high-res upgrade path KHÔNG bị đổi ─────────────────────────

test('F. renderHighRes/computeRenderQuality (đường nâng cấp DPR/zoom hiện có) KHÔNG bị sửa bởi fix này — vẫn dùng canvasSize (content-space) + effectiveScale y hệt trước', () => {
  assert.match(source, /const target = computeRenderQuality\(effectiveScale, getDevicePixelRatio\(\), canvasSize\);/);
  assert.match(source, /if \(!shouldUpgradeRenderQuality\(target, renderedRenderScaleRef\.current\)\) return;/);
});

// ─── Không hard-code project/profile, không detect mobile/UA ───────────────

function stripComments(code: string): string {
  // Bỏ toàn bộ comment (block + line) — chỉ giữ lại CODE THẬT để kiểm tra
  // hardcode/detection, vì comment giải thích root cause CÓ NHẮC tên dự án
  // (HLX/TĐNĐ1/Sài Gòn Park) làm ví dụ, không phải hardcode trong logic.
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

test('Không hard-code tên dự án/profile nào (HLX/TĐNĐ1/Saigon Park...) trong CODE THẬT của logic tính initialRenderScale — hoàn toàn generic theo kích thước trang thật (tên dự án CÓ xuất hiện trong comment giải thích root cause bằng ví dụ, không tính)', () => {
  const codeOnly = stripComments(extractLoadEffectBlock());
  assert.doesNotMatch(codeOnly, /HLX|TĐNĐ1|Saigon|SAIGON/i);
});

test('Không có device/UA/mobile detection nào được thêm (navigator/userAgent/isMobile/matchMedia) trong CODE THẬT của đoạn load PDF', () => {
  const codeOnly = stripComments(extractLoadEffectBlock());
  assert.doesNotMatch(codeOnly, /navigator\.|userAgent|isMobile|is_mobile|matchMedia/i);
});
