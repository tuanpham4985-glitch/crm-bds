import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  resolveTmbMapProfiles, resolveTmbMapProfile, isTmbAvailableForConfig,
  TMB_HLX_VBM_CONFIG_ID, TMB_HLX_VBM_STATIC_IMAGE_URL, TMB_HLX_VBM_NATIVE_SIZE, TMB_HLX_VBM_UNITS,
  TMB_HLX_TDND1_PROFILE_ID, TMB_HLX_TDND1_STATIC_IMAGE_URL, TMB_HLX_TDND1_NATIVE_SIZE, TMB_HLX_TDND1_UNITS,
  TMB_MAP_CONFIG_ID, TMB_PDF_URL,
} from '../../src/app/stacking/tmb-map-data';

// HLX_STATIC_TMB — HLX chuyển 2 phân khu (TĐNĐ1, VBM1) sang serve TMB static
// (git-committed public/, giống Saigon Park) thay vì DB-managed/Blob riêng
// cho TĐNĐ1 (nguồn nghi ngờ gây "out" trên mobile, xem audit trước). Registry
// tĩnh giờ hỗ trợ NHIỀU profile CÙNG 1 project (stackingConfigId) — test này
// chứng minh đúng 8 yêu cầu bắt buộc của task (Section E).
//
// CẢ 2 phân khu HLX (TĐNĐ1, VBM1) đều đã chuyển sang static-image
// architecture — page.render() không hoàn tất được cho CẢ 2 file PDF qua
// pdf.js client-side (đã audit + xác nhận crash thật trên production iPhone
// cho cả 2), thay bằng ảnh WebP rasterize offline, xem tmb-map-data.ts.
// Saigon Park (project khác) KHÔNG đổi, vẫn pdf.js client-side như cũ.

// ─── 1/2. HLX + TĐNĐ1 / HLX + VBM1 resolve ĐÚNG asset riêng, không lẫn lộn ──

test('1. HLX + TĐNĐ1: resolveTmbMapProfiles(HLX) chứa ĐÚNG 1 profile configId=TMB_HLX_TDND1_PROFILE_ID, staticBackgroundImageUrl=TMB_HLX_TDND1_STATIC_IMAGE_URL — KHÔNG lẫn asset VBM1, KHÔNG còn dùng pdfUrl (đường pdf.js client-side)', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  const tdnd1 = profiles.find(p => p.configId === TMB_HLX_TDND1_PROFILE_ID);
  assert.ok(tdnd1, 'phải resolve được profile TĐNĐ1 cho project HLX');
  assert.equal(tdnd1!.staticBackgroundImageUrl, TMB_HLX_TDND1_STATIC_IMAGE_URL);
  assert.deepEqual(tdnd1!.nativeSize, TMB_HLX_TDND1_NATIVE_SIZE);
  assert.equal(tdnd1!.pdfUrl, undefined, 'TĐNĐ1 KHÔNG còn pdfUrl — đã chuyển sang static-image architecture, TmbMap.tsx không chạm pdf.js cho profile này');
  assert.notEqual(tdnd1!.staticBackgroundImageUrl, TMB_HLX_VBM_STATIC_IMAGE_URL, 'TĐNĐ1 KHÔNG được dùng asset VBM1');
  assert.equal(tdnd1!.stackingConfigId, TMB_HLX_VBM_CONFIG_ID);
});

test('2. HLX + VBM1: resolveTmbMapProfiles(HLX) chứa ĐÚNG 1 profile configId=TMB_HLX_VBM_CONFIG_ID, staticBackgroundImageUrl=TMB_HLX_VBM_STATIC_IMAGE_URL — KHÔNG lẫn asset TĐNĐ1, KHÔNG còn dùng pdfUrl (đường pdf.js client-side cũng gây crash thật trên production iPhone, đã đổi sang static-image cùng kiến trúc TĐNĐ1)', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  const vbm1 = profiles.find(p => p.configId === TMB_HLX_VBM_CONFIG_ID);
  assert.ok(vbm1, 'phải resolve được profile VBM1 cho project HLX');
  assert.equal(vbm1!.staticBackgroundImageUrl, TMB_HLX_VBM_STATIC_IMAGE_URL);
  assert.deepEqual(vbm1!.nativeSize, TMB_HLX_VBM_NATIVE_SIZE);
  assert.equal(vbm1!.pdfUrl, undefined, 'VBM1 KHÔNG còn pdfUrl — đã chuyển sang static-image architecture, TmbMap.tsx không chạm pdf.js cho profile này');
  assert.notEqual(vbm1!.staticBackgroundImageUrl, TMB_HLX_TDND1_STATIC_IMAGE_URL, 'VBM1 KHÔNG được dùng asset TĐNĐ1');
  assert.equal(vbm1!.units, TMB_HLX_VBM_UNITS, 'CÙNG reference — không copy/duplicate/trộn dữ liệu unit');
});

