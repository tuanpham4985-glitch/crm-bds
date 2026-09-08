import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import test from 'node:test';
import { toStackingConfig } from '../../src/lib/stacking-config-mirror';
import { isPostgresEnabled, isStackingConfigPgReadsEnabled, _resetFlagsCache } from '../../src/lib/db/feature-flags';
import { isShadowWriteEnabled, _resetShadowCache } from '../../src/lib/db/shadow-write-flags';

// STACKING_CONFIG_QUOTA_INDEPENDENCE — audit: GET /api/stacking/configs
// (dropdown chọn dự án trên /stacking) trước đây LUÔN cần 1 live Google
// Sheets read (getStackingConfigs -> GS.getStackingConfigs), nên khi Sheets
// trả 429 ("Read requests per minute per user"), /stacking không tải được cả
// danh sách nguồn ("Không tải được danh sách nguồn"). Fix (PROPOSED — migration
// Postgres StackingConfig CHƯA apply, xem Final Report): khi module 'stacking'
// bật (tái dùng CHÍNH 2 flag PG_ENABLED_MODULES/SHADOW_WRITE_MODULES đã có,
// KHÔNG tạo flag mới), GET đọc THẲNG Postgres mirror — KHÔNG đụng Sheets.
// Sheets VẪN LÀ write authority duy nhất — add/update/delete luôn ghi Sheets
// TRƯỚC, mirror chỉ đồng bộ SAU KHI Sheets write thành công.
//
// Không có DB thật/kết nối mạng production trong môi trường audit này (đã
// verify — prisma.stackingConfig.findMany() thật sự throw "Database not
// reachable") — theo ĐÚNG convention test hiện có của repo (xem
// crm-module-toggle.test.ts): (1) pure-function test cho phần map dữ liệu
// thuần (toStackingConfig, không chạm Prisma), (2) source-regex test cho
// phần wiring/branching server-side (không có Sheets/DB thật trong test
// runner). KHÔNG gọi readStackingConfigMirror/upsertStackingConfigMirror/...
// trực tiếp ở đây (sẽ throw thật vì DB không reachable).

const dataAccessSrc = fs.readFileSync('src/lib/data-access.ts', 'utf8');
const mirrorSrc = fs.readFileSync('src/lib/stacking-config-mirror.ts', 'utf8');
const featureFlagsSrc = fs.readFileSync('src/lib/db/feature-flags.ts', 'utf8');

test.afterEach(() => { _resetFlagsCache(); _resetShadowCache(); delete process.env.PG_ENABLED_MODULES; delete process.env.SHADOW_WRITE_MODULES; delete process.env.STACKING_CONFIG_PG_READS; });

// ─── Pure mapping fidelity (toStackingConfig) ──────────────────────────────

test('toStackingConfig: round-trip đầy đủ field, visible_columns array giữ nguyên', () => {
  const row = {
    id: 'SC_1788510325994', ten_hien_thi: 'Vinhomes Global Gate HLX', sheet_id: 'sheet123',
    project_code: 'HLX', trang_thai: 'active', ngay_tao: '2026-01-01T00:00:00.000Z',
    loai: 'grid', sheet_tab: null, visible_columns: ['STT', 'Mã căn', 'Giá'],
  } as never;
  const cfg = toStackingConfig(row);
  assert.deepEqual(cfg, {
    id: 'SC_1788510325994', ten_hien_thi: 'Vinhomes Global Gate HLX', sheet_id: 'sheet123',
    project_code: 'HLX', trang_thai: 'active', ngay_tao: '2026-01-01T00:00:00.000Z',
    loai: 'grid', sheet_tab: undefined, visible_columns: ['STT', 'Mã căn', 'Giá'],
  });
});

test('toStackingConfig: id KHÔNG BAO GIỜ bị đổi/synthesize — luôn dùng ĐÚNG row.id (Sheets id gốc, VD "SC_<timestamp>")', () => {
  const row = { id: 'SC_9999999999999', ten_hien_thi: 'X', sheet_id: 's', project_code: null, trang_thai: 'active', ngay_tao: '', loai: 'grid', sheet_tab: null, visible_columns: null } as never;
  assert.equal(toStackingConfig(row).id, 'SC_9999999999999');
});

