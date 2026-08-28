// ADMIN_MODULE_MENU_MANAGER — Admin kéo-thả order/bật-tắt Sidebar, runtime,
// tái dùng CRM Module Toggle làm authority DUY NHẤT cho CRM. Khác các
// milestone M1B.2 trước (transactional-workflow.ts cần Prisma/DB thật, chỉ
// test được qua source-regex), resolve/merge logic ở đây là pure function
// thật — import và gọi trực tiếp, mạnh hơn source-regex nhiều. Source-regex
// chỉ dùng cho phần wiring UI (Sidebar/admin page) không thể unit-test thuần.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveNavigationConfig, toPersistedConfig, parseNavigationConfig,
  sanitizeNavigationConfigShape, DEFAULT_NAVIGATION_CONFIG,
  type PersistedNavigationConfig, type ResolvedNavigation,
} from '../../src/lib/navigation-config-resolve';
import { MENU_REGISTRY, hasBusinessAccess, type MenuRootDef } from '../../src/lib/menu-registry';

// Fixture registry nhỏ, độc lập với MENU_REGISTRY thật của app — test logic
// merge/order/visibility không phụ thuộc nội dung Sidebar hiện tại (tránh vỡ
// test khi sau này thêm/bớt menu thật).
const FIXTURE_REGISTRY: MenuRootDef[] = [
  { key: 'a', label: 'A', href: '/a', icon: (() => null) as never },
  { key: 'b', label: 'B', icon: (() => null) as never, children: [
    { key: 'b.1', label: 'B1', href: '/b/1', icon: (() => null) as never },
    { key: 'b.2', label: 'B2', href: '/b/2', icon: (() => null) as never },
    { key: 'b.3', label: 'B3', href: '/b/3', icon: (() => null) as never },
  ] },
  { key: 'crm', label: 'CRM', icon: (() => null) as never, moduleAvailability: 'crm', children: [
    { key: 'crm.x', label: 'X', href: '/crm/x', icon: (() => null) as never },
  ] },
  { key: 'c', label: 'C', href: '/c', icon: (() => null) as never },
];

function emptyConfig(): PersistedNavigationConfig {
  return { version: 1, rootOrder: [], disabledRoots: [], childOrder: {}, disabledChildren: [] };
}

// --- Ordering ---------------------------------------------------------

test('resolveNavigationConfig: root không có persisted order -> giữ đúng thứ tự khai báo registry', () => {
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, emptyConfig());
  assert.deepEqual(resolved.roots.map(r => r.key), ['a', 'b', 'crm', 'c']);
});

test('resolveNavigationConfig: root reorder đúng theo persisted.rootOrder', () => {
  const config: PersistedNavigationConfig = { ...emptyConfig(), rootOrder: ['c', 'a', 'crm', 'b'] };
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, config);
  assert.deepEqual(resolved.roots.map(r => r.key), ['c', 'a', 'crm', 'b']);
});

test('resolveNavigationConfig: children reorder đúng theo persisted.childOrder[parentKey]', () => {
  const config: PersistedNavigationConfig = { ...emptyConfig(), childOrder: { b: ['b.3', 'b.1', 'b.2'] } };
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, config);
  const bRoot = resolved.roots.find(r => r.key === 'b')!;
  assert.deepEqual(bRoot.children.map(c => c.key), ['b.3', 'b.1', 'b.2']);
});

test('resolveNavigationConfig: child KHÔNG thể đổi parent — childOrder của parent khác không ảnh hưởng children thật của root đó', () => {
  // Giả lập payload cố tình "chuyển" b.1 sang danh sách con của 'c' (root
  // không có children trong registry) — childOrder['c'] không tồn tại
  // đường nào để root 'b' đọc nhầm, và root 'c' vốn không có children nên
  // không có gì để merge vào.
  const config: PersistedNavigationConfig = { ...emptyConfig(), childOrder: { c: ['b.1'], b: ['b.2', 'b.3'] } };
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, config);
  const bRoot = resolved.roots.find(r => r.key === 'b')!;
  const cRoot = resolved.roots.find(r => r.key === 'c')!;
  assert.deepEqual(bRoot.children.map(c => c.key), ['b.2', 'b.3', 'b.1'], 'b.1 bị thiếu trong childOrder[b] -> append theo default, KHÔNG biến mất, KHÔNG chạy sang root khác');
  assert.deepEqual(cRoot.children, [], 'root C không có children trong registry -> luôn rỗng dù childOrder[c] có gì');
});

