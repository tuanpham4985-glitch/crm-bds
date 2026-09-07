import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// ROOT CAUSE (audit "TMB_RUNTIME_ASSET_ROOT_CAUSE_PROVEN", xem Final Report
// trước): useDbTmbMapProfiles(stackingConfigId) chỉ load lại profile ACTIVE
// khi `stackingConfigId` đổi. TmbManagerPanel (nơi "Kích hoạt"/"Ngừng dùng"
// sống) là component RIÊNG, mount/unmount như overlay — activate/deactivate
// bên trong nó KHÔNG khiến stackingConfigId đổi, nên nếu trang /stacking đã
// mở SẴN trước khi Admin activate 1 profile khác, TmbMap vẫn render profile
// ACTIVE CŨ (đã đọc từ trước) cho tới khi reload trang thủ công.
//
// FIX: useDbTmbMapProfiles giờ trả về { profiles, refresh } — refresh() bump
// 1 refreshToken khiến CHÍNH effect load hiện có chạy lại (KHÔNG viết logic
// fetch/convert lần 2). page.tsx truyền refresh xuống TmbManagerPanel qua
// prop `onProfilesChanged`; toggleActivate() (activate VÀ deactivate dùng
// CHUNG 1 hàm) gọi nó CHỈ khi request thành công.

const registrySource = fs.readFileSync('src/app/stacking/tmb-map-registry.ts', 'utf8');
const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');
const panelSource = fs.readFileSync('src/app/stacking/TmbManagerPanel.tsx', 'utf8');

function extractFn(source: string, pattern: RegExp, label: string): string {
  const m = source.match(pattern);
  assert.ok(m, `không tìm thấy: ${label}`);
  return m![0];
}

// ─── A. hook exposes explicit refresh capability using the same loader ────

test('A1. useDbTmbMapProfiles trả về { profiles, refresh } (không còn trả thẳng mảng) — refresh là function tường minh', () => {
  assert.match(registrySource, /export function useDbTmbMapProfiles\(stackingConfigId: string \| undefined \| null\): UseDbTmbMapProfilesResult \{/);
  assert.match(registrySource, /return \{ profiles, refresh \};/);
});

test('A2. refresh() bump refreshToken (useCallback, deps rỗng -> reference ỔN ĐỊNH giữa các lần render) — KHÔNG tạo hàm mới mỗi render', () => {
  assert.match(registrySource, /const \[refreshToken, setRefreshToken\] = useState\(0\);/);
  assert.match(registrySource, /const refresh = useCallback\(\(\) => setRefreshToken\(t => t \+ 1\), \[\]\);/);
});

test('A3. refresh() CHẠY LẠI đúng effect load hiện có (refreshToken nằm trong dependency array của effect fetch) — KHÔNG duplicate logic fetch/convert: chỉ 1 lời gọi dbProfileToTmbMapProfile(detailRes...) trong toàn file', () => {
  assert.match(registrySource, /\}, \[stackingConfigId, refreshToken\]\);/);
  const calls = [...registrySource.matchAll(/dbProfileToTmbMapProfile\(detailRes\.data\.profile/g)];
  assert.equal(calls.length, 1, 'chỉ được có ĐÚNG 1 chỗ gọi dbProfileToTmbMapProfile trong luồng load — không viết loader thứ 2');
});

test('A4. Hành vi load ban đầu KHÔNG đổi: vẫn fetch list -> lọc status===ACTIVE -> fetch detail từng row -> convert -> setProfiles, y hệt logic cũ, chỉ thêm refreshToken vào dependency', () => {
  assert.match(registrySource, /const listRes = await fetch\(`\/api\/stacking\/tmb-profiles\?stacking_config_id=\$\{encodeURIComponent\(stackingConfigId\)\}`\)\.then\(r => r\.json\(\)\);/);
  assert.match(registrySource, /const activeRows = \(listRes\.data as TmbDbProfileRow\[\]\)\.filter\(p => p\.status === 'ACTIVE'\);/);
  assert.match(registrySource, /if \(!stackingConfigId\) \{ setProfiles\(\[\]\); return; \}/);
});

// ─── B. page wires refresh callback into TmbManagerPanel ───────────────────

