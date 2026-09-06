import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { dbProfileToTmbMapProfile, type TmbDbProfileRow, type TmbDbUnitMapping } from '../../src/app/stacking/tmb-map-registry';

/** TMB Review Preview — "Xem TMB" cho profile READY_FOR_REVIEW, TRƯỚC khi
 * Kích hoạt (Admin cần xác nhận fidelity bản vẽ Web asset mới trước khi cho
 * chạy production — use case thật: profile QA "HLX - TĐNĐ1 - Test",
 * mapped 0/11, KHÔNG được kích hoạt trong task này). Đọc-only tuyệt đối:
 * dùng LẠI đúng route GET /api/stacking/tmb-profiles/[id] (đã cho phép Admin
 * đọc bất kỳ status nào từ trước, xem route đó) + đúng converter
 * dbProfileToTmbMapProfile() (CÙNG hàm useDbTmbMapProfiles dùng cho runtime
 * ACTIVE-only) + đúng renderer TmbMap.tsx — KHÔNG route mới, KHÔNG renderer
 * PDF thứ 2, KHÔNG nới lỏng ACTIVE-only filter của runtime registry.
 */

const panelSource = fs.readFileSync('src/app/stacking/TmbManagerPanel.tsx', 'utf8');
const registrySource = fs.readFileSync('src/app/stacking/tmb-map-registry.ts', 'utf8');
const idRouteSource = fs.readFileSync('src/app/api/stacking/tmb-profiles/[id]/route.ts', 'utf8');
const tmbMapSource = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');
const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');

function makeRow(overrides: Partial<TmbDbProfileRow> = {}): TmbDbProfileRow {
  return {
    id: 'cmtpo31lb000004l5vf2274go',
    stacking_config_id: 'SC_1788510325994',
    label: 'HLX - TĐNĐ1 - Test',
    subdivision: 'TĐNĐ1',
    web_asset_ref: '/api/stacking/tmb-assets/somekey',
    page_number: 1,
    status: 'READY_FOR_REVIEW',
    ...overrides,
  };
}

// ─── A. READY_FOR_REVIEW profile hiện nút "Xem TMB" ─────────────────────────