// --- Visibility ---------------------------------------------------------

test('resolveNavigationConfig: root trong disabledRoots -> enabled=false', () => {
  const config: PersistedNavigationConfig = { ...emptyConfig(), disabledRoots: ['b'] };
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, config);
  assert.equal(resolved.roots.find(r => r.key === 'b')!.enabled, false);
  assert.equal(resolved.roots.find(r => r.key === 'a')!.enabled, true);
});

test('resolveNavigationConfig: child trong disabledChildren -> enabled=false, các child khác không ảnh hưởng', () => {
  const config: PersistedNavigationConfig = { ...emptyConfig(), disabledChildren: ['b.2'] };
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, config);
  const bRoot = resolved.roots.find(r => r.key === 'b')!;
  assert.equal(bRoot.children.find(c => c.key === 'b.2')!.enabled, false);
  assert.equal(bRoot.children.find(c => c.key === 'b.1')!.enabled, true);
  assert.equal(bRoot.children.find(c => c.key === 'b.3')!.enabled, true);
});

test('hasBusinessAccess: business authority vẫn áp dụng SAU KHI nav config xác định visible — Menu Manager bật 1 mục không tự cấp quyền', () => {
  const noAccess = { isAdmin: false, canPhanKhach: false, canQualityDashboard: false, canEditHRM: false };
  const fullAccess = { isAdmin: true, canPhanKhach: true, canQualityDashboard: true, canEditHRM: true };
  assert.equal(hasBusinessAccess('canQualityDashboard', noAccess), false, 'nav config có thể bật crm.qualifiedData, nhưng user không có canQualityDashboard vẫn không được hasBusinessAccess cho qua');
  assert.equal(hasBusinessAccess('canQualityDashboard', fullAccess), true);
  assert.equal(hasBusinessAccess(undefined, noAccess), true, 'không có tag -> không thêm gate nào, giữ nguyên hành vi cũ');
  assert.equal(hasBusinessAccess('adminOnly', noAccess), false);
});

// --- Persistence (save -> reload, mô phỏng qua round-trip pure function) ---

test('toPersistedConfig -> resolveNavigationConfig round-trip: order/visibility giữ nguyên sau "reload"', () => {
  const config: PersistedNavigationConfig = {
    version: 1, rootOrder: ['c', 'b', 'a'], disabledRoots: ['a'],
    childOrder: { b: ['b.3', 'b.2', 'b.1'] }, disabledChildren: ['b.2'],
  };
  const firstLoad = resolveNavigationConfig(FIXTURE_REGISTRY, config);
  const saved = toPersistedConfig(firstLoad);
  const reloaded = resolveNavigationConfig(FIXTURE_REGISTRY, saved);
  assert.deepEqual(reloaded, firstLoad, 'save (toPersistedConfig) rồi resolve lại (mô phỏng reload) phải cho kết quả giống hệt trước khi save');
});

// --- Config resilience ---------------------------------------------------

test('parseNavigationConfig: raw null/undefined -> DEFAULT_NAVIGATION_CONFIG', () => {
  assert.deepEqual(parseNavigationConfig(null), DEFAULT_NAVIGATION_CONFIG);
  assert.deepEqual(parseNavigationConfig(undefined), DEFAULT_NAVIGATION_CONFIG);
});

test('parseNavigationConfig: JSON hỏng -> fallback deterministic về default, không throw', () => {
  assert.doesNotThrow(() => parseNavigationConfig('{not valid json'));
  assert.deepEqual(parseNavigationConfig('{not valid json'), DEFAULT_NAVIGATION_CONFIG);
});

