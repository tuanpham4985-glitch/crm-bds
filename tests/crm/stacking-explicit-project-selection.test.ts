import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Yêu cầu "Explicit project selection" — vào /stacking KHÔNG được tự chọn
// configs[0] (trước đây tự chọn dự án đầu tiên, VD "The Global City", ngay
// cả khi User chưa bấm gì, kéo theo load towers/list/units ngay lập tức —
// Sheets reads không cần thiết nếu User thực ra muốn xem dự án khác).
// Không có React Testing Library/jsdom trong repo — theo ĐÚNG convention
// test hiện có: đọc SOURCE THẬT, assert cấu trúc/wiring bằng regex.

const source = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');

function extractLoadConfigsBlock(): string {
  const m = source.match(/const loadConfigs = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/);
  assert.ok(m, 'không tìm thấy hàm loadConfigs');
  return m![0];
}

// ─── 1. configs load KHÔNG auto-select configs[0] ───────────────────────────

test('1. loadConfigs() thành công KHÔNG còn gọi setSelectedConfig(d.data[0]) — selectedConfig vẫn null cho tới khi User tự chọn', () => {
  const block = extractLoadConfigsBlock();
  assert.doesNotMatch(block, /setSelectedConfig\(d\.data\[0\]\)/, 'không được auto-chọn dự án đầu tiên trong danh sách');
  assert.match(block, /setConfigs\(d\.data\);/, 'vẫn phải load danh sách configs để populate dropdown');
});

test('1b. selectedConfig khởi tạo = null (KHÔNG có giá trị mặc định khác null)', () => {
  assert.match(source, /const \[selectedConfig, setSelectedConfig\] = useState<StackingConfig \| null>\(null\);/);
});

// ─── 2. KHÔNG gọi project-data API nào khi selectedConfig chưa tồn tại ──────

test('2a. Effect towers (chế độ Lưới) return SỚM khi !selectedConfig — KHÔNG fetch tower nào trước khi có selectedConfig', () => {
  const m = source.match(/useEffect\(\(\) => \{\s*\n\s*if \(!selectedConfig \|\| selectedConfig\.loai === 'list'\) \{[\s\S]*?return; \}/);
  assert.ok(m, 'effect load towers phải return sớm khi !selectedConfig, TRƯỚC bất kỳ fetch nào');
});

test('2b. fetchListRows (chế độ Danh sách) return SỚM khi !selectedConfig — KHÔNG fetch list rows nào trước khi có selectedConfig', () => {
  const m = source.match(/const fetchListRows = useCallback\(\(manual\?: boolean\) => \{\s*\n\s*if \(!selectedConfig \|\| selectedConfig\.loai !== 'list'\) return;/);
  assert.ok(m, 'fetchListRows phải return sớm khi !selectedConfig, TRƯỚC dòng fetch()');
});

test('2c. fetchUnits (chọn tower) return SỚM khi !selectedConfig', () => {
  const m = source.match(/const fetchUnits = useCallback\(\(manual\?: boolean\) => \{\s*\n\s*if \(!selectedConfig \|\| !project \|\| !tower\) return;/);
  assert.ok(m, 'fetchUnits phải return sớm khi !selectedConfig, TRƯỚC dòng fetch()');
});

test('2d. useDbTmbMapProfiles (TMB profile lookup) nhận selectedConfig?.id — undefined khi chưa chọn, hook tự no-op (không hard-code lại guard ở page.tsx)', () => {
  assert.match(source, /useDbTmbMapProfiles\(selectedConfig\?\.id\)/);
});

// ─── 3. Chọn dự án -> load đúng luồng tương ứng ─────────────────────────────

test('3a. Effect towers (chế độ Lưới) phụ thuộc [selectedConfig] — chọn dự án TỰ ĐỘNG kích hoạt load towers, KHÔNG cần thao tác nào khác', () => {
  const towersEffect = source.match(/\/\/ 2\. Load towers when selected config changes[\s\S]*?\n  \}, \[selectedConfig\]\);/);
  assert.ok(towersEffect, 'không tìm thấy effect load towers với dependency [selectedConfig]');
});

test('3b. Effect list-rows phụ thuộc [selectedConfig, fetchListRows] — chọn dự án chế độ Danh sách TỰ ĐỘNG kích hoạt load rows', () => {
  assert.match(source, /useEffect\(\(\) => \{\s*\n\s*if \(!selectedConfig \|\| selectedConfig\.loai !== 'list'\) \{ setListColumns\(\[\]\); setListRows\(\[\]\); setListError\(''\); return; \}\s*\n\s*fetchListRows\(\);\s*\n\s*\}, \[selectedConfig, fetchListRows\]\);/);
});

test('3c. Dropdown chọn dự án CÓ option placeholder "Chọn dự án..." (value rỗng) — không mặc định chọn sẵn 1 dự án nào', () => {
  assert.match(source, /<option value="">Chọn dự án\.\.\.<\/option>/);
});

test('3d. Empty-state "Chọn dự án để xem bảng hàng" hiện khi CÓ configs nhưng CHƯA chọn — RIÊNG BIỆT với empty-state "chưa có nguồn nào" và error state', () => {
  assert.match(source, /\{!configsError && configs\.length > 0 && !selectedConfig && \(/);
  assert.match(source, /Chọn dự án để xem bảng hàng/);
});

// ─── 7. Manual refresh vẫn hoạt động (gửi ?refresh=1) ───────────────────────

test('7a. Nút "Làm mới" (chế độ Danh sách) gọi fetchListRows(true) — bật cờ manual để bypass cache', () => {
  assert.match(source, /onClick=\{\(\) => fetchListRows\(true\)\}/);
});

test('7b. Nút "Làm mới" (chế độ Lưới) gọi fetchUnits(true) — bật cờ manual để bypass cache', () => {
  assert.match(source, /onClick=\{\(\) => fetchUnits\(true\)\}/);
});

test('7c. fetchListRows/fetchUnits: manual=true PHẢI set params refresh=1 gửi lên server', () => {
  const listBlock = source.match(/const fetchListRows = useCallback\(\(manual\?: boolean\) => \{[\s\S]*?\n  \}, \[selectedConfig\]\);/)![0];
  assert.match(listBlock, /if \(manual\) params\.set\('refresh', '1'\);/);
  const unitsBlock = source.match(/const fetchUnits = useCallback\(\(manual\?: boolean\) => \{[\s\S]*?\n  \}, \[selectedConfig, project, tower\]\);/)![0];
  assert.match(unitsBlock, /if \(manual\) params\.set\('refresh', '1'\);/);
});

test('7d. Effect tự động (KHÔNG phải nút bấm) gọi fetchListRows()/fetchUnits() KHÔNG truyền manual=true — chỉ nút bấm mới bypass cache', () => {
  assert.match(source, /useEffect\(\(\) => \{ fetchUnits\(\); \}, \[fetchUnits\]\);/);
});

// ─── 8. Không hard-code project/device nào trong logic chọn dự án ───────────

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

test('8. loadConfigs/dropdown/empty-state KHÔNG hard-code tên dự án cụ thể (Global City/HLX/Saigon Park...) hay device/UA detection nào trong CODE THẬT', () => {
  const block = stripComments(extractLoadConfigsBlock());
  assert.doesNotMatch(block, /Global City|HLX|Saigon|VBM1|TĐNĐ1/i);
  assert.doesNotMatch(block, /navigator\.|userAgent|isMobile|matchMedia/i);
});
