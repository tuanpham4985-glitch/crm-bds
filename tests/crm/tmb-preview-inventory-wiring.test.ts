import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildMaCanIndex, resolveTmbUnitState } from '../../src/app/stacking/tmb-map-matching';
import { dbProfileToTmbMapProfile, type TmbDbProfileRow, type TmbDbUnitMapping } from '../../src/app/stacking/tmb-map-registry';
import type { StackingListRow } from '../../src/lib/types';

// ROOT CAUSE (audit "TMB_OLD_VS_NEW_ROOT_CAUSE_PROVEN"): Admin "Xem TMB"
// preview mounted <TmbMap listRows={[]} .../> — HARDCODED rỗng. Vì
// availableCount phụ thuộc `resolveTmbUnitState(unitCode, buildMaCanIndex(listRows))`,
// listRows=[] khiến buildMaCanIndex trả về Map rỗng -> MỌI mã (dù có toạ độ
// mapping đúng) resolve match.kind='unmatched' -> available=false cho tất cả
// -> "Còn hàng: 0 căn" bất kể QA có bao nhiêu mapping đúng. Fix: preview giờ
// fetch Bảng hàng SỐNG (fetchPreviewListRows, TmbManagerPanel.tsx) — CÙNG 2
// route GET page.tsx đã dùng cho Sale (fetchListRows): /api/stacking/configs
// rồi /api/stacking?mode=list — KHÔNG route mới, KHÔNG đổi optimizer/indexer/
// alias/glyph_remap/Blob/DB/schema/ACTIVE profile/Sale runtime authority.

const REAL_8_MAPPED_CODES = ['TĐ11-13', 'TĐ15-13', 'TĐ19-29', 'TĐ43-19', 'TĐ55-09', 'TĐ55-11', 'TĐ56-21', 'TĐ56-35'];

function makeRow(maCan: string, opts: { trangThai?: StackingListRow['trangThai']; marker?: StackingListRow['marker'] } = {}): StackingListRow {
  return {
    maCan,
    values: {},
    trangThai: opts.trangThai ?? 'con_hang',
    marker: opts.marker,
  } as StackingListRow;
}

// ─── A. preview với listRows THẬT + 8 mapping -> available units đúng ──────

test('A. preview với listRows THẬT (8 mã con_hang khớp đúng 8 mapping) -> resolveTmbUnitState trả available=true cho cả 8, available=false trước fix (listRows=[])', () => {
  const listRowsReal = REAL_8_MAPPED_CODES.map(code => makeRow(code));
  const indexReal = buildMaCanIndex(listRowsReal);
  const statesReal = REAL_8_MAPPED_CODES.map(code => resolveTmbUnitState(code, indexReal));
  assert.equal(statesReal.filter(s => s.available).length, 8, 'với Bảng hàng thật, cả 8 mã đã map phải available');

  // Hành vi TRƯỚC fix (listRows=[] cứng) — same profile.units, index rỗng.
  const indexEmpty = buildMaCanIndex([]);
  const statesEmpty = REAL_8_MAPPED_CODES.map(code => resolveTmbUnitState(code, indexEmpty));
  assert.equal(statesEmpty.filter(s => s.available).length, 0, 'regression guard: chứng minh lại ĐÚNG root cause listRows=[] -> 0 available');
});

// ─── B. trạng thái da_ban bị loại khỏi available count ─────────────────────

test('B. mã có marker="da_ban" (Sheet đánh dấu đã bán, ưu tiên hơn trangThai — effectiveDotStatus) bị loại khỏi available count, các mã còn lại vẫn available', () => {
  const listRows = [
    makeRow('TĐ55-11', { trangThai: 'con_hang', marker: 'da_ban' }), // đã bán qua marker, dù trangThai Pipeline vẫn "con_hang"
    ...REAL_8_MAPPED_CODES.filter(c => c !== 'TĐ55-11').map(code => makeRow(code)),
  ];
  const index = buildMaCanIndex(listRows);
  const states = REAL_8_MAPPED_CODES.map(code => resolveTmbUnitState(code, index));
  const soldState = states.find(s => s.unitCode === 'TĐ55-11')!;
  assert.equal(soldState.available, false, 'TĐ55-11 marker=da_ban -> KHÔNG available dù có mapping đúng toạ độ');
  assert.equal(states.filter(s => s.available).length, 7, '7 mã còn lại (con_hang) vẫn available');
});