test('parseNavigationConfig: version khác (hoặc thiếu) -> fallback default, KHÔNG cố migrate ngầm', () => {
  assert.deepEqual(parseNavigationConfig(JSON.stringify({ version: 2, rootOrder: ['a'] })), DEFAULT_NAVIGATION_CONFIG);
  assert.deepEqual(parseNavigationConfig(JSON.stringify({ rootOrder: ['a'] })), DEFAULT_NAVIGATION_CONFIG);
});

test('config config cũ CHỈ có 1 phần root (thiếu root mới thêm sau) -> resolve vẫn xuất hiện đủ, root mới append cuối theo default order', () => {
  // Mô phỏng: config được lưu TRƯỚC KHI thêm root 'crm' vào registry.
  const oldConfig: PersistedNavigationConfig = { ...emptyConfig(), rootOrder: ['a', 'b', 'c'] };
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, oldConfig);
  assert.deepEqual(resolved.roots.map(r => r.key), ['a', 'b', 'c', 'crm'], 'root mới (crm) không có trong rootOrder cũ -> append cuối, không biến mất');
});

test('unknown keys trong persisted config bị bỏ qua an toàn (root/child đã bị xoá khỏi registry)', () => {
  const config: PersistedNavigationConfig = {
    ...emptyConfig(),
    rootOrder: ['ghost', 'a', 'b', 'crm', 'c'],
    disabledRoots: ['ghost-2'],
    childOrder: { b: ['b.1', 'ghost-child', 'b.2', 'b.3'] },
  };
  assert.doesNotThrow(() => resolveNavigationConfig(FIXTURE_REGISTRY, config));
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, config);
  assert.deepEqual(resolved.roots.map(r => r.key), ['a', 'b', 'crm', 'c'], 'key "ghost" không tồn tại trong registry -> bị lọc bỏ, không crash, không tạo root ma');
  const bRoot = resolved.roots.find(r => r.key === 'b')!;
  assert.deepEqual(bRoot.children.map(c => c.key), ['b.1', 'b.2', 'b.3'], 'ghost-child bị lọc bỏ khỏi childOrder');
});

test('sanitizeNavigationConfigShape: malformed input (không phải object, mảng sai kiểu, field lạ) -> null, KHÔNG âm thầm coi là hợp lệ', () => {
  assert.equal(sanitizeNavigationConfigShape(null), null);
  assert.equal(sanitizeNavigationConfigShape('a string'), null);
  assert.equal(sanitizeNavigationConfigShape(42), null);
  assert.deepEqual(sanitizeNavigationConfigShape({ version: 1, rootOrder: 'not-an-array' })?.rootOrder, []);
  assert.equal(sanitizeNavigationConfigShape({ version: 1, rootOrder: ['a', 123, null, 'b'] })?.rootOrder.length, 2, 'phần tử không phải string trong mảng bị lọc bỏ, không throw');
});

test('sanitizeNavigationConfigShape: dedupe rootOrder/disabledRoots/disabledChildren trùng lặp', () => {
  const result = sanitizeNavigationConfigShape({ version: 1, rootOrder: ['a', 'a', 'b'], disabledRoots: ['x', 'x'] });
  assert.deepEqual(result?.rootOrder, ['a', 'b']);
  assert.deepEqual(result?.disabledRoots, ['x']);
});

// --- CRM integration: KHÔNG có 2 authority song song ------------------------

test('resolveNavigationConfig: externalAvailability LUÔN thắng disabledRoots cho root có moduleAvailability — CRM OFF (external=false) dù disabledRoots KHÔNG chứa "crm" thì vẫn OFF', () => {
  const config: PersistedNavigationConfig = { ...emptyConfig(), disabledRoots: [] };
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, config, { crm: false });
  assert.equal(resolved.roots.find(r => r.key === 'crm')!.enabled, false);
});

test('resolveNavigationConfig: CRM ON (external=true) dù disabledRoots CÓ chứa "crm" (dữ liệu cũ/rác) thì vẫn ON — external luôn thắng, không có state kẹt', () => {
  const config: PersistedNavigationConfig = { ...emptyConfig(), disabledRoots: ['crm'] };
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, config, { crm: true });
  assert.equal(resolved.roots.find(r => r.key === 'crm')!.enabled, true);
});