test('1b/2b. HLX resolve ĐÚNG 2 profile (TĐNĐ1 + VBM1), KHÔNG thiếu KHÔNG thừa — deterministic theo stackingConfigId, không phụ thuộc thứ tự khai báo', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  assert.equal(profiles.length, 2, `HLX phải có ĐÚNG 2 profile tĩnh (TĐNĐ1+VBM1), thực tế ${profiles.length}`);
  const configIds = new Set(profiles.map(p => p.configId));
  assert.ok(configIds.has(TMB_HLX_TDND1_PROFILE_ID) && configIds.has(TMB_HLX_VBM_CONFIG_ID));
  // Mỗi phân khu phải có ĐÚNG 1 asset riêng (pdfUrl HOẶC staticBackgroundImageUrl
  // tuỳ kiến trúc), không share/trùng file giữa 2 phân khu — gộp cả 2 loại
  // asset field vì TĐNĐ1/VBM1 giờ dùng 2 kiến trúc khác nhau.
  const assetUrls = new Set(profiles.map(p => p.pdfUrl ?? p.staticBackgroundImageUrl));
  assert.equal(assetUrls.size, 2, 'mỗi phân khu phải có asset RIÊNG — không share/trùng file');
  assert.ok(!assetUrls.has(undefined), 'mỗi profile phải có ĐÚNG 1 trong 2 loại asset — không được thiếu cả hai');
});

// ─── 3/4. Switching giữa 2 phân khu THAY ĐỔI asset (không stale) ───────────