test('B1. page.tsx destructure { profiles: dbTmbProfiles, refresh: refreshDbTmbProfiles } từ useDbTmbMapProfiles(...)', () => {
  assert.match(pageSource, /const \{ profiles: dbTmbProfiles, refresh: refreshDbTmbProfiles \} = useDbTmbMapProfiles\(selectedConfig\?\.id\);/);
});

test('B2. <TmbManagerPanel> nhận onProfilesChanged={refreshDbTmbProfiles}', () => {
  const mount = extractFn(pageSource, /\{showTmbManager && isAdmin && selectedConfig && \(\s*\n\s*<TmbManagerPanel[\s\S]*?\/>\s*\n\s*\)\}/, 'TmbManagerPanel mount trong page.tsx');
  assert.match(mount, /onProfilesChanged=\{refreshDbTmbProfiles\}/);
  assert.match(mount, /stackingConfigId=\{selectedConfig\.id\}/);
  assert.match(mount, /onClose=\{\(\) => setShowTmbManager\(false\)\}/);
});

test('B3. TmbManagerPanel khai báo onProfilesChanged là prop TUỲ CHỌN (?: () => void) — không bắt buộc caller khác phải truyền', () => {
  assert.match(panelSource, /onProfilesChanged\?: \(\) => void;/);
});

// ─── C/D. successful activation/deactivation invoke parent profile refresh ─

const toggleActivateBody = extractFn(panelSource, /async function toggleActivate\(profile: TmbProfileRow\) \{[\s\S]*?\n  \}\n/, 'toggleActivate()');

test('C/D. toggleActivate() dùng CHUNG 1 hàm cho CẢ activate lẫn deactivate (action = profile.status === "ACTIVE" ? "deactivate" : "activate") — onProfilesChanged?.() nằm ở nhánh d.success (áp dụng cho CẢ 2 action, không tách riêng)', () => {
  assert.match(toggleActivateBody, /const action = profile\.status === 'ACTIVE' \? 'deactivate' : 'activate';/);
  assert.match(toggleActivateBody, /onProfilesChanged\?\.\(\);/);
});

test('C2/D2. onProfilesChanged?.() nằm SAU dòng gọi POST /activate và SAU khi đã parse d = await r.json() — chỉ gọi khi request activate/deactivate ĐÃ hoàn tất, không gọi sớm/lạc quan', () => {
  const idxFetch = toggleActivateBody.indexOf("fetch(`/api/stacking/tmb-profiles/${profile.id}/activate`");
  const idxJson = toggleActivateBody.indexOf('const d = await r.json();');
  const idxCallback = toggleActivateBody.indexOf('onProfilesChanged?.();');
  assert.ok(idxFetch > 0 && idxJson > idxFetch && idxCallback > idxJson);
});

// ─── E. failed activation/deactivation does NOT signal refresh ────────────

test('E. onProfilesChanged?.() CHỈ nằm trong nhánh else (d.success === true) — nhánh if (!d.success) chỉ setActionMsg lỗi, KHÔNG gọi onProfilesChanged', () => {
  assert.match(toggleActivateBody, /if \(!d\.success\) \{\s*\n\s*setActionMsg\(m => \(\{ \.\.\.m, \[profile\.id\]: `Lỗi: \$\{d\.error\}` \}\)\);\s*\n\s*\} else \{\s*\n(?:[\s\S]*?)onProfilesChanged\?\.\(\);\s*\n\s*\}/);
  // Đảm bảo KHÔNG có đường dẫn nào khác gọi onProfilesChanged bên ngoài khối else này.
  const occurrences = [...toggleActivateBody.matchAll(/onProfilesChanged\?\.\(\);/g)];
  assert.equal(occurrences.length, 1, 'onProfilesChanged chỉ được gọi ĐÚNG 1 lần trong toggleActivate(), ở nhánh success');
});

// ─── F. no reload/polling/cache-busting workaround ─────────────────────────

test('F1. Không dùng window.location.reload/href, không setInterval/polling, không cache-busting URL (?t=/Date.now() gắn vào pdfUrl) ở BẤT KỲ file nào trong 3 file sửa', () => {
  for (const [name, src] of [['tmb-map-registry.ts', registrySource], ['page.tsx (đoạn TmbManagerPanel mount)', pageSource], ['TmbManagerPanel.tsx (toggleActivate)', toggleActivateBody]] as const) {
    assert.ok(!src.includes('window.location.reload'), `${name} không được dùng window.location.reload`);
    assert.ok(!src.includes('window.location.href ='), `${name} không được gán window.location.href`);
    assert.ok(!src.includes('setInterval('), `${name} không được dùng setInterval (polling)`);
  }
  assert.ok(!registrySource.includes('setInterval('));
  assert.ok(!registrySource.includes('Date.now()'));
});