test('toStackingConfig: visible_columns null/không phải mảng -> [] (KHÔNG throw, KHÔNG invent giá trị)', () => {
  const row1 = { id: 'a', ten_hien_thi: 't', sheet_id: 's', project_code: null, trang_thai: 'active', ngay_tao: '', loai: 'grid', sheet_tab: null, visible_columns: null } as never;
  const row2 = { id: 'a', ten_hien_thi: 't', sheet_id: 's', project_code: null, trang_thai: 'active', ngay_tao: '', loai: 'grid', sheet_tab: null, visible_columns: 'not-an-array' } as never;
  assert.deepEqual(toStackingConfig(row1).visible_columns, []);
  assert.deepEqual(toStackingConfig(row2).visible_columns, []);
});

test('toStackingConfig: trang_thai lạ (không phải "inactive") -> mặc định "active" (khớp fallback hiện có ở GS.getStackingConfigs); loai lạ -> mặc định "grid"', () => {
  const row = { id: 'a', ten_hien_thi: 't', sheet_id: 's', project_code: null, trang_thai: 'weird', ngay_tao: '', loai: 'weird', sheet_tab: null, visible_columns: null } as never;
  const cfg = toStackingConfig(row);
  assert.equal(cfg.trang_thai, 'active');
  assert.equal(cfg.loai, 'grid');
});

// ─── A/B. GET không cần Sheets khi flag bật — chứng minh bằng cấu trúc source ─

test('A/B. getStackingConfigs(): khi isPostgresEnabled(\'stacking\') HOẶC isStackingConfigPgReadsEnabled() true -> return NGAY readStackingConfigMirror(), TRƯỚC/KHÔNG chạm bất kỳ code Sheets (cached/.gs:stacking_configs/GS.getStackingConfigs) nào — Sheets 429 không thể ảnh hưởng nhánh này', () => {
  const fnMatch = dataAccessSrc.match(/export function getStackingConfigs\(\) \{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'không tìm thấy getStackingConfigs() trong data-access.ts');
  const body = fnMatch![0];
  assert.match(body, /if \(isPostgresEnabled\('stacking'\) \|\| isStackingConfigPgReadsEnabled\(\)\) return readStackingConfigMirror\(\);/);
  // Guard PHẢI là statement THỰC THI ĐẦU TIÊN trong thân hàm (bỏ qua các dòng
  // comment giải thích phía trên — chỉ dòng code thật đầu tiên mới tính).
  const firstCodeLine = body.split('\n').map(l => l.trim()).find(l => l.length > 0 && !l.startsWith('//') && !l.startsWith('export function'));
  assert.equal(firstCodeLine, "if (isPostgresEnabled('stacking') || isStackingConfigPgReadsEnabled()) return readStackingConfigMirror();");
});

test('B2. readStackingConfigMirror() (nhánh Postgres) hoàn toàn KHÔNG import/gọi bất kỳ hàm nào từ GS (google-sheets.ts) — tách biệt hoàn toàn khỏi Sheets, 429 của Sheets không thể lan sang', () => {
  const fnMatch = mirrorSrc.match(/export async function readStackingConfigMirror\(\)[\s\S]*?\n\}/);
  assert.ok(fnMatch);
  assert.doesNotMatch(fnMatch![0], /GS\.|google-sheets/);
  assert.doesNotMatch(mirrorSrc, /from '\.\/google-sheets'|from '@\/lib\/google-sheets'/, 'stacking-config-mirror.ts không được import gì từ google-sheets.ts (module đọc PHẢI độc lập hoàn toàn khỏi Sheets)');
});

// ─── Dedicated STACKING_CONFIG_PG_READS flag — PG_ENABLED_MODULES safe cutover ─
// (audit: Vercel Secret PG_ENABLED_MODULES không đọc lại được plaintext, nên
// KHÔNG append 'stacking' an toàn vào đó được — flag riêng, độc lập hoàn toàn,
// không bao giờ có thể làm mất module nào đã có trong PG_ENABLED_MODULES.)

