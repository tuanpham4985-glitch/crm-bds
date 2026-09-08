import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Regression cho wiring pinch-to-zoom (2 ngón tay) trong TmbMap.tsx — đúng
// convention repo hiện có: đọc SOURCE THẬT + assert cấu trúc/wiring bằng
// regex (không có jsdom/RTL, xem tmb-map-ui.test.ts). Toán học thuần
// (touchDistance/touchMidpoint/applyPinchZoom) đã có test riêng, đầy đủ, ở
// tests/crm/tmb-map-zoom.test.ts — file này CHỈ khoá phần WIRING vào
// component (state, handler, JSX) không bị xoá/sửa nhầm sau này.

const source = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');

test('TmbMap: import các hàm pinch từ tmb-map-zoom, TÁI SỬ DỤNG cùng module zoom thuần với wheel zoom (không tạo hệ zoom thứ 2)', () => {
  assert.match(source, /import \{ applyWheelZoom, screenPointToContentPoint, contentPointToScroll, touchDistance, touchMidpoint, applyPinchZoom \} from '\.\/tmb-map-zoom';/);
});

test('TmbMap: có ref theo dõi TẤT CẢ pointer đang chạm (activePointersRef) và trạng thái pinch riêng (pinchStateRef) — tách biệt dragStateRef (pan 1 ngón)', () => {
  assert.match(source, /const activePointersRef = useRef<Map<number, \{ x: number; y: number \}>>\(new Map\(\)\);/);
  assert.match(source, /const pinchStateRef = useRef<\{ startDistance: number; startZoom: number \} \| null>\(null\);/);
});

test('handlePointerDown: ngón thứ 2 chạm xuống -> huỷ drag 1 ngón đang dở, khởi tạo pinchStateRef với startZoom = zoomMultiplier HIỆN TẠI (không nhảy đột ngột lúc bắt đầu pinch)', () => {
  assert.match(source, /if \(activePointersRef\.current\.size === 2\) \{[\s\S]*?dragStateRef\.current = null;[\s\S]*?setIsDragging\(false\);[\s\S]*?pinchStateRef\.current = \{ startDistance: touchDistance\(pts\[0\], pts\[1\]\), startZoom: zoomMultiplier \};/);
});

test('handlePointerMove: khi đang pinch (đúng 2 ngón), zoom quanh TRUNG ĐIỂM 2 ngón — TÁI SỬ DỤNG pendingScrollTargetRef + screenPointToContentPoint (CÙNG cơ chế anchor wheel-zoom đã dùng)', () => {
  assert.match(source, /const pinch = pinchStateRef\.current;\s*\n\s*if \(pinch && activePointersRef\.current\.size === 2\) \{/);
  assert.match(source, /const mid = touchMidpoint\(pts\[0\], pts\[1\]\);/);
  assert.match(source, /pendingScrollTargetRef\.current = \{ x: nativeX, y: nativeY, anchorX: midX, anchorY: midY \};/);
  assert.match(source, /setZoomMultiplier\(applyPinchZoom\(pinch\.startZoom, pinch\.startDistance, dist, \{ min: MIN_ZOOM_MULT, max: MAX_ZOOM_MULT \}\)\);/);
});

test('handlePointerMove: dist <= 0 (dữ liệu lỗi/ngón trùng vị trí) -> bỏ qua lần đọc đó, KHÔNG chia cho 0/set zoom lỗi', () => {
  assert.match(source, /if \(dist <= 0\) return; \/\/ dữ liệu lỗi\/ngón trùng vị trí — bỏ qua lần đọc này/);
});

test('endDrag: kết thúc pinch (còn < 2 ngón) -> xoá pinchStateRef, KHÔNG hồi sinh pan 1 ngón cho ngón còn lại (tránh giật scroll ngay sau khi pinch xong)', () => {
  assert.match(source, /if \(pinchStateRef\.current\) \{\s*\n\s*if \(activePointersRef\.current\.size < 2\) \{[\s\S]*?pinchStateRef\.current = null;[\s\S]*?suppressNextClickRef\.current = true;[\s\S]*?\}\s*\n\s*return;\s*\n\s*\}/);
});

test('handleWheelZoom (desktop) không bị đụng vào — vẫn dùng applyWheelZoom + addEventListener wheel passive:false như cũ', () => {
  assert.match(source, /setZoomMultiplier\(z => applyWheelZoom\(z, e\.deltaY, WHEEL_ZOOM_FACTOR, \{ min: MIN_ZOOM_MULT, max: MAX_ZOOM_MULT \}\)\);/);
  assert.match(source, /addEventListener\('wheel', handleWheelZoom, \{ passive: false \}\)/);
});

test('nút +/- (zoom rời rạc) không bị đụng vào — vẫn setZoomMultiplier trực tiếp theo ZOOM_STEP, tách biệt hoàn toàn khỏi pinch/wheel', () => {
  assert.match(source, /onClick=\{\(\) => setZoomMultiplier\(z => Math\.max\(MIN_ZOOM_MULT, \+\(z - ZOOM_STEP\)\.toFixed\(2\)\)\)\}/);
  assert.match(source, /onClick=\{\(\) => setZoomMultiplier\(z => Math\.min\(MAX_ZOOM_MULT, \+\(z \+ ZOOM_STEP\)\.toFixed\(2\)\)\)\}/);
});

test('scrollRef container (nơi gắn pointer handlers) vẫn giữ touchAction: \'none\' — đã đủ để chặn browser hijack pinch/scroll NGAY TRÊN vùng map, tách biệt hoàn toàn khỏi header/search/nút +-/nút đóng (nằm ngoài div này)', () => {
  assert.match(source, /ref=\{scrollRef\}\s*\n\s*onPointerDown=\{handlePointerDown\}\s*\n\s*onPointerMove=\{handlePointerMove\}\s*\n\s*onPointerUp=\{endDrag\}\s*\n\s*onPointerCancel=\{endDrag\}\s*\n\s*onPointerLeave=\{endDrag\}/);
  assert.match(source, /touchAction: 'none',/);
});

test('marker vẫn derive vị trí hiển thị từ effectiveScale = fitScale \* zoomMultiplier — công thức KHÔNG đổi bởi pinch (pinch chỉ ghi setZoomMultiplier, không có state toạ độ riêng)', () => {
  assert.match(source, /const effectiveScale = fitScale \* zoomMultiplier;/);
});