test('3/4. TĐNĐ1 <-> VBM1 là 2 profile object HOÀN TOÀN riêng biệt (configId/asset/units khác nhau) — chuyển đổi giữa index 0/1 trong tmbProfiles LUÔN đổi asset, không có state chung nào bị share giữa 2 phân khu', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  const [a, b] = profiles;
  assert.notEqual(a.configId, b.configId);
  assert.notEqual(a.pdfUrl ?? a.staticBackgroundImageUrl, b.pdfUrl ?? b.staticBackgroundImageUrl);
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
    const assetUrl = p.pdfUrl ?? p.staticBackgroundImageUrl ?? '';
    assert.doesNotMatch(assetUrl, /global.?city/i);
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

test('8. TmbMap chỉ nhận ĐÚNG 1 `profile` tại 1 thời điểm (prop đơn, không phải mảng) và effect chỉ fetch() ĐÚNG pdfUrl CỦA PROP ĐÓ (narrow từ profile.pdfUrl) — không có vòng lặp nào fetch/prefetch pdfUrl của profile khác trong tmbProfiles', () => {
  const tmbMapSource = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');
  assert.match(tmbMapSource, /profile: TmbMapProfile;/, 'Props.profile là 1 object đơn, không phải mảng');
  assert.match(tmbMapSource, /const pdfUrl = profile\.pdfUrl;/, 'biến pdfUrl phải narrow trực tiếp từ profile.pdfUrl (không phải hard-code/nguồn khác)');
  const fetchCalls = [...tmbMapSource.matchAll(/fetch\(([^,)]+)/g)].map(m => m[1].trim());
  const pdfFetchCalls = fetchCalls.filter(c => c === 'pdfUrl');
  assert.equal(pdfFetchCalls.length, 1, 'chỉ ĐÚNG 1 lời gọi fetch(pdfUrl) trong toàn file — không prefetch profile khác');
  assert.ok(!/tmbProfiles\.map\([\s\S]{0,80}fetch/.test(tmbMapSource), 'không được có vòng lặp fetch qua danh sách nhiều profile');
});

// ─── TĐNĐ1 + VBM1 production display path KHÔNG còn chạm pdf.js client-side ─

test('9. profile.staticBackgroundImageUrl khi set -> effect return SỚM, TRƯỚC khi chạm bất kỳ pdf.js API nào (import pdfjs-dist/getDocument/getPage/render) — áp dụng CHUNG cho CẢ TĐNĐ1 lẫn VBM1 (cùng 1 nhánh generic trong TmbMap.tsx, không phải 2 đường render riêng)', () => {
  const tmbMapSource = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');
  const staticBranchIdx = tmbMapSource.indexOf('if (profile.staticBackgroundImageUrl && profile.nativeSize)');
  const pdfjsImportIdx = tmbMapSource.indexOf("await import('pdfjs-dist/legacy/build/pdf.mjs')");
  const pdfPathMarkerIdx = tmbMapSource.indexOf('// ── pdf.js PATH');
  assert.ok(staticBranchIdx !== -1, 'phải có nhánh kiểm tra profile.staticBackgroundImageUrl');
  assert.ok(pdfjsImportIdx !== -1, 'phải còn đường import pdfjs-dist cho profile PDF-based (VBM1/Saigon Park)');
  assert.ok(pdfPathMarkerIdx !== -1, 'phải có ranh giới rõ ràng đánh dấu bắt đầu đường pdf.js');
  assert.ok(staticBranchIdx < pdfPathMarkerIdx, 'nhánh static-image PHẢI nằm TRƯỚC ranh giới đường pdf.js — return sớm, không rơi xuống đường pdf.js');
  assert.ok(pdfPathMarkerIdx < pdfjsImportIdx, 'import pdfjs-dist phải nằm SAU ranh giới đường pdf.js (không nằm trong nhánh static-image)');
  // Trong chính nhánh static-image (từ staticBranchIdx tới ranh giới pdf.js
  // path), không được gọi bất kỳ pdf.js API nào.
  const staticBranchBody = tmbMapSource.slice(staticBranchIdx, pdfPathMarkerIdx);
  for (const forbidden of ['getDocument', 'getPage', 'page.render(', 'pdfjs-dist', 'getOperatorList']) {
    assert.ok(!staticBranchBody.includes(forbidden), `nhánh static-image không được nhắc tới "${forbidden}"`);
  }
});

test('10. TĐNĐ1 + VBM1 profile (registry tĩnh) đều thực sự dùng đường static-image — profile-level proof (bổ sung cho test 9 ở mức source code)', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  const tdnd1 = profiles.find(p => p.configId === TMB_HLX_TDND1_PROFILE_ID);
  const vbm1 = profiles.find(p => p.configId === TMB_HLX_VBM_CONFIG_ID);
  assert.ok(tdnd1?.staticBackgroundImageUrl, 'TĐNĐ1 phải có staticBackgroundImageUrl set — đây là điều kiện effect dùng để rẽ nhánh static-image, bỏ qua pdf.js');
  assert.ok(tdnd1?.nativeSize, 'TĐNĐ1 phải có nativeSize set — bắt buộc đi kèm staticBackgroundImageUrl để nhánh static-image kích hoạt (điều kiện && trong TmbMap.tsx)');
  assert.ok(vbm1?.staticBackgroundImageUrl, 'VBM1 phải có staticBackgroundImageUrl set — đây là điều kiện effect dùng để rẽ nhánh static-image, bỏ qua pdf.js');
  assert.ok(vbm1?.nativeSize, 'VBM1 phải có nativeSize set — bắt buộc đi kèm staticBackgroundImageUrl để nhánh static-image kích hoạt (điều kiện && trong TmbMap.tsx)');
});

test('11. KHÔNG còn profile HLX nào dùng pdfUrl (đường pdf.js client-side) — cả TĐNĐ1 lẫn VBM1 đều đã chuyển sang static-image, không còn 2 kiến trúc render cạnh tranh nhau cho HLX', () => {
  const profiles = resolveTmbMapProfiles({ id: TMB_HLX_VBM_CONFIG_ID });
  for (const p of profiles) {
    assert.equal(p.pdfUrl, undefined, `profile "${p.label}" (HLX) không được còn pdfUrl`);
    assert.equal(p.pdfPageNumber, undefined, `profile "${p.label}" (HLX) không được còn pdfPageNumber`);
  }
});

test('8b. page.tsx: TmbMap chỉ mount khi showTmbMap && tmbProfile (1 profile ĐANG active) — component (và effect fetch bên trong) KHÔNG mount cho tới khi User bấm "Xem TMB", nên phân khu chưa chọn không kích hoạt fetch nào', () => {
  const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');
  assert.match(pageSource, /\{showTmbMap && tmbProfile && \(/);
});

// ─── Không invent coordinate cho TĐNĐ1 — background rendering fix tách biệt khỏi marker data ─

test('D. TMB_HLX_TDND1_UNITS = mảng RỖNG có chủ đích (không có toạ độ authoritative) — TmbMap vẫn phải render được nền (nay là ảnh tĩnh, trước đây là PDF) dù units=[] (đã verify hành vi này ở dbProfileToTmbMapProfile/tmb-map-registry.ts, KHÔNG phải hành vi mới)', () => {
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

// ─── Asset TĐNĐ1 tồn tại thật trên đĩa, đúng path production sẽ serve ──────

test('TMB_HLX_TDND1_STATIC_IMAGE_URL: file tồn tại thật trong public/ (đúng path Next.js serve static, KHÔNG qua route proxy) — asset production sẽ tải được', () => {
  const diskPath = 'public' + TMB_HLX_TDND1_STATIC_IMAGE_URL; // '/tmb-poc/tmb-hlx-tdnd1.webp' -> 'public/tmb-poc/tmb-hlx-tdnd1.webp'
  assert.ok(fs.existsSync(diskPath), `asset không tồn tại trên đĩa: ${diskPath}`);
  const stat = fs.statSync(diskPath);
  assert.ok(stat.isFile(), `${diskPath} phải là file, không phải thư mục`);
  // Sanity: không rỗng, không "vô lý to" (đã chọn scale=2/q=0.72 ~1.5MB —
  // khoá lỏng dưới 8MB để bắt regression nếu ai đó vô tình rasterize lại ở
  // scale/quality cao hơn nhiều mà không cân nhắc, không khoá cứng đúng byte).
  assert.ok(stat.size > 10_000, `asset quá nhỏ (${stat.size} bytes) — nghi ngờ file hỏng/rỗng`);
  assert.ok(stat.size < 8 * 1024 * 1024, `asset ${(stat.size / 1024 / 1024).toFixed(2)}MB — lớn bất thường so với mục tiêu "không tạo raster khổng lồ"`);
});

test('TMB_HLX_TDND1_STATIC_IMAGE_URL: đúng định dạng ảnh (WebP magic bytes "RIFF"...."WEBP")', () => {
  const diskPath = 'public' + TMB_HLX_TDND1_STATIC_IMAGE_URL;
  const buf = fs.readFileSync(diskPath);
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP');
});

test('TMB_HLX_TDND1_NATIVE_SIZE giữ ĐÚNG kích thước trang PDF gốc (1600×1200, đã audit rotation=0/mediabox [0,0,1600,1200] trước khi rasterize) — content-space marker KHÔNG đổi dù ảnh raster ở scale/pixel khác', () => {
  assert.deepEqual(TMB_HLX_TDND1_NATIVE_SIZE, { w: 1600, h: 1200 });
});

// ─── Asset VBM1 tồn tại thật trên đĩa, đúng path production sẽ serve ───────

test('TMB_HLX_VBM_STATIC_IMAGE_URL: file tồn tại thật trong public/ (đúng path Next.js serve static, KHÔNG qua route proxy) — asset production sẽ tải được', () => {
  const diskPath = 'public' + TMB_HLX_VBM_STATIC_IMAGE_URL; // '/tmb-poc/tmb-hlx-vbm1.webp' -> 'public/tmb-poc/tmb-hlx-vbm1.webp'
  assert.ok(fs.existsSync(diskPath), `asset không tồn tại trên đĩa: ${diskPath}`);
  const stat = fs.statSync(diskPath);
  assert.ok(stat.isFile(), `${diskPath} phải là file, không phải thư mục`);
  assert.ok(stat.size > 10_000, `asset quá nhỏ (${stat.size} bytes) — nghi ngờ file hỏng/rỗng`);
  assert.ok(stat.size < 8 * 1024 * 1024, `asset ${(stat.size / 1024 / 1024).toFixed(2)}MB — lớn bất thường so với mục tiêu "không tạo raster khổng lồ"`);
});

test('TMB_HLX_VBM_STATIC_IMAGE_URL: đúng định dạng ảnh (WebP magic bytes "RIFF"...."WEBP")', () => {
  const diskPath = 'public' + TMB_HLX_VBM_STATIC_IMAGE_URL;
  const buf = fs.readFileSync(diskPath);
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP');
});

test('TMB_HLX_VBM_NATIVE_SIZE giữ ĐÚNG kích thước trang PDF gốc (1600×1200, cùng khổ trang đã verify cho TĐNĐ1 — cả 2 PDF HLX cùng template) — content-space marker (5 mã VBM1 hiện có) KHÔNG đổi dù ảnh raster ở scale/pixel khác', () => {
  assert.deepEqual(TMB_HLX_VBM_NATIVE_SIZE, { w: 1600, h: 1200 });
});