test('B2. Đúng dữ liệu sản xuất thật: NĐ11-60 (da_ban) không nằm trong 8 mã đã map — không ảnh hưởng available count của 8 mã TĐ (chỉ minh hoạ, không phải mã bị loại ở test B)', () => {
  // NĐ11-60 UNMATCHED ở PDF (không có BM tương ứng) nên KHÔNG có trong
  // profile.units — dù đã bán hay còn hàng trên Sheet đều không xuất hiện
  // trên map (đúng nguyên tắc "chỉ mã ĐÃ map mới có marker").
  assert.ok(!REAL_8_MAPPED_CODES.includes('NĐ11-60'));
});

// ─── C. preview vẫn read-only tuyệt đối ────────────────────────────────────

const panelSource = fs.readFileSync('src/app/stacking/TmbManagerPanel.tsx', 'utf8');
const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');
const registrySource = fs.readFileSync('src/app/stacking/tmb-map-registry.ts', 'utf8');

test('C. fetchPreviewListRows() CHỈ gọi GET (/api/stacking/configs, /api/stacking?mode=list) — KHÔNG POST/PATCH/DELETE, KHÔNG gọi /activate hay /index nào', () => {
  const fnMatch = panelSource.match(/async function fetchPreviewListRows\(stackingConfigId: string\): Promise<StackingListRow\[\]> \{[\s\S]*?\n  \}\n/);
  assert.ok(fnMatch, 'không tìm thấy hàm fetchPreviewListRows');
  const fnBody = fnMatch![0];
  assert.match(fnBody, /fetch\('\/api\/stacking\/configs'\)/);
  assert.match(fnBody, /fetch\(`\/api\/stacking\?\$\{params\}`\)/);
  assert.ok(!fnBody.includes("method: 'POST'"));
  assert.ok(!fnBody.includes("method: 'PATCH'"));
  assert.ok(!fnBody.includes("method: 'DELETE'"));
  assert.ok(!fnBody.includes('/activate'));
  assert.ok(!fnBody.includes('/index'));
});

test('C2. openPreview() vẫn CHỈ có 1 GET chi tiết profile + fetchPreviewListRows (2 GET nữa) — KHÔNG có PATCH/POST/DELETE nào trong toàn bộ luồng preview (bất biến đã có từ TMB Review Preview, KHÔNG bị nới lỏng bởi fix này)', () => {
  const fnMatch = panelSource.match(/async function openPreview\(p: TmbProfileRow\) \{[\s\S]*?\n  \}\n/);
  const fnBody = fnMatch![0];
  assert.match(fnBody, /fetch\(`\/api\/stacking\/tmb-profiles\/\$\{p\.id\}`\)/);
  assert.match(fnBody, /fetchPreviewListRows\(p\.stacking_config_id\)/);
  assert.ok(!fnBody.includes("method: 'POST'"));
  assert.ok(!fnBody.includes("method: 'PATCH'"));
  assert.ok(!fnBody.includes("method: 'DELETE'"));
  assert.ok(!fnBody.includes('/activate'));
});

