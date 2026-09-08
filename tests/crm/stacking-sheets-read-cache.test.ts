import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { stackingListRowsCacheKey, stackingUnitsCacheKey, stackingSheetListCacheKey } from '../../src/lib/data-access';

// Root cause đã audit (GOOGLE_SHEETS_READ_AMPLIFICATION_ROOT_CAUSE_PROVEN):
// getStackingConfigs/getStackingListRows/getStackingUnits/getStackingSheetList/
// getStackingListColumns TRƯỚC ĐÂY là pass-through TRẦN (không như getPipeline/
// getDuAn — đã cached() từ lâu) — mỗi lần chọn dự án đều đọc THẬT Sheets,
// không có bảo vệ chống gọi lặp lại đúng cùng dữ liệu. Test dưới đây verify
// key-builder THẬT (hành vi thực, không phải regex) + wiring cached()/route
// bằng source-inspection (đúng convention hiện có, KHÔNG mock network Sheets).

const dataAccessSource = fs.readFileSync('src/lib/data-access.ts', 'utf8');
const routeSource = fs.readFileSync('src/app/api/stacking/route.ts', 'utf8');

// ─── 5. Key builder: khác sheet/tab/project/tower/columns -> khác key (không trộn) ─

test('5a. stackingListRowsCacheKey: khác sheetId -> khác key (2 dự án khác nhau không đọc chung cache)', () => {
  const k1 = stackingListRowsCacheKey('sheetA', 'tab1');
  const k2 = stackingListRowsCacheKey('sheetB', 'tab1');
  assert.notEqual(k1, k2);
});

test('5b. stackingListRowsCacheKey: cùng sheetId khác tab -> khác key', () => {
  const k1 = stackingListRowsCacheKey('sheetX', 'tabA');
  const k2 = stackingListRowsCacheKey('sheetX', 'tabB');
  assert.notEqual(k1, k2);
});

test('5c. stackingListRowsCacheKey: khác visibleColumns -> khác key (Admin đổi cột hiển thị không đọc nhầm cache cũ)', () => {
  const k1 = stackingListRowsCacheKey('sheetX', 'tabA', ['Mã căn', 'Giá']);
  const k2 = stackingListRowsCacheKey('sheetX', 'tabA', ['Mã căn']);
  assert.notEqual(k1, k2);
});

test('5d. stackingListRowsCacheKey: CÙNG hệt tham số -> CÙNG key (ổn định, deterministic — điều kiện cần để cached()/invalidate() hoạt động đúng)', () => {
  const k1 = stackingListRowsCacheKey('sheetX', 'tabA', ['Mã căn', 'Giá']);
  const k2 = stackingListRowsCacheKey('sheetX', 'tabA', ['Mã căn', 'Giá']);
  assert.equal(k1, k2);
});

test('5e. stackingUnitsCacheKey: khác project/tower -> khác key', () => {
  const k1 = stackingUnitsCacheKey('sheetX', 'MPP', 'A1');
  const k2 = stackingUnitsCacheKey('sheetX', 'MPP', 'A2');
  const k3 = stackingUnitsCacheKey('sheetX', 'MCC', 'A1');
  assert.notEqual(k1, k2);
  assert.notEqual(k1, k3);
  assert.notEqual(k2, k3);
});

test('5f. stackingSheetListCacheKey: khác projectCode -> khác key; projectCode undefined vẫn ra key ổn định', () => {
  const k1 = stackingSheetListCacheKey('sheetX', 'MPP');
  const k2 = stackingSheetListCacheKey('sheetX', 'MCC');
  const k3 = stackingSheetListCacheKey('sheetX');
  assert.notEqual(k1, k2);
  assert.notEqual(k1, k3);
  assert.notEqual(k2, k3);
});

// ─── Wiring: data-access.ts bọc cached() cho đúng các hàm stacking, TTL ngắn ─

