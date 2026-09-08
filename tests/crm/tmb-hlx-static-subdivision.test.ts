import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  resolveTmbMapProfiles, resolveTmbMapProfile, isTmbAvailableForConfig,
  TMB_HLX_VBM_CONFIG_ID, TMB_HLX_VBM_PDF_URL, TMB_HLX_VBM_UNITS,
  TMB_HLX_TDND1_PROFILE_ID, TMB_HLX_TDND1_PDF_URL, TMB_HLX_TDND1_UNITS,
  TMB_MAP_CONFIG_ID, TMB_PDF_URL,
} from '../../src/app/stacking/tmb-map-data';

// HLX_STATIC_TMB — HLX chuyển 2 phân khu (TĐNĐ1, VBM1) sang serve TMB static
// (git-committed public/, giống Saigon Park) thay vì DB-managed/Blob riêng
// cho TĐNĐ1 (nguồn nghi ngờ gây "out" trên mobile, xem audit trước). Registry
// tĩnh giờ hỗ trợ NHIỀU profile CÙNG 1 project (stackingConfigId) — test này
// chứng minh đúng 8 yêu cầu bắt buộc của task (Section E).

// ─── 1/2. HLX + TĐNĐ1 / HLX + VBM1 resolve ĐÚNG asset riêng, không lẫn lộn ──

test('1. HLX + TĐNĐ1: resolveTmbMapProfiles(HLX) chứa ĐÚNG 1 profile configId=TMB_HLX_TDND1_PROFILE_ID, pdfUrl=TMB_HLX_TDND1_PDF_URL — KHÔNG lẫn asset VBM1', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  const tdnd1 = profiles.find(p => p.configId === TMB_HLX_TDND1_PROFILE_ID);
  assert.ok(tdnd1, 'phải resolve được profile TĐNĐ1 cho project HLX');
  assert.equal(tdnd1!.pdfUrl, TMB_HLX_TDND1_PDF_URL);
  assert.notEqual(tdnd1!.pdfUrl, TMB_HLX_VBM_PDF_URL, 'TĐNĐ1 KHÔNG được dùng asset VBM1');
  assert.equal(tdnd1!.stackingConfigId, TMB_HLX_VBM_CONFIG_ID);
});

test('2. HLX + VBM1: resolveTmbMapProfiles(HLX) chứa ĐÚNG 1 profile configId=TMB_HLX_VBM_CONFIG_ID, pdfUrl=TMB_HLX_VBM_PDF_URL — KHÔNG lẫn asset TĐNĐ1', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  const vbm1 = profiles.find(p => p.configId === TMB_HLX_VBM_CONFIG_ID);
  assert.ok(vbm1, 'phải resolve được profile VBM1 cho project HLX');
  assert.equal(vbm1!.pdfUrl, TMB_HLX_VBM_PDF_URL);
  assert.notEqual(vbm1!.pdfUrl, TMB_HLX_TDND1_PDF_URL, 'VBM1 KHÔNG được dùng asset TĐNĐ1');
  assert.equal(vbm1!.units, TMB_HLX_VBM_UNITS, 'CÙNG reference — không copy/duplicate/trộn dữ liệu unit');
});

test('1b/2b. HLX resolve ĐÚNG 2 profile (TĐNĐ1 + VBM1), KHÔNG thiếu KHÔNG thừa — deterministic theo stackingConfigId, không phụ thuộc thứ tự khai báo', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  assert.equal(profiles.length, 2, `HLX phải có ĐÚNG 2 profile tĩnh (TĐNĐ1+VBM1), thực tế ${profiles.length}`);
  const configIds = new Set(profiles.map(p => p.configId));
  assert.ok(configIds.has(TMB_HLX_TDND1_PROFILE_ID) && configIds.has(TMB_HLX_VBM_CONFIG_ID));
  const pdfUrls = new Set(profiles.map(p => p.pdfUrl));
  assert.equal(pdfUrls.size, 2, 'mỗi phân khu phải có pdfUrl RIÊNG — không share/trùng file');
});

// ─── 3/4. Switching giữa 2 phân khu THAY ĐỔI asset (không stale) ───────────