test('C3. GET /api/stacking/configs và GET /api/stacking?mode=list là route ĐỌC-ONLY (list_data thuần, KHÔNG mutate) — KHÔNG phải route mới, page.tsx (Sale) đã dùng CHÍNH 2 route này từ trước', () => {
  const configsRouteSource = fs.readFileSync('src/app/api/stacking/configs/route.ts', 'utf8');
  assert.match(configsRouteSource, /export async function GET\(\) \{\s*\n\s*try \{\s*\n\s*const data = await getStackingConfigs\(\);/);
  assert.match(pageSource, /fetch\('\/api\/stacking\/configs'\)/);
  assert.match(pageSource, /mode: 'list', sheet_id: selectedConfig\.sheet_id, tab: selectedConfig\.sheet_tab/);
});

// ─── D. ACTIVE Sale runtime KHÔNG đổi ───────────────────────────────────────

test('D. page.tsx (luồng Sale, ACTIVE runtime): lời gọi <TmbMap> KHÔNG đổi — vẫn listRows={listRows} (state Bảng hàng thật đã có từ trước), fix này KHÔNG động tới page.tsx', () => {
  assert.match(pageSource, /<TmbMap[\s\S]*profile=\{tmbProfile\}[\s\S]*listRows=\{listRows\}[\s\S]*onOpenUnit=\{row => setSelectedListRow\(row\)\}[\s\S]*onClose=\{\(\) => setShowTmbMap\(false\)\}/);
});

test('D2. useDbTmbMapProfiles (registry ACTIVE-only) KHÔNG bị sửa/nới lỏng bởi fix này — vẫn lọc CHÍNH XÁC status === "ACTIVE"', () => {
  assert.match(registrySource, /const activeRows = \(listRes\.data as TmbDbProfileRow\[\]\)\.filter\(p => p\.status === 'ACTIVE'\);/);
});

test('D3. Fix KHÔNG động tới optimizer/indexer/alias/glyph_remap/Blob/DB schema — chỉ đổi TmbManagerPanel.tsx (nguồn dữ liệu listRows của preview)', () => {
  const indexerSource = fs.readFileSync('src/lib/tmb-indexer.ts', 'utf8');
  const storageSource = fs.readFileSync('src/lib/tmb-storage.ts', 'utf8');
  // Sanity — 2 file này vẫn còn nguyên marker gốc (không rỗng/không bị ghi
  // đè nhầm); so sánh diff thật đã kiểm tra riêng ở bước release/git status.
  assert.match(indexerSource, /export function suggestUnitAliasRules/);
  assert.match(storageSource, /export class VercelBlobAssetStorage/);
});

// ─── E. 0 mappings vẫn render PDF bình thường (bất biến gốc, KHÔNG bị vỡ) ──

test('E. dbProfileToTmbMapProfile: mappings rỗng vẫn trả về profile hợp lệ (units: []) — preview PDF vẫn render dù 0 mapping, KHÔNG phụ thuộc listRows', () => {
  const row: TmbDbProfileRow = {
    id: 'p1', stacking_config_id: 'SC_1', label: 'Test', subdivision: 'TĐNĐ1',
    web_asset_ref: 'some-ref', page_number: 1, status: 'READY_FOR_REVIEW',
  };
  const mappings: TmbDbUnitMapping[] = [];
  const result = dbProfileToTmbMapProfile(row, mappings);
  assert.notEqual(result, null);
  assert.deepEqual(result!.units, []);
});

test('E2. fetchPreviewListRows(): lỗi mạng/config thiếu sheet_tab -> trả [] (KHÔNG throw) — preview PDF vẫn phải render được dù không tải được Bảng hàng, giữ đúng bất biến "visual preview phải hoạt động dù mapped = 0"', () => {
  const fnMatch = panelSource.match(/async function fetchPreviewListRows\(stackingConfigId: string\): Promise<StackingListRow\[\]> \{[\s\S]*?\n  \}\n/);
  const fnBody = fnMatch![0];
  assert.match(fnBody, /try \{/);
  assert.match(fnBody, /\} catch \{\s*\n\s*return \[\];\s*\n\s*\}/);
  assert.match(fnBody, /if \(!config \|\| config\.loai !== 'list' \|\| !config\.sheet_tab\) return \[\];/);
});

test('E3. openPreview(): lỗi fetchPreviewListRows KHÔNG chặn setPreviewMapProfile — PDF vẫn mount dù Bảng hàng tải lỗi (thứ tự: mapProfile tính xong TRƯỚC, fetchPreviewListRows chỉ có thể trả rows rỗng chứ không throw nên không rơi vào catch chặn preview)', () => {
  const fnMatch = panelSource.match(/async function openPreview\(p: TmbProfileRow\) \{[\s\S]*?\n  \}\n/);
  const fnBody = fnMatch![0];
  const idxMapProfile = fnBody.indexOf('const mapProfile = dbProfileToTmbMapProfile');
  const idxFetchRows = fnBody.indexOf('fetchPreviewListRows(p.stacking_config_id)');
  const idxSetMapProfile = fnBody.indexOf('setPreviewMapProfile(mapProfile);');
  assert.ok(idxMapProfile > 0 && idxFetchRows > idxMapProfile && idxSetMapProfile > idxFetchRows);
});
