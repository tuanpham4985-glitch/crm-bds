import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  shouldSkipPdfBackgroundRender, HEAVY_RENDER_OPERATOR_THRESHOLD, CONSTRAINED_DEVICE_MAX_MEMORY_GB,
} from '../../src/app/stacking/tmb-map-render-fallback';

// TMB_HLX_MOBILE_FAILURE_STAGE mitigation — xem tmb-map-render-fallback.ts
// cho toàn bộ evidence (đo bằng pdfjs-dist getOperatorList() trực tiếp trên
// tmb-hlx-tdnd1.pdf/tmb-hlx-vbm1.pdf + browser bench loại trừ scale/
// useRequestAnimationFrame/probe runtime). Số liệu THẬT đã audit:
//   VBM1:  96,498 operators — an toàn.
//   TĐNĐ1: 207,250 operators — xác nhận crash mobile thật.
const VBM1_OPERATOR_COUNT = 96_498;
const TDND1_OPERATOR_COUNT = 207_250;

// ─── Cả 2 tín hiệu phải cùng đúng ───────────────────────────────────────────

test('true CHỈ khi operatorCount vượt ngưỡng VÀ deviceMemory nằm trong mức hạn chế — cả 2 tín hiệu cùng đúng', () => {
  assert.equal(shouldSkipPdfBackgroundRender(TDND1_OPERATOR_COUNT, 4), true);
  assert.equal(shouldSkipPdfBackgroundRender(TDND1_OPERATOR_COUNT, 2), true);
});

test('operatorCount vượt ngưỡng nhưng deviceMemory KHÔNG hạn chế (desktop/thiết bị mạnh) -> false, giữ nguyên hành vi render đầy đủ (giữ desktop behavior)', () => {
  assert.equal(shouldSkipPdfBackgroundRender(TDND1_OPERATOR_COUNT, 8), false);
  assert.equal(shouldSkipPdfBackgroundRender(TDND1_OPERATOR_COUNT, 16), false);
});

test('deviceMemory hạn chế nhưng operatorCount CHƯA vượt ngưỡng (VD VBM1, profile an toàn) -> false, không đổi hành vi VBM1', () => {
  assert.equal(shouldSkipPdfBackgroundRender(VBM1_OPERATOR_COUNT, 2), false);
  assert.equal(shouldSkipPdfBackgroundRender(VBM1_OPERATOR_COUNT, 4), false);
});

// ─── Thiếu tín hiệu -> false (no guessing) ──────────────────────────────────

test('operatorCount = undefined (profile CHƯA audit) -> luôn false dù deviceMemory hạn chế thế nào — không suy đoán khi thiếu dữ liệu audit', () => {
  assert.equal(shouldSkipPdfBackgroundRender(undefined, 2), false);
  assert.equal(shouldSkipPdfBackgroundRender(undefined, 0.5), false);
});

test('deviceMemory = undefined (API không hỗ trợ — Safari/Firefox/desktop cũ) -> luôn false dù operatorCount nặng thế nào — giữ hành vi render đầy đủ hiện có khi thiếu tín hiệu thiết bị', () => {
  assert.equal(shouldSkipPdfBackgroundRender(TDND1_OPERATOR_COUNT, undefined), false);
});

// ─── Ngưỡng chính xác (boundary) ────────────────────────────────────────────

test('operatorCount ĐÚNG BẰNG ngưỡng -> false (chỉ skip khi VƯỢT, không phải bằng)', () => {
  assert.equal(shouldSkipPdfBackgroundRender(HEAVY_RENDER_OPERATOR_THRESHOLD, 2), false);
  assert.equal(shouldSkipPdfBackgroundRender(HEAVY_RENDER_OPERATOR_THRESHOLD + 1, 2), true);
});

test('deviceMemory ĐÚNG BẰNG CONSTRAINED_DEVICE_MAX_MEMORY_GB vẫn coi là hạn chế (<=, không phải <)', () => {
  assert.equal(shouldSkipPdfBackgroundRender(TDND1_OPERATOR_COUNT, CONSTRAINED_DEVICE_MAX_MEMORY_GB), true);
  assert.equal(shouldSkipPdfBackgroundRender(TDND1_OPERATOR_COUNT, CONSTRAINED_DEVICE_MAX_MEMORY_GB + 0.01), false);
});

// ─── Ngưỡng nằm ĐÚNG GIỮA 2 profile đã audit (regression lock số liệu thật) ─

test('Ngưỡng phải nằm GIỮA số liệu thật VBM1 (an toàn) và TĐNĐ1 (đã xác nhận crash) — khoá regression nếu số liệu audit đổi', () => {
  assert.ok(HEAVY_RENDER_OPERATOR_THRESHOLD > VBM1_OPERATOR_COUNT, `threshold ${HEAVY_RENDER_OPERATOR_THRESHOLD} phải > VBM1 ${VBM1_OPERATOR_COUNT}`);
  assert.ok(HEAVY_RENDER_OPERATOR_THRESHOLD < TDND1_OPERATOR_COUNT, `threshold ${HEAVY_RENDER_OPERATOR_THRESHOLD} phải < TĐNĐ1 ${TDND1_OPERATOR_COUNT}`);
});

// ─── Thuần hàm — không đọc navigator trực tiếp (ranh giới đọc môi trường ở
// TmbMap.tsx, quyết định thuần hàm ở đây, xem getDeviceMemoryGB) ───────────

test('shouldSkipPdfBackgroundRender KHÔNG đọc navigator/window trực tiếp — test được không cần DOM/browser', () => {
  const source = fs.readFileSync('src/app/stacking/tmb-map-render-fallback.ts', 'utf8');
  const codeOnly = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/navigator\.|window\./.test(codeOnly), 'file logic thuần phải không đọc navigator/window trực tiếp');
});