test('K1. isStackingConfigPgReadsEnabled() mặc định FALSE khi STACKING_CONFIG_PG_READS chưa set — hành vi mặc định (flag tắt) không đổi', () => {
  delete process.env.STACKING_CONFIG_PG_READS;
  assert.equal(isStackingConfigPgReadsEnabled(), false);
});

test('K2. isStackingConfigPgReadsEnabled() TRUE khi STACKING_CONFIG_PG_READS="1", FALSE cho mọi giá trị khác ("true"/"0"/"yes"/rỗng) — so sánh CHÍNH XÁC "1", không suy đoán truthy chung chung', () => {
  process.env.STACKING_CONFIG_PG_READS = '1';
  assert.equal(isStackingConfigPgReadsEnabled(), true);
  for (const bad of ['true', '0', 'yes', '', '2']) {
    process.env.STACKING_CONFIG_PG_READS = bad;
    assert.equal(isStackingConfigPgReadsEnabled(), false, `giá trị "${bad}" phải bị coi là tắt`);
  }
  delete process.env.STACKING_CONFIG_PG_READS;
});

test('K3. getStackingConfigs(): flag STACKING_CONFIG_PG_READS bật (isStackingConfigPgReadsEnabled() true) dù isPostgresEnabled(\'stacking\') vẫn false -> VẪN đọc readStackingConfigMirror() — 2 flag độc lập, OR với nhau, không phụ thuộc PG_ENABLED_MODULES', () => {
  process.env.STACKING_CONFIG_PG_READS = '1';
  assert.equal(isPostgresEnabled('stacking'), false, '(sanity check môi trường test: PG_ENABLED_MODULES rỗng)');
  assert.equal(isStackingConfigPgReadsEnabled(), true);
  delete process.env.STACKING_CONFIG_PG_READS;
});

test('K4. isStackingConfigPgReadsEnabled() KHÔNG đụng process.env.PG_ENABLED_MODULES/_enabled cache của isPostgresEnabled — đọc env var RIÊNG của chính nó, không thể vô tình làm mất/đổi module nào trong PG_ENABLED_MODULES', () => {
  const fnSrc = featureFlagsSrc.match(/export function isStackingConfigPgReadsEnabled\(\): boolean \{[\s\S]*?\n\}/)![0];
  assert.doesNotMatch(fnSrc, /PG_ENABLED_MODULES|_enabled\b|parseEnabledModules/);
  assert.match(fnSrc, /process\.env\.STACKING_CONFIG_PG_READS === '1'/);
});

test('K5. STACKING_CONFIG_PG_READS là tên env var HOÀN TOÀN MỚI, KHÔNG trùng/đụng SHADOW_WRITE_MODULES hay PG_ENABLED_MODULES ở bất kỳ đâu trong data-access.ts/feature-flags.ts', () => {
  assert.doesNotMatch(dataAccessSrc, /STACKING_CONFIG_PG_READS.*PG_ENABLED_MODULES|PG_ENABLED_MODULES.*STACKING_CONFIG_PG_READS/);
  const dedicatedFlagSection = featureFlagsSrc.slice(featureFlagsSrc.indexOf('isStackingConfigPgReadsEnabled'));
  assert.doesNotMatch(dedicatedFlagSection.split('\n').slice(-3).join('\n'), /process\.env\.PG_ENABLED_MODULES|process\.env\.SHADOW_WRITE_MODULES/);
});

// ─── E. Write authority — Sheets LUÔN ghi trước, không đổi hành vi/kiểu trả về ─