test('3/4. TĐNĐ1 <-> VBM1 là 2 profile object HOÀN TOÀN riêng biệt (configId/pdfUrl/units khác nhau) — chuyển đổi giữa index 0/1 trong tmbProfiles LUÔN đổi asset, không có state chung nào bị share giữa 2 phân khu', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  const [a, b] = profiles;
  assert.notEqual(a.configId, b.configId);
  assert.notEqual(a.pdfUrl, b.pdfUrl);
  assert.notEqual(a.units, b.units, 'units array reference PHẢI khác nhau (không share mảng)');
  assert.notEqual(a.label, b.label);
});

test('3b/4b. TmbMap.tsx effect tải PDF vẫn key theo profile.configId (KHÔNG đổi bởi fix này) — đảm bảo đổi profile (configId khác) LUÔN trigger load lại đúng asset mới, không giữ canvas/state cũ', () => {
  const tmbMapSource = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');
  assert.match(tmbMapSource, /\}, \[retryKey, profile\.configId\]\);/, 'effect load PDF phải vẫn phụ thuộc profile.configId để reload đúng khi đổi phân khu');
});

// ─── 5. HLX KHÔNG BAO GIỜ resolve ra The Global City ───────────────────────

test('5. HLX (TMB_HLX_VBM_CONFIG_ID) KHÔNG BAO GIỜ resolve profile nào nhắc tới "Global City" — resolveTmbMapProfiles chỉ match CHÍNH XÁC stackingConfigId, không fallback/suy đoán theo tên/vị trí', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  for (const p of profiles) {
    assert.doesNotMatch(p.label, /Global City/i, `profile "${p.label}" của HLX không được liên quan Global City`);
    assert.doesNotMatch(p.pdfUrl, /global.?city/i);
  }
});

test('5b. Registry tĩnh (TOÀN BỘ, không riêng HLX) không có profile nào tên/asset "The Global City" — dự án đó chưa từng có TMB tĩnh, không có gì để lỡ resolve nhầm sang', () => {
  const allHlx = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  const allSaigon = resolveTmbMapProfiles({ id: TMB_MAP_CONFIG_ID });
  for (const p of [...allHlx, ...allSaigon]) {
    assert.doesNotMatch(p.label, /Global City/i);
  }
});

test('5c. resolveTmbMapProfiles với 1 config.id GIẢ MẠO (không phải HLX/Saigon Park thật) -> mảng RỖNG, không fallback về profile của project khác (đặc biệt không rơi về HLX/Global City)', () => {
  const profiles = resolveTmbMapProfiles({ id: 'SC_gia_mao_khong_ton_tai' });
  assert.deepEqual(profiles, []);
});

// ─── 6. Đổi project invalidate lựa chọn TMB profile cũ ─────────────────────

test('6. page.tsx: selectedTmbProfileIdx reset về 0 khi selectedConfig?.id đổi — không giữ lại index phân khu (VD TĐNĐ1=1) của project TRƯỚC khi chuyển sang project khác rồi quay lại', () => {
  const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');
  assert.match(pageSource, /useEffect\(\(\) => \{ setSelectedTmbProfileIdx\(0\); \}, \[selectedConfig\?\.id\]\);/);
});

test('6b. tmbProfile (profile đang active) derive TỪ tmbProfiles[selectedTmbProfileIdx] — đổi project -> tmbProfiles đổi (danh sách profile mới) + idx đã reset -> tmbProfile luôn khớp ĐÚNG project hiện tại, không stale', () => {
  const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');
  assert.match(pageSource, /const tmbProfile = tmbProfiles\[selectedTmbProfileIdx\] \?\? tmbProfiles\[0\] \?\? null;/);
});

// ─── 7. Không auto-select project (regression guard cho fix hiện có) ───────

