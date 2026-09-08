import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  resolveTmbMapProfiles, TMB_HLX_VBM_CONFIG_ID, TMB_HLX_TDND1_PROFILE_ID, TMB_MAP_CONFIG_ID,
} from '../../src/app/stacking/tmb-map-data';
import { HEAVY_RENDER_OPERATOR_THRESHOLD } from '../../src/app/stacking/tmb-map-render-fallback';

// TMB_HLX_MOBILE_FAILURE_STAGE mitigation — wiring test (đúng convention repo
// hiện có, đọc SOURCE THẬT + assert cấu trúc bằng regex, không có jsdom/RTL,
// xem tmb-map-initial-render-scale.test.ts). Chứng minh:
// - TĐNĐ1 (profile duy nhất workload vượt ngưỡng) skip render nền trên thiết
//   bị tín hiệu bộ nhớ hạn chế; VBM1/Saigon Park KHÔNG bị ảnh hưởng.
// - Marker geometry (viewport BASE_SCALE=1, convertToViewportPoint,
//   setCanvasSize) hoàn toàn KHÔNG nằm trong nhánh bị skip — luôn chạy y hệt
//   trước fix, dù skipPdfBackground true hay false.
// - Cả 3 lượt page.render() (initial + renderHighRes + renderViewportHighRes)
//   đều bị chặn khi skipPdfBackground — không có đường nào lọt qua zoom/pan.

const source = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');

test('1. Profile data: TĐNĐ1 (đã audit 207,250 operators) vượt HEAVY_RENDER_OPERATOR_THRESHOLD; VBM1 + Saigon Park (đã audit/an toàn) KHÔNG vượt', () => {
  const hlxProfiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  const tdnd1 = hlxProfiles.find(p => p.configId === TMB_HLX_TDND1_PROFILE_ID);
  const vbm1 = hlxProfiles.find(p => p.configId === TMB_HLX_VBM_CONFIG_ID);
  const saigonPark = resolveTmbMapProfiles({ id: TMB_MAP_CONFIG_ID })[0];

  assert.ok(tdnd1?.knownOperatorCount, 'TĐNĐ1 phải có knownOperatorCount đã audit');
  assert.ok(tdnd1!.knownOperatorCount! > HEAVY_RENDER_OPERATOR_THRESHOLD, 'TĐNĐ1 phải vượt ngưỡng workload nặng');

  assert.ok(vbm1?.knownOperatorCount, 'VBM1 phải có knownOperatorCount đã audit');
  assert.ok(vbm1!.knownOperatorCount! < HEAVY_RENDER_OPERATOR_THRESHOLD, 'VBM1 KHÔNG được vượt ngưỡng — giữ nguyên hành vi render đầy đủ');

  // Saigon Park chưa từng nằm trong audit workload này — knownOperatorCount
  // để undefined (KHÔNG suy đoán) là hành vi ĐÚNG, tương đương "an toàn".
  assert.equal(saigonPark.knownOperatorCount, undefined, 'Saigon Park không được gán knownOperatorCount suy đoán');
});

test('2. TmbMap.tsx import + tính skipPdfBackground TỪ profile.knownOperatorCount (useMemo, ổn định theo mount — KHÔNG phụ thuộc zoom/effectiveScale/canvasSize)', () => {
  assert.match(source, /import \{ shouldSkipPdfBackgroundRender \} from '\.\/tmb-map-render-fallback';/);
  assert.match(source, /const skipPdfBackground = useMemo\(\s*\n\s*\(\) => shouldSkipPdfBackgroundRender\(profile\.knownOperatorCount, getDeviceMemoryGB\(\)\),\s*\n\s*\[profile\.knownOperatorCount\]\s*\n\s*\);/);
});

test('3. Lượt render ĐẦU (initial) bị chặn khi skipPdfBackground — page.render() CHỈ chạy trong nhánh else, canvas vẫn giữ nguyên trắng đã fill trước đó (không đổi kích thước/canvas-allocated)', () => {
  const block = source.match(/const canvas = canvasRef\.current;[\s\S]*?const points = profile\.units\.map/)![0];
  assert.match(block, /if \(skipPdfBackground\) \{[\s\S]*?\} else \{[\s\S]*?await page\.render\(\{ canvasContext: ctx, viewport: renderViewport \}\)\.promise;[\s\S]*?\}/);
});

test('4. renderHighRes VÀ renderViewportHighRes đều early-return khi skipPdfBackground — không có đường nào (kể cả zoom sâu/pan) lọt qua để gọi page.render() cho profile+thiết bị đã bị skip', () => {
  const highResBlock = source.match(/const renderHighRes = useCallback\(async \(targetScale: number\) => \{[\s\S]*?\n  \}, \[\]\);/)![0];
  assert.match(highResBlock, /^\s*if \(skipPdfBackground\) return;/m, 'renderHighRes phải early-return NGAY ĐẦU function, trước khi chạm pageRef/canvas');

  const viewportBlock = source.match(/const renderViewportHighRes = useCallback\(async \(rect: Rect, targetScale: number\) => \{[\s\S]*?\n  \}, \[\]\);/)![0];
  assert.match(viewportBlock, /^\s*if \(skipPdfBackground\) return;/m, 'renderViewportHighRes phải early-return NGAY ĐẦU function');
});

test('5. Marker geometry (viewport BASE_SCALE=1, convertToViewportPoint, setCanvasSize, setViewportPoints) KHÔNG nằm trong nhánh if/else skipPdfBackground — luôn chạy giống hệt trước fix dù skip hay không', () => {
  const block = source.match(/const canvas = canvasRef\.current;[\s\S]*?setViewportPoints\(points\);/)![0];
  // Đoạn "if (skipPdfBackground) {...} else {...}" phải KẾT THÚC (đóng dấu })
  // TRƯỚC dòng "const points = profile.units.map" — tức nhánh skip chỉ bọc
  // đúng page.render(), không bọc luôn phần tính marker.
  const skipBranchEnd = block.indexOf('} else {');
  const pointsLine = block.indexOf('const points = profile.units.map');
  assert.ok(skipBranchEnd !== -1 && pointsLine !== -1 && skipBranchEnd < pointsLine, 'nhánh skip phải đóng lại TRƯỚC khi tính marker points');
  assert.match(block, /viewport\.convertToViewportPoint\(h\.pdfX, h\.pdfY\)/);
  assert.match(block, /setCanvasSize\(\{ w: Math\.ceil\(viewport\.width\), h: Math\.ceil\(viewport\.height\) \}\);/);
});

test('6. getDeviceMemoryGB đọc navigator.deviceMemory AN TOÀN (feature-detect, không throw khi SSR/API không hỗ trợ) — KHÔNG UA-sniffing (không dùng userAgent)', () => {
  const fnBlock = source.match(/function getDeviceMemoryGB\(\)[\s\S]*?\n\}/)![0];
  assert.match(fnBlock, /typeof navigator === 'undefined'/);
  assert.doesNotMatch(fnBlock, /userAgent/i, 'không được dùng UA-sniffing — chỉ Device Memory API (navigator.deviceMemory)');
});