test('E. addStackingConfig/updateStackingConfig/deleteStackingConfig LUÔN gọi GS.* TRƯỚC TIÊN (Sheets vẫn là write authority DUY NHẤT, không đổi bởi fix này) — mirror sync (nếu có) chỉ xảy ra SAU KHI Sheets write đã resolve', () => {
  for (const fn of ['addStackingConfig', 'updateStackingConfig', 'deleteStackingConfig']) {
    const m = dataAccessSrc.match(new RegExp(`export async function ${fn}\\([\\s\\S]*?\\n\\}`));
    assert.ok(m, `không tìm thấy ${fn}`);
    const body = m![0];
    const gsCallIdx = body.search(new RegExp(`await GS\\.${fn}\\(`));
    const mirrorCallIdx = body.search(/upsertStackingConfigMirror\(|deleteStackingConfigMirror\(/);
    assert.ok(gsCallIdx >= 0, `${fn} phải gọi GS.${fn}(...)`);
    if (mirrorCallIdx >= 0) assert.ok(gsCallIdx < mirrorCallIdx, `${fn}: lời gọi GS.${fn} (Sheets, write authority) phải xảy ra TRƯỚC lời gọi mirror sync`);
  }
});

test('E2. invalidate(\'gs:stacking_configs\') (mem-cache cũ) vẫn được gọi y hệt trước — không xoá hành vi cache-invalidation hiện có', () => {
  for (const fn of ['addStackingConfig', 'updateStackingConfig', 'deleteStackingConfig']) {
    const m = dataAccessSrc.match(new RegExp(`export async function ${fn}\\([\\s\\S]*?\\n\\}`));
    assert.match(m![0], /invalidate\('gs:stacking_configs'\);/);
  }
});

// ─── F. Mirror sync gate — tái dùng CHÍNH 2 flag sẵn có, không tạo flag mới ─

test('F. stackingMirrorWriteEnabled() tái dùng CHÍNH isPostgresEnabled/isShadowWriteEnabled đã có (module \'stacking\') — KHÔNG tạo biến process.env mới nào cho mục đích này', () => {
  assert.match(dataAccessSrc, /function stackingMirrorWriteEnabled\(\): boolean \{\s*return isPostgresEnabled\('stacking'\) \|\| isShadowWriteEnabled\('stacking'\);\s*\}/);
  assert.doesNotMatch(dataAccessSrc, /process\.env\.\w*STACKING\w*MIRROR|process\.env\.\w*STACKING\w*PG/i, 'không được tạo env var riêng cho mirror — phải tái dùng PG_ENABLED_MODULES/SHADOW_WRITE_MODULES sẵn có');
});

test('F2. Mỗi hàm write đều gọi mirror-sync bọc trong .catch() — lỗi mirror KHÔNG BAO GIỜ throw/reject ra ngoài (không block response, giống triết lý shadow-write.ts hiện có), nhưng PHẢI console.error rõ ràng (không nuốt lỗi im lặng)', () => {
  for (const fn of ['addStackingConfig', 'updateStackingConfig', 'deleteStackingConfig']) {
    const m = dataAccessSrc.match(new RegExp(`export async function ${fn}\\([\\s\\S]*?\\n\\}`));
    const body = m![0];
    if (/upsertStackingConfigMirror\(|deleteStackingConfigMirror\(|GS\.getStackingConfigs\(\)/.test(body)) {
      assert.match(body, /\.catch\(err =>\s*\n?\s*console\.error\('\[StackingConfigMirror\]/, `${fn}: mirror sync path phải có .catch(...) log rõ ràng, không được để lỗi mirror làm reject cả hàm`);
    }
  }
});

test('F3. CrmModule union thêm \'stacking\' — thay đổi THUẦN ADDITIVE (thêm 1 union member), không đổi/xoá module nào khác đã có', () => {
  assert.match(featureFlagsSrc, /\| 'stacking';/);
  for (const existing of ['tm', 'hrm', 'crm', 'attendance', 'dashboard', 'contracts', 'payroll', 'auth']) {
    assert.match(featureFlagsSrc, new RegExp(`\\| '${existing}'`), `module '${existing}' đã có từ trước phải còn nguyên`);
  }
});

test('F4. isPostgresEnabled(\'stacking\')/isShadowWriteEnabled(\'stacking\') mặc định FALSE khi env var rỗng/không set — hành vi mặc định (chưa bật flag) không đổi 1 chút nào so với trước khi có fix này', () => {
  assert.equal(isPostgresEnabled('stacking'), false);
  assert.equal(isShadowWriteEnabled('stacking'), false);
});

test('F5. Set PG_ENABLED_MODULES="stacking" -> isPostgresEnabled(\'stacking\') true (reuse ĐÚNG cơ chế parse env var đã có, không viết parser riêng)', () => {
  process.env.PG_ENABLED_MODULES = 'stacking';
  _resetFlagsCache();
  assert.equal(isPostgresEnabled('stacking'), true);
  assert.equal(isPostgresEnabled('crm'), false, 'bật stacking KHÔNG được vô tình bật module khác');
});

// ─── G. Không invent/fallback id khi ghi mirror ────────────────────────────

test('G. upsertStackingConfigMirror/resyncStackingConfigMirror dùng config.id LÀM where/create id TRỰC TIẾP — không random/uuid/derive id mới nào (giữ đúng id "SC_<timestamp>" gốc từ Sheets mà tmb-map-data.ts hard-code tham chiếu tới)', () => {
  assert.doesNotMatch(mirrorSrc, /randomUUID|uuid\(\)|crypto\.randomUUID|cuid\(\)/i);
  assert.match(mirrorSrc, /where: \{ id: config\.id \}/);
  assert.match(mirrorSrc, /create: \{ id: config\.id, \.\.\.data \}/);
});

// ─── H/J. Không đụng TMB static registry / marker / watchdog / diagnostic / PDF ─

test('H/J. Không có thay đổi NÀO (so với HEAD đã commit) trong tmb-map-data.ts/TmbMap.tsx/tmb-diag.ts — fix này CHỈ đụng STACKING_CONFIG read path, không đụng static TMB registry/renderer/diagnostic đã release', () => {
  let changedTracked: string[];
  try {
    changedTracked = execSync('git diff --name-only HEAD', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return; // môi trường không có git — bỏ qua best-effort check này, không fail build vì lý do ngoại cảnh
  }
  // 3 file này đã ĐƯỢC COMMIT (release trước: dd291d3 cho tmb-map-data.ts/
  // TmbMap.tsx via HLX static TMB, 53f3576 cho tmb-diag.ts) — `git diff
  // --name-only HEAD` phản ánh ĐÚNG "có sửa nội dung so với bản đã release
  // hay không", KHÔNG bị nhiễu bởi các file untracked khác (VD watchdog WIP
  // CHƯA BAO GIỜ commit — tự nhiên xuất hiện trong git status dù không ai
  // đụng vào, không phải tín hiệu đáng tin cho việc này).
  for (const f of ['src/app/stacking/tmb-map-data.ts', 'src/app/stacking/TmbMap.tsx', 'src/app/stacking/tmb-diag.ts']) {
    assert.ok(!changedTracked.includes(f), `KHÔNG được sửa "${f}" trong task này — task chỉ về STACKING_CONFIG read path`);
  }
});

test('H2/J2. Watchdog WIP + diagnostic-activation WIP (untracked, chưa release) vẫn TỒN TẠI trên disk — không bị xoá/discard bởi audit này (KHÔNG thể chứng minh "chưa sửa nội dung" cho file untracked bằng git status thuần — chỉ chứng minh "chưa xoá")', () => {
  for (const f of [
    'src/app/stacking/tmb-map-load-watchdog.ts',
    'tests/crm/tmb-map-load-watchdog.test.ts',
    'tests/crm/tmb-diag-page-activation.test.ts',
  ]) {
    assert.ok(fs.existsSync(f), `WIP "${f}" phải còn tồn tại — audit này không được xoá/discard bất kỳ WIP không liên quan nào`);
  }
});

// ─── I. Sheets inventory reads (list/units) không bị đụng — vẫn nguyên functions cũ ─

test('I. getStackingListRows/getStackingSheetList/getStackingUnits KHÔNG bị sửa bởi fix này — vẫn cached() y hệt cũ, hoàn toàn tách biệt khỏi getStackingConfigs (chỉ đọc SAU KHI User chọn dự án, không liên quan mirror StackingConfig)', () => {
  assert.match(dataAccessSrc, /export function getStackingListRows/);
  assert.doesNotMatch(dataAccessSrc.match(/export function getStackingListRows[\s\S]*?\n\}/)![0], /readStackingConfigMirror|stackingMirrorWriteEnabled|isPostgresEnabled\('stacking'\)/);
});