test('getStackingConfigs/getStackingListRows/getStackingUnits/getStackingSheetList/getStackingListColumns đều bọc cached() — KHÔNG còn pass-through trần', () => {
  // getStackingConfigs() giờ có 1 early-return branch TRƯỚC (đọc Postgres mirror
  // khi module 'stacking' bật — xem audit STACKING_CONFIG_QUOTA_INDEPENDENCE,
  // stacking-config-quota-independence.test.ts) — nhánh Sheets mặc định (flag
  // tắt) VẪN PHẢI bọc cached('gs:stacking_configs', 30_000, ...) y hệt trước,
  // chỉ không còn là statement ĐẦU TIÊN trong thân hàm nữa.
  const getConfigsBody = dataAccessSource.match(/export function getStackingConfigs\(\) \{[\s\S]*?\n\}/)![0];
  assert.match(getConfigsBody, /return cached\('gs:stacking_configs', 30_000, \(\) => GS\.getStackingConfigs\(\)\);/);
  assert.match(dataAccessSource, /export function getStackingListRows\([^)]*\) \{\s*\n\s*return cached\(stackingListRowsCacheKey/);
  assert.match(dataAccessSource, /export function getStackingUnits\([^)]*\) \{\s*\n\s*return cached\(stackingUnitsCacheKey/);
  assert.match(dataAccessSource, /export function getStackingSheetList\([^)]*\) \{\s*\n\s*return cached\(stackingSheetListCacheKey/);
  assert.match(dataAccessSource, /export function getStackingListColumns\([^)]*\) \{\s*\n\s*return cached\(`gs:stacking_columns/);
});

test('probeStackingSheet KHÔNG cache — cần độ mới tuyệt đối (bước Admin "Kiểm tra" kết nối Sheet)', () => {
  assert.match(dataAccessSource, /export const probeStackingSheet\s*=\s*GS\.probeStackingSheet;/);
});

// ─── Invalidate-on-write: sửa/thêm/xoá config phải xoá cache configs cũ ─────

test('addStackingConfig/updateStackingConfig/deleteStackingConfig đều gọi invalidate(\'gs:stacking_configs\') SAU KHI ghi thành công — tránh đọc lại config list đã cũ', () => {
  const addBlock = dataAccessSource.match(/export async function addStackingConfig\([\s\S]*?\n\}/)![0];
  const updateBlock = dataAccessSource.match(/export async function updateStackingConfig\([\s\S]*?\n\}/)![0];
  const deleteBlock = dataAccessSource.match(/export async function deleteStackingConfig\([\s\S]*?\n\}/)![0];
  for (const [name, block] of [['add', addBlock], ['update', updateBlock], ['delete', deleteBlock]] as const) {
    assert.match(block, /invalidate\('gs:stacking_configs'\)/, `${name}StackingConfig phải invalidate cache configs sau khi ghi thành công`);
  }
});

// ─── 6. route.ts: refresh=1 -> invalidate ĐÚNG key TRƯỚC khi đọc (Làm mới thật sự mới) ─

test('6a. mode=list: refresh=1 gọi invalidate(stackingListRowsCacheKey(...)) TRƯỚC KHI đọc getStackingListRows', () => {
  const listBranch = routeSource.match(/if \(searchParams\.get\('mode'\) === 'list'\) \{[\s\S]*?\n    \}/)![0];
  const refreshIdx = listBranch.indexOf("if (searchParams.get('refresh') === '1') invalidate(stackingListRowsCacheKey(sheetId, tab, visibleColumns));");
  const readIdx = listBranch.indexOf('getStackingListRows(sheetId, tab, visibleColumns)');
  assert.ok(refreshIdx > 0, 'thiếu invalidate() khi refresh=1 trong nhánh mode=list');
  assert.ok(readIdx > refreshIdx, 'invalidate() phải chạy TRƯỚC lời gọi getStackingListRows, không phải sau');
});

test('6b. chế độ Lưới (project/tower): refresh=1 gọi invalidate(stackingUnitsCacheKey(...)) TRƯỚC KHI đọc getStackingUnits', () => {
  const refreshIdx = routeSource.indexOf("if (searchParams.get('refresh') === '1') invalidate(stackingUnitsCacheKey(sheetId, project, tower));");
  const readIdx = routeSource.indexOf('getStackingUnits(sheetId, project, tower)');
  assert.ok(refreshIdx > 0, 'thiếu invalidate() khi refresh=1 trong nhánh chế độ Lưới');
  assert.ok(readIdx > refreshIdx, 'invalidate() phải chạy TRƯỚC lời gọi getStackingUnits');
});

// ─── 6 (errors không bị che). Lỗi vẫn trả success:false, KHÔNG map thành mảng rỗng ─

test('route.ts: nhánh mode=list/chế độ Lưới vẫn throw tự nhiên khi getStackingListRows/getStackingUnits reject (VD 429 từ cached()) — không có try/catch nào nuốt lỗi thành dữ liệu rỗng ở đây, xử lý lỗi chung ở catch() ngoài cùng như cũ', () => {
  assert.doesNotMatch(routeSource, /catch\s*\([^)]*\)\s*\{\s*return NextResponse\.json\(\{ success: true, data: \{ columns: \[\], rows: \[\] \} \}\)/);
  assert.match(routeSource, /\} catch \(err\) \{/, 'vẫn phải có catch() ngoài cùng xử lý lỗi thật (bao gồm 429) — không đổi hành vi này');
});

// ─── 8. Không hard-code project/device nào trong cache key/logic ────────────

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

test('8. cache key builder + wiring KHÔNG hard-code tên dự án cụ thể hay device/UA detection nào trong CODE THẬT', () => {
  const codeOnly = stripComments(dataAccessSource);
  assert.doesNotMatch(codeOnly, /Global City|HLX|Saigon|VBM1|TĐNĐ1/i);
  assert.doesNotMatch(codeOnly, /navigator\.|userAgent|isMobile|matchMedia/i);
});