test('F2. refresh() giải quyết bằng STATE INVALIDATION (bump refreshToken -> chạy lại effect fetch JSON list/detail) — KHÔNG phải cache-busting URL PDF (pdfUrl/resolveWebAssetUrl không đổi, không thêm query param nào)', () => {
  assert.match(registrySource, /function resolveWebAssetUrl\(ref: string\): string \{\s*\n(?:[\s\S]*?)\n\s*return ref\.startsWith\('\/'\) \? ref : `\/api\/stacking\/tmb-assets\/\$\{encodeURIComponent\(ref\)\}`;\s*\n\s*\}/);
  assert.ok(!registrySource.includes('pdfUrl}?'));
});

test('F3. Không có timer/setTimeout mới nào được thêm vào toggleActivate() hay vào useDbTmbMapProfiles() cho mục đích refresh (refresh là bump state đồng bộ, không debounce/delay)', () => {
  assert.ok(!toggleActivateBody.includes('setTimeout('));
  const refreshFnRegion = extractFn(registrySource, /export function useDbTmbMapProfiles\([\s\S]*?\n\}\n/, 'useDbTmbMapProfiles()');
  assert.ok(!refreshFnRegion.includes('setTimeout('));
});

// ─── G. existing ACTIVE-only filtering unchanged ───────────────────────────

test('G. Filter ACTIVE-only trong useDbTmbMapProfiles KHÔNG đổi — vẫn ĐÚNG string "status === \'ACTIVE\'"', () => {
  assert.match(registrySource, /\(listRes\.data as TmbDbProfileRow\[\]\)\.filter\(p => p\.status === 'ACTIVE'\)/);
});

// ─── H. unrelated Sale TMB behavior unchanged ──────────────────────────────

test('H1. page.tsx: lời gọi <TmbMap> của Sale KHÔNG đổi field nào (profile/listRows/onOpenUnit/onClose) — fix này KHÔNG động tới props Sale nhận', () => {
  assert.match(pageSource, /<TmbMap[\s\S]*profile=\{tmbProfile\}[\s\S]*listRows=\{listRows\}[\s\S]*onOpenUnit=\{row => setSelectedListRow\(row\)\}[\s\S]*onClose=\{\(\) => setShowTmbMap\(false\)\}/);
});

test('H2. dbProfileToTmbMapProfile() KHÔNG đổi chữ ký/logic — vẫn nhận (row, mappings), vẫn trả null khi thiếu web_asset_ref, vẫn dùng resolveWebAssetUrl cho pdfUrl', () => {
  assert.match(registrySource, /export function dbProfileToTmbMapProfile\(row: TmbDbProfileRow, mappings: TmbDbUnitMapping\[\]\): TmbMapProfile \| null \{/);
  assert.match(registrySource, /if \(!row\.web_asset_ref\) return null;/);
  assert.match(registrySource, /pdfUrl: resolveWebAssetUrl\(row\.web_asset_ref\),/);
});

test('H3. tmbProfiles (danh sách kết hợp static+DB) và selectedTmbProfileIdx trong page.tsx vẫn dùng dbTmbProfiles (đã destructure từ profiles) y hệt trước — không đổi cách chọn map hiển thị', () => {
  assert.match(pageSource, /const list = \[\.\.\.dbTmbProfiles\];/);
  assert.match(pageSource, /if \(staticTmbProfile && !list\.some\(p => p\.configId === staticTmbProfile\.configId\)\) list\.unshift\(staticTmbProfile\);/);
});

test('H4. requireTmbAdmin/authorization của route activate KHÔNG đổi — fix này thuần client-side (React state), không sửa bất kỳ API route nào', () => {
  const routeSource = fs.readFileSync('src/app/api/stacking/tmb-profiles/[id]/activate/route.ts', 'utf8');
  assert.match(routeSource, /const guard = await requireTmbAdmin\(\);\s*\n\s*if \(!guard\.ok\) return guard\.response;/);
  assert.match(routeSource, /const updated = await activateTmbMapProfile\(id\);/); // activation-invariant fix (commit 4dc3bad) vẫn nguyên vẹn
});