test('resolveNavigationConfig: thiếu externalAvailability cho root có moduleAvailability -> fallback về disabledRoots (không throw, không crash Sidebar nếu CRM Module hook chưa load xong)', () => {
  const config: PersistedNavigationConfig = { ...emptyConfig(), disabledRoots: ['crm'] };
  const resolved = resolveNavigationConfig(FIXTURE_REGISTRY, config, {});
  assert.equal(resolved.roots.find(r => r.key === 'crm')!.enabled, false);
});

test('toPersistedConfig: KHÔNG BAO GIỜ ghi "crm" vào disabledRoots dù resolved.crm.enabled=false — tránh tạo authority thứ 2 song song với crm_module_enabled', () => {
  const resolved: ResolvedNavigation = {
    roots: [
      { key: 'crm', enabled: false, children: [] },
      { key: 'a', enabled: false, children: [] },
    ],
  };
  const persisted = toPersistedConfig(resolved);
  assert.deepEqual(persisted.disabledRoots, ['a'], '"crm" phải bị loại khỏi disabledRoots dù enabled=false lúc này — authority thật là crm_module_enabled, không phải field này');
});

test('MENU_REGISTRY thật của app: chỉ đúng 1 root có moduleAvailability="crm" — không có module availability thứ 2 nào khác được tạo ra ngoài scope milestone', () => {
  const withModuleAvailability = MENU_REGISTRY.filter(r => r.moduleAvailability !== undefined);
  assert.equal(withModuleAvailability.length, 1);
  assert.equal(withModuleAvailability[0].key, 'crm');
});

test('MENU_REGISTRY thật của app: đúng 4 child CRM và 4 child HRM như Sidebar cũ, key ổn định đúng ví dụ trong yêu cầu (crm.customers/crm.cskh/crm.qualifiedData/crm.pipeline)', () => {
  const crm = MENU_REGISTRY.find(r => r.key === 'crm')!;
  assert.deepEqual(crm.children?.map(c => c.key), ['crm.customers', 'crm.cskh', 'crm.qualifiedData', 'crm.pipeline']);
  const hrm = MENU_REGISTRY.find(r => r.key === 'hrm')!;
  assert.deepEqual(hrm.children?.map(c => c.key), ['hrm.employees', 'hrm.contracts', 'hrm.payroll', 'hrm.attendance']);
});

test('admin/menu/page.tsx: draft chỉ khởi tạo khi CẢ configLoading VÀ crmLoading đều false — phát hiện live trong production validation: nếu chỉ đợi configLoading, draftCrmEnabled có thể chốt nhầm vào fallback mặc định (true) của useCrmModule trước khi giá trị thật resolve, khiến Save âm thầm BẬT CRM dù Admin không chạm vào công tắc CRM (vi phạm bất biến 1 authority duy nhất, §5)', () => {
  const src = readFileSync(resolve('src/app/admin/menu/page.tsx'), 'utf8');
  assert.match(src, /const \{ enabled: crmEnabled, isLoading: crmLoading, mutate: mutateCrmModule \} = useCrmModule\(\);/);
  const iEffect = src.indexOf('useEffect(() => {\n    if (initialized || configLoading');
  assert.ok(iEffect > -1, 'phải có effect khởi tạo draft với guard initialized/configLoading');
  const effectBody = src.slice(iEffect, iEffect + 400);
  assert.match(effectBody, /if \(initialized \|\| configLoading \|\| crmLoading\) return;/, 'guard phải chặn cả 3 điều kiện — thiếu crmLoading là root cause của bug đã phát hiện');
  assert.match(effectBody, /\}, \[initialized, configLoading, crmLoading, config, crmEnabled\]\);/, 'dependency array phải khai báo đủ crmLoading');
});

// --- Wiring: Sidebar/API/admin page (không unit-test được thuần, source-regex) ---

test('Sidebar.tsx: resolveNavigationConfig gọi với externalAvailability={ crm: crmEnabled } — CRM root đọc đúng authority hiện có, không phải state cục bộ mới', () => {
  const src = readFileSync(resolve('src/components/layout/Sidebar.tsx'), 'utf8');
  assert.match(src, /resolveNavigationConfig\(MENU_REGISTRY, navConfigRaw \?\? DEFAULT_NAVIGATION_CONFIG, \{ crm: crmEnabled \}\)/);
  assert.match(src, /import \{ useCrmModule \} from '@\/hooks\/useCrmModule';/, 'Sidebar phải tiếp tục dùng đúng useCrmModule hiện có, không tạo hook CRM state thứ 2');
});