test('TmbManagerPanel: nút "Xem TMB" hiện khi profile CÓ web_asset_ref — KHÔNG gate cứng theo status cụ thể (bao trùm READY_FOR_REVIEW, và ACTIVE/ANALYZED-đã-optimize nếu có web_asset_ref, theo đúng yêu cầu "optionally ANALYZED nếu web_asset_ref đã tồn tại")', () => {
  assert.match(panelSource, /\{p\.web_asset_ref && \(\s*\n\s*<button[^>]*onClick=\{\(\) => openPreview\(p\)\}/);
  assert.match(panelSource, /Xem TMB/);
});

test('TmbManagerPanel: STATUS_LABEL vẫn hiển thị đúng "Chờ review" cho READY_FOR_REVIEW — Preview không đổi lifecycle label hiện có', () => {
  assert.match(panelSource, /READY_FOR_REVIEW: 'Chờ review'/);
});

test('TmbManagerPanel: nút "Xem TMB" đặt CẠNH "Kích hoạt", KHÔNG thay thế nó — cả 2 action cùng tồn tại độc lập', () => {
  const idxPreview = panelSource.indexOf("onClick={() => openPreview(p)}");
  const idxActivate = panelSource.indexOf("p.status === 'ACTIVE' ? 'Ngừng dùng' : 'Kích hoạt'");
  assert.ok(idxPreview > 0 && idxActivate > 0);
  assert.ok(idxPreview < idxActivate, 'nút Xem TMB phải đứng TRƯỚC Kích hoạt trong DOM (thứ tự hiển thị [ Xem TMB ] [ Kích hoạt ])');
});

// ─── B. Preview KHÔNG gọi activation ────────────────────────────────────────

test('openPreview(): CHỈ gọi GET /api/stacking/tmb-profiles/[id] — KHÔNG gọi /activate, KHÔNG POST/PATCH/DELETE nào', () => {
  const fnMatch = panelSource.match(/async function openPreview\(p: TmbProfileRow\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fnMatch, 'phải tìm thấy thân hàm openPreview');
  const fnBody = fnMatch![0];
  assert.match(fnBody, /fetch\(`\/api\/stacking\/tmb-profiles\/\$\{p\.id\}`\)/, 'phải gọi ĐÚNG route GET chi tiết profile (route đã sẵn có, KHÔNG route mới)');
  assert.ok(!fnBody.includes('/activate'), 'openPreview KHÔNG được gọi route activate');
  assert.ok(!fnBody.includes("method: 'POST'"), 'openPreview KHÔNG được gửi POST nào (chỉ GET mặc định)');
  assert.ok(!fnBody.includes("method: 'PATCH'"), 'openPreview KHÔNG được gửi PATCH nào (không sửa glyph_remap/status)');
  assert.ok(!fnBody.includes("method: 'DELETE'"), 'openPreview KHÔNG được gửi DELETE nào');
});

test('openPreview(): KHÔNG gọi toggleActivate/setBusyId/load() — hoàn toàn tách biệt khỏi luồng thay đổi trạng thái profile', () => {
  const fnMatch = panelSource.match(/async function openPreview\(p: TmbProfileRow\) \{[\s\S]*?\n  \}\n/);
  const fnBody = fnMatch![0];
  assert.ok(!fnBody.includes('toggleActivate'));
  assert.ok(!fnBody.includes('setBusyId'));
  assert.ok(!fnBody.includes('await load()'), 'preview không cần refresh danh sách profile — không đổi gì ở DB để refresh');
});

// ─── C. Preview render được profile có web_asset_ref + 0 mappings ──────────

test('dbProfileToTmbMapProfile: profile CÓ web_asset_ref + mappings RỖNG (đúng use case QA "HLX - TĐNĐ1 - Test", mapped 0/11) -> vẫn trả về TmbMapProfile hợp lệ với units: [] (KHÔNG null)', () => {
  const row = makeRow();
  const result = dbProfileToTmbMapProfile(row, []);
  assert.notEqual(result, null, 'phải convert thành công dù 0 mapping — visual fidelity review không được phụ thuộc vào mapping');
  assert.deepEqual(result!.units, []);
  assert.equal(result!.configId, row.id);
  assert.equal(result!.pdfPageNumber, 1);
  assert.ok(result!.label.includes('HLX - TĐNĐ1 - Test'));
});

test('dbProfileToTmbMapProfile: web_asset_ref là storage ref (không bắt đầu "/") -> pdfUrl trỏ qua route proxy /api/stacking/tmb-assets/... (KHÔNG lộ URL Blob thẳng ra browser)', () => {
  const row = makeRow({ web_asset_ref: 'SC_1788510325994/abc123-web.pdf' });
  const result = dbProfileToTmbMapProfile(row, []);
  assert.equal(result!.pdfUrl, `/api/stacking/tmb-assets/${encodeURIComponent('SC_1788510325994/abc123-web.pdf')}`);
});

test('dbProfileToTmbMapProfile: web_asset_ref = null (chưa Optimize xong) -> trả về null — Preview button phía UI đã tự gate theo p.web_asset_ref nên trường hợp này không hiện nút, nhưng converter tự vệ độc lập', () => {
  const row = makeRow({ web_asset_ref: null });
  assert.equal(dbProfileToTmbMapProfile(row, []), null);
});

test('dbProfileToTmbMapProfile: có mappings thật -> vẫn convert đúng thành units (Preview không mất khả năng hiện marker khi profile CÓ mapping)', () => {
  const row = makeRow();
  const mappings: TmbDbUnitMapping[] = [{ unit_code: 'BM55-11', x: 100, y: 200 }, { unit_code: 'BM56-21', x: 150, y: 250 }];
  const result = dbProfileToTmbMapProfile(row, mappings);
  assert.equal(result!.units.length, 2);
  assert.deepEqual(result!.units[0], { unitCode: 'BM55-11', pdfX: 100, pdfY: 200 });
});

// ─── D. Runtime registry ACTIVE-only KHÔNG đổi ─────────────────────────────

test('useDbTmbMapProfiles: vẫn lọc CHÍNH XÁC status === "ACTIVE" — Preview KHÔNG nới lỏng điều kiện này (regression guard, đọc thẳng source)', () => {
  assert.match(registrySource, /const activeRows = \(listRes\.data as TmbDbProfileRow\[\]\)\.filter\(p => p\.status === 'ACTIVE'\);/);
});

test('openPreview() trong TmbManagerPanel.tsx KHÔNG gọi useDbTmbMapProfiles — preview đọc TRỰC TIẾP profile Admin chọn qua fetch riêng, không đi qua hook đã lọc ACTIVE', () => {
  // Chỉ audit CODE THẬT (import/gọi hàm dạng "useDbTmbMapProfiles(") — dòng
  // comment JSDoc phía trên openPreview() CỐ Ý nhắc TÊN hook đó (không có dấu
  // ngoặc mở theo sau) để giải thích ngữ cảnh, không phải lời gọi thật.
  assert.ok(!panelSource.includes('useDbTmbMapProfiles('), 'TmbManagerPanel.tsx không được GỌI hook runtime registry — 2 luồng (Admin preview vs Sale runtime) phải tách biệt hoàn toàn');
  assert.match(panelSource, /import \{ dbProfileToTmbMapProfile \} from '\.\/tmb-map-registry';/, 'CHỈ import converter thuần (dbProfileToTmbMapProfile), KHÔNG import hook useDbTmbMapProfiles');
});

// ─── E. Sale KHÔNG có quyền xem profile non-ACTIVE (server-side, không đổi) ─

test('GET /api/stacking/tmb-profiles/[id]: gate non-admin CHỈ được xem profile ACTIVE — KHÔNG bị nới lỏng bởi tính năng Preview (route này giữ NGUYÊN, task không sửa)', () => {
  assert.match(idRouteSource, /if \(!admin && profile\.status !== 'ACTIVE'\) \{/);
});

test('src/app/api/stacking/tmb-profiles/[id]/route.ts KHÔNG bị sửa trong task này (regression guard — Preview chỉ dùng route có sẵn, không đổi logic quyền)', () => {
  // Xác nhận file này KHÔNG nằm trong diff của task — kiểm tra qua git status
  // ở Final Report; test này khoá lại ĐÚNG dòng gate quyền quan trọng nhất để
  // regression tương lai (nếu ai đó lỡ sửa) bị bắt ngay ở CI.
  assert.match(idRouteSource, /Non-admin CHỈ xem được profile ACTIVE/);
});

// ─── F. TmbMap.tsx thay đổi tối thiểu, không đổi hành vi mặc định ──────────

test('TmbMap.tsx: prop zIndex mới là OPTIONAL với default = 700 (giá trị CŨ) — page.tsx (luồng Sale) không truyền prop này nên hành vi zero-regression', () => {
  assert.match(tmbMapSource, /zIndex\?: number;/);
  assert.match(tmbMapSource, /export default function TmbMap\(\{ profile, listRows, onOpenUnit, onClose, zIndex = 700 \}: Props\)/);
  assert.ok(!pageSource.includes('zIndex={'), 'page.tsx (luồng Sale) không được truyền zIndex — phải giữ nguyên default 700 như trước khi có Preview');
});

test('page.tsx: lời gọi <TmbMap> của Sale không bị chỉnh sửa field nào khác ngoài phạm vi task (profile/listRows/onOpenUnit/onClose y hệt trước)', () => {
  assert.match(pageSource, /<TmbMap\s*\n\s*profile=\{tmbProfile\}\s*\n\s*listRows=\{listRows\}\s*\n\s*onOpenUnit=\{row => setSelectedListRow\(row\)\}\s*\n\s*onClose=\{\(\) => setShowTmbMap\(false\)\}\s*\n\s*\/>/);
});

test('TmbManagerPanel preview mount TmbMap với zIndex={1000} (> 900, overlay chính panel) — đảm bảo preview nổi lên trên, không bị khuất', () => {
  // listRows đổi từ [] cứng (bản gốc) -> previewListRows (Bảng hàng SỐNG, xem
  // TMB_PREVIEW_INVENTORY_WIRING fix + tests/crm/tmb-preview-inventory-wiring.test.ts)
  // — chỉ field NÀY đổi, onOpenUnit vẫn no-op (preview vẫn đọc-only tuyệt đối).
  assert.match(panelSource, /<TmbMap\s*\n\s*profile=\{previewMapProfile\}\s*\n\s*listRows=\{previewListRows\}\s*\n\s*onOpenUnit=\{\(\) => \{\}\}\s*\n\s*onClose=\{\(\) => \{ setPreviewMapProfile\(null\); setPreviewListRows\(\[\]\); \}\}\s*\n\s*zIndex=\{1000\}/);
});
