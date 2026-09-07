import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Root cause (audit "MOBILE_STACKING_SOURCE_ROOT_CAUSE_PROVEN"): GET
// /api/stacking/configs failing (network/JSON lỗi, hoặc {success:false} —
// VD Sheets quota 429) từng bị "nuốt" thành configs=[] KHÔNG kèm bất kỳ tín
// hiệu lỗi nào — UI hiện y hệt "Chưa có nguồn nào" dù nguồn vẫn tồn tại,
// chỉ là lượt tải đó lỗi. Fix: thêm state `configsError` TÁCH BIỆT khỏi
// "configs.length === 0" (rỗng THẬT). Không có React Testing Library/jsdom
// trong repo (xem package.json) — theo ĐÚNG convention test hiện có của
// project (tmb-map-ime-search.test.ts, tmb-map-render-quality.test.ts): đọc
// SOURCE THẬT của page.tsx, assert cấu trúc/wiring bằng regex trên code thật
// (không phải diễn giải/đoán hành vi).

const source = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');

function extractLoadConfigsBlock(): string {
  const m = source.match(/const loadConfigs = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/);
  assert.ok(m, 'không tìm thấy hàm loadConfigs');
  return m![0];
}

// ─── A/B. Success path — configs/selectedConfig set đúng, configsError CLEAR ─

test('A. loadConfigs — d.success=true: clear configsError, setConfigs(d.data), auto-chọn config đầu tiên nếu có (giữ NGUYÊN hành vi cũ)', () => {
  const block = extractLoadConfigsBlock();
  const successBranch = block.match(/if \(d\.success\) \{[\s\S]*?\n\s*\}/)![0];
  assert.match(successBranch, /setConfigsError\(''\)/);
  assert.match(successBranch, /setConfigs\(d\.data\)/);
  assert.match(successBranch, /if \(d\.data\.length > 0\) setSelectedConfig\(d\.data\[0\]\)/);
});

test('B. Empty-state THẬT ("Chưa có nguồn bảng hàng nào") CHỈ hiện khi !configsError && configs.length === 0 — success với data=[] vẫn ra đúng empty-state này (KHÔNG bị coi là lỗi)', () => {
  assert.match(source, /\{!configsError && configs\.length === 0 && \(/);
  assert.match(source, /Chưa có nguồn bảng hàng nào/);
});

// ─── C. {success:false} -> configsError, KHÔNG phải empty-state ────────────

test('C. loadConfigs — d.success=false: setConfigsError(d.error || fallback), KHÔNG rơi vào nhánh xoá/coi là rỗng', () => {
  const block = extractLoadConfigsBlock();
  const elseBranch = block.match(/\} else \{[\s\S]*?setConfigsError\([^)]*\);\s*\n\s*\}/)![0];
  assert.match(elseBranch, /setConfigsError\(d\.error \|\| 'Không tải được danh sách nguồn'\)/);
});

test('C2. UI: block lỗi ("Không tải được danh sách nguồn") gate bằng {configsError && ...} — RIÊNG BIỆT khỏi block "Chưa có nguồn bảng hàng nào" (2 nhánh không thể cùng hiện)', () => {
  assert.match(source, /\{configsError && \(/);
  assert.match(source, /Không tải được danh sách nguồn/);
});

test('C3. Toolbar selector: khi configs rỗng, phân biệt "Lỗi tải nguồn" (có configsError) với "Chưa có nguồn nào" (rỗng thật) — không còn 1 nhánh duy nhất che mất lỗi', () => {
  const toolbarBlock = source.match(/\{configs\.length > 0 \? \([\s\S]*?<\/div>\s*\) : configsError \? \([\s\S]*?\) : \([\s\S]*?Chưa có nguồn nào[\s\S]*?\)\}/);
  assert.ok(toolbarBlock, 'toolbar config selector phải có nhánh configsError riêng, đứng TRƯỚC nhánh "Chưa có nguồn nào"');
});

// ─── D. Network/parse failure (catch) -> configsError, KHÔNG bị nuốt im lặng ─

test('D. loadConfigs — .catch() PHẢI setConfigsError (KHÔNG còn .catch(() => {}) nuốt lỗi im lặng như code cũ)', () => {
  const block = extractLoadConfigsBlock();
  assert.doesNotMatch(block, /\.catch\(\(\) => \{\}\)/, 'không được còn catch rỗng nuốt lỗi im lặng (bug gốc đã audit)');
  assert.match(block, /\.catch\(\(\) => setConfigsError\(/);
});

// ─── E. Retry phục hồi từ lỗi -> thành công — TÁI SỬ DỤNG đúng 1 hàm loadConfigs ─

test('E. Nút "Thử lại" gọi TRỰC TIẾP loadConfigs (KHÔNG tự viết lại logic fetch lần 2) — retry thành công sẽ chạy lại ĐÚNG nhánh success ở test A, tự phục hồi configsError về rỗng', () => {
  const errorBlock = source.match(/\{configsError && \([\s\S]*?<\/div>\s*\)\}/)![0];
  assert.match(errorBlock, /onClick=\{loadConfigs\}/);
});

// ─── F. Không tự động lặp lại retry (không polling/setTimeout/interval) ─────

test('F. loadConfigs KHÔNG chứa bất kỳ setTimeout/setInterval nào — CHỈ chạy khi mount (1 useEffect) hoặc User bấm "Thử lại" (1 onClick), không có vòng lặp tự động', () => {
  const block = extractLoadConfigsBlock();
  assert.doesNotMatch(block, /setTimeout|setInterval/);
  // Đúng 1 nơi gọi loadConfigs() cho mount effect + đúng 1 nơi onClick= gọi
  // trực tiếp (test E) — tổng cộng CHỈ 2 lời gọi trong toàn file, không có
  // polling/interval nào khác gọi lại.
  const callSites = [...source.matchAll(/loadConfigs\(\)/g)];
  assert.equal(callSites.length, 1, `chỉ được đúng 1 lời gọi loadConfigs() (trong useEffect mount) — onClick={loadConfigs} không tính là 1 "call site" dạng loadConfigs(), tìm thấy ${callSites.length}`);
  assert.match(source, /useEffect\(\(\) => \{ loadConfigs\(\); \}, \[loadConfigs\]\);/);
});

// ─── G. Desktop/mobile dùng CHUNG 1 đường load — không có nhánh riêng theo thiết bị ─

test('G. loadConfigs/configsError KHÔNG có bất kỳ device/viewport detection nào (matchMedia/innerWidth/isMobile) — desktop và mobile CHẠY CHUNG đúng 1 code path này', () => {
  const block = extractLoadConfigsBlock();
  assert.doesNotMatch(block, /matchMedia|innerWidth|isMobile|is_mobile/i);
});

// ─── Không đổi phạm vi ngoài yêu cầu ────────────────────────────────────────

test('H. Không đổi logic Google Sheets quota/caching/retry-loop nào khác trong page.tsx (chỉ thêm configsError + tách loadConfigs) — vẫn CHỈ 1 fetch(\'/api/stacking/configs\') duy nhất cho luồng load nguồn', () => {
  const fetchCalls = [...source.matchAll(/fetch\('\/api\/stacking\/configs'\)/g)];
  assert.equal(fetchCalls.length, 1, `chỉ được đúng 1 fetch('/api/stacking/configs') (trong loadConfigs, dùng chung cho mount + retry) — tìm thấy ${fetchCalls.length}`);
});