test('7. staticTmbProfiles/tmbProfiles KHÔNG tự chọn project nào — vẫn phụ thuộc HOÀN TOÀN vào selectedConfig do User chọn (không configs[0]/fallback project trong đoạn code mới thêm)', () => {
  const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');
  const staticBlockMatch = pageSource.match(/const staticTmbProfiles = useMemo\([\s\S]*?\[selectedConfig\?\.id\]\);/);
  assert.ok(staticBlockMatch);
  assert.doesNotMatch(staticBlockMatch![0], /configs\[0\]/);
  assert.doesNotMatch(staticBlockMatch![0], /configs\.find/);
  // selectedConfig vẫn khởi tạo null (fix "explicit project selection" trước
  // đó, xem stacking-explicit-project-selection.test.ts) — KHÔNG bị fix này đụng vào.
  assert.match(pageSource, /const \[selectedConfig, setSelectedConfig\] = useState<StackingConfig \| null>\(null\);/);
});

// ─── 8. Asset của phân khu CHƯA chọn không bị tải trước (architecture-level proof) ─

test('8. TmbMap chỉ nhận ĐÚNG 1 `profile` tại 1 thời điểm (prop đơn, không phải mảng) và effect chỉ fetch() ĐÚNG profile.pdfUrl CỦA PROP ĐÓ — không có vòng lặp nào fetch/prefetch pdfUrl của profile khác trong tmbProfiles', () => {
  const tmbMapSource = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');
  assert.match(tmbMapSource, /profile: TmbMapProfile;/, 'Props.profile là 1 object đơn, không phải mảng');
  const fetchCalls = [...tmbMapSource.matchAll(/fetch\(([^,)]+)/g)].map(m => m[1].trim());
  const pdfFetchCalls = fetchCalls.filter(c => c.includes('profile.pdfUrl'));
  assert.equal(pdfFetchCalls.length, 1, 'chỉ ĐÚNG 1 lời gọi fetch(profile.pdfUrl) trong toàn file — không prefetch profile khác');
  assert.ok(!/tmbProfiles\.map\([\s\S]{0,80}fetch/.test(tmbMapSource), 'không được có vòng lặp fetch qua danh sách nhiều profile');
});

test('8b. page.tsx: TmbMap chỉ mount khi showTmbMap && tmbProfile (1 profile ĐANG active) — component (và effect fetch bên trong) KHÔNG mount cho tới khi User bấm "Xem TMB", nên phân khu chưa chọn không kích hoạt fetch nào', () => {
  const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');
  assert.match(pageSource, /\{showTmbMap && tmbProfile && \(/);
});

// ─── Không invent coordinate cho TĐNĐ1 — background rendering fix tách biệt khỏi marker data ─

test('D. TMB_HLX_TDND1_UNITS = mảng RỖNG có chủ đích (không có toạ độ authoritative) — TmbMap vẫn phải render được nền PDF dù units=[] (đã verify hành vi này ở dbProfileToTmbMapProfile/tmb-map-registry.ts, KHÔNG phải hành vi mới)', () => {
  assert.deepEqual(TMB_HLX_TDND1_UNITS, []);
});

test('D2. isTmbAvailableForConfig(HLX) vẫn true dù TĐNĐ1 chưa có marker — availability chỉ cần CÓ profile (background render được), không yêu cầu units.length > 0', () => {
  assert.equal(isTmbAvailableForConfig({ id: TMB_HLX_VBM_CONFIG_ID }), true);
});

// ─── resolveTmbMapProfile (số ít, backward-compat) vẫn hoạt động đúng cho HLX ─

test('resolveTmbMapProfile (số ít) cho HLX vẫn trả về 1 profile hợp lệ (profile đầu tiên khai báo — VBM1), KHÔNG throw/null dù project giờ có 2 phân khu', () => {
  const profile = resolveTmbMapProfile({ id: TMB_HLX_VBM_CONFIG_ID });
  assert.ok(profile);
  assert.equal(profile!.stackingConfigId, TMB_HLX_VBM_CONFIG_ID);
});

// ─── Không đổi Saigon Park (unrelated project) ─────────────────────────────

test('Saigon Park (TMB_MAP_CONFIG_ID) không bị ảnh hưởng — vẫn ĐÚNG 1 profile duy nhất, pdfUrl không đổi', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_MAP_CONFIG_ID });
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].pdfUrl, TMB_PDF_URL);
});