test('Sidebar.tsx: business authorization (hasBusinessAccess) được áp dụng CUỐI CÙNG, sau khi đã xác định rootEnabled — đúng thứ tự pipeline registry -> nav config -> module availability -> business authority', () => {
  const src = readFileSync(resolve('src/components/layout/Sidebar.tsx'), 'utf8');
  const iVisibleRoots = src.indexOf('const visibleRoots = resolvedNav.roots');
  const iRootEnabled = src.indexOf('const rootEnabled =', iVisibleRoots);
  const iBusinessCheck = src.indexOf('hasBusinessAccess(def.businessAccess', iVisibleRoots);
  assert.ok(iVisibleRoots > -1 && iRootEnabled > -1 && iBusinessCheck > -1);
  assert.ok(iRootEnabled < iBusinessCheck, 'rootEnabled (nav config + module availability) phải được xác định TRƯỚC business access check, không phải ngược lại');
});

test('Sidebar.tsx: link "Quản lý Menu & Module" nằm trong nhánh isAdmin ĐƠN THUẦN (không AND thêm crmEnabled hay nav config nào) — Admin không bao giờ tự khoá khỏi Menu Manager', () => {
  const src = readFileSync(resolve('src/components/layout/Sidebar.tsx'), 'utf8');
  const iLink = src.indexOf('href="/admin/menu"');
  assert.ok(iLink > -1, 'phải có link tới /admin/menu');
  const before = src.slice(Math.max(0, iLink - 200), iLink);
  assert.match(before, /\{isAdmin && \(/);
  assert.doesNotMatch(before, /crmEnabled|navConfigRaw|resolvedNav/, 'nút Quản lý Menu & Module không được phụ thuộc CRM Module hay nav config — phải luôn hiện cho Admin bất kể trạng thái nào khác');
});

test('admin/menu/page.tsx: gate truy cập trang CHỈ dựa vào isAdmin — KHÔNG phụ thuộc canAccessCrmModule/crmEnabled/navigation config nào, đảm bảo recovery path luôn hoạt động kể cả khi CRM OFF', () => {
  const src = readFileSync(resolve('src/app/admin/menu/page.tsx'), 'utf8');
  const iGate = src.indexOf('if (!isAdmin) return (');
  assert.ok(iGate > -1);
  const fnStart = src.indexOf('export default function AdminMenuPage');
  const gateSection = src.slice(fnStart, iGate);
  assert.doesNotMatch(gateSection, /if \(!crmEnabled\)|if \(!canAccessCrmModule/, 'gate của trang Menu Manager không được thêm điều kiện phụ thuộc CRM Module');
});

test('api/navigation-config/route.ts: PUT yêu cầu isCrmAdmin (403 nếu không phải Admin), dùng đúng hàm dùng chung từ crm-auth.ts', () => {
  const src = readFileSync(resolve('src/app/api/navigation-config/route.ts'), 'utf8');
  assert.match(src, /import \{ getCrmSessionUser, isCrmAdmin \} from '@\/lib\/crm-auth';/);
  const putStart = src.indexOf('export async function PUT');
  const putBody = src.slice(putStart);
  assert.match(putBody, /if \(!isCrmAdmin\(user\)\)/);
  assert.match(putBody, /status: 403/);
});

test('api/navigation-config/route.ts PUT dùng sanitizeNavigationConfigShape (strict, 400 nếu sai shape) — KHÔNG dùng parseNavigationConfig (lenient, âm thầm fallback default) cho input từ client, tránh 1 payload lỗi xoá sạch config đã lưu', () => {
  const src = readFileSync(resolve('src/app/api/navigation-config/route.ts'), 'utf8');
  const putStart = src.indexOf('export async function PUT');
  const putBody = src.slice(putStart);
  assert.match(putBody, /sanitizeNavigationConfigShape\(body\)/);
  assert.match(putBody, /status: 400/);
});

// --- Client/server bundle split (bài học từ CRM Module Toggle) -------------

test('navigation-config-resolve.ts (pure) KHÔNG import settings-store/navigation-config (server-only, Node deps) — an toàn dùng trong Sidebar.tsx và admin/menu/page.tsx (\'use client\')', () => {
  const src = readFileSync(resolve('src/lib/navigation-config-resolve.ts'), 'utf8');
  assert.doesNotMatch(src, /from '\.\/settings-store'|from '\.\/navigation-config'|google-spreadsheet|google-auth-library/);
});

test('menu-registry.ts (pure) KHÔNG import settings-store/navigation-config — chỉ import lucide-react (an toàn client)', () => {
  const src = readFileSync(resolve('src/lib/menu-registry.ts'), 'utf8');
  assert.doesNotMatch(src, /from '\.\/settings-store'|from '\.\/navigation-config'|google-spreadsheet|google-auth-library/);
});

test("Sidebar.tsx và admin/menu/page.tsx ('use client') import từ navigation-config-resolve/menu-registry (pure) — KHÔNG từ navigation-config.ts (server-only)", () => {
  for (const file of ['src/components/layout/Sidebar.tsx', 'src/app/admin/menu/page.tsx']) {
    const src = readFileSync(resolve(file), 'utf8');
    assert.doesNotMatch(src, /from '@\/lib\/navigation-config'[;'"]/, `${file} không được import trực tiếp từ navigation-config.ts (server-only, kéo Node deps vào client bundle)`);
    assert.match(src, /from '@\/lib\/navigation-config-resolve'/, `${file} phải import merge logic từ bản pure`);
  }
});

test('navigation-config.ts (server-only) reuse getSettingValue/setSettingValue từ settings-store.ts — không tự viết Google Sheets client riêng', () => {
  const src = readFileSync(resolve('src/lib/navigation-config.ts'), 'utf8');
  assert.match(src, /import \{ getSettingValue, setSettingValue \} from '\.\/settings-store';/);
  assert.doesNotMatch(src, /new GoogleSpreadsheet|new JWT\(/);
});

// --- Regression: M1B.1/M1B.2/Customer authorization unaffected -------------

test('regression: transactional-workflow.ts (M1B.2 Handoff/Pipeline) và crm-auth.ts (canManageCampaign/isCrmAdmin) không bị đụng bởi Menu Manager — không import menu-registry/navigation-config', () => {
  const files = [
    'src/lib/crm-funnel/transactional-workflow.ts',
    'src/lib/crm-auth.ts',
    'src/lib/campaign-sale-eligibility.ts',
  ];
  for (const file of files) {
    const src = readFileSync(resolve(file), 'utf8');
    assert.doesNotMatch(src, /menu-registry|navigation-config/, `${file} không liên quan Menu Manager, không được import nó`);
  }
});

test('regression: /api/khach-hang, /api/campaigns/[id]/distribute business authorization (isCrmAdmin/canManageCampaign/canViewCustomer) không bị nới lỏng — không import menu-registry/navigation-config', () => {
  const files = [
    'src/app/api/khach-hang/route.ts',
    'src/app/api/campaigns/[id]/distribute/route.ts',
  ];
  for (const file of files) {
    const src = readFileSync(resolve(file), 'utf8');
    assert.doesNotMatch(src, /menu-registry|navigation-config/);
  }
  const khSrc = readFileSync(resolve('src/app/api/khach-hang/route.ts'), 'utf8');
  assert.match(khSrc, /canViewCustomer\(user, customer, projects\)/);
  const distributeSrc = readFileSync(resolve('src/app/api/campaigns/[id]/distribute/route.ts'), 'utf8');
  assert.match(distributeSrc, /canManageCampaign\(user, campaign\)/);
});

test('regression: transitionHandoffTransactional accept-branch cache-invalidation fix (commit 43da3e7) vẫn còn nguyên vẹn', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.match(src, /if \(input\.action === 'accept'\) \{\s*\n\s*revalidateTag\('kh', \{\}\); invalidate\('gs:kh'\);/);
});
