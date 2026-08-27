// CRM Module Toggle — Admin-only runtime ON/OFF gate cho CRM surfaces, ĐỘC
// LẬP với M1B.2 business authority. Cùng kiến trúc test đã dùng xuyên suốt
// repo: pure-function unit test cho phần thuần (canAccessCrmModule), source-
// regex cho phần server route/component (next/headers, Google Sheets client
// chặn invoke trực tiếp trong node:test — không có Sheets/DB thật trong test
// runner).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canAccessCrmModule } from '../../src/lib/crm-module-access';

// --- 1. canAccessCrmModule: pure authority helper -------------------------

test('crm-module-access.ts hoàn toàn pure — KHÔNG import bất kỳ module nào khác (đặc biệt không import settings-store/google-spreadsheet) — đây là lý do file này an toàn dùng trong \'use client\' page mà không kéo Node-only deps (fs/net/child_process) vào client bundle', () => {
  const src = readFileSync(resolve('src/lib/crm-module-access.ts'), 'utf8');
  assert.doesNotMatch(src, /^import /m, 'crm-module-access.ts phải là pure function, không import gì — nếu cần import gì đó, đặt lại vào crm-module.ts (server-only) và tách helper khác');
});

test('canAccessCrmModule: Admin luôn true bất kể module ON/OFF — Admin không bao giờ tự khóa khỏi CRM/toggle', () => {
  assert.equal(canAccessCrmModule(true, true), true);
  assert.equal(canAccessCrmModule(true, false), true);
});

test('canAccessCrmModule: non-admin true khi module ON', () => {
  assert.equal(canAccessCrmModule(false, true), true);
});

test('canAccessCrmModule: non-admin false khi module OFF — đây là toàn bộ tác dụng của toggle', () => {
  assert.equal(canAccessCrmModule(false, false), false);
});

// --- 2. Storage: reuse existing SETTINGS sheet, không phát minh store mới -

test('crm-module.ts reuse getSettingsSheet() từ settings-store.ts (đã dùng cho company_logo) — không tự viết Google Sheets client riêng cho toggle này', () => {
  const src = readFileSync(resolve('src/lib/crm-module.ts'), 'utf8');
  assert.match(src, /import \{ getSettingsSheet \} from '\.\/settings-store';/);
  assert.doesNotMatch(src, /new GoogleSpreadsheet|new JWT\(/, 'không được tự kết nối Google Sheets riêng — phải qua settings-store.ts dùng chung');
});

test('settings-store.ts: /api/settings/logo (company_logo) và crm-module.ts (crm_module_enabled) cùng dùng chung 1 getSettingsSheet() — xác nhận thực sự "reuse", không phải 2 bản sao trùng lặp', () => {
  const storeSrc = readFileSync(resolve('src/lib/settings-store.ts'), 'utf8');
  const logoSrc = readFileSync(resolve('src/app/api/settings/logo/route.ts'), 'utf8');
  const moduleSrc = readFileSync(resolve('src/lib/crm-module.ts'), 'utf8');
  assert.match(storeSrc, /export async function getSettingsSheet\(\)/);
  assert.match(logoSrc, /import \{ getSettingsSheet \} from '@\/lib\/settings-store';/, 'logo route phải import từ settings-store, không tự định nghĩa lại getJWT/getSettingsSheet');
  assert.doesNotMatch(logoSrc, /new GoogleSpreadsheet|new JWT\(/, 'logo route không còn tự kết nối Sheets riêng sau khi extract ra settings-store.ts');
  assert.match(moduleSrc, /import \{ getSettingsSheet \} from '\.\/settings-store';/);
});

test('crm-module.ts KHÔNG dùng PG_ENABLED_MODULES/isPostgresEnabled hay bất kỳ env var nào cho chính giá trị bật/tắt — mục tiêu là runtime toggle, không redeploy', () => {
  const src = readFileSync(resolve('src/lib/crm-module.ts'), 'utf8');
  assert.doesNotMatch(src, /process\.env\.\w*CRM\w*|isPostgresEnabled/i, 'giá trị ON/OFF phải đọc/ghi qua Sheets (setCrmModuleEnabled/isCrmModuleEnabled), không qua env var');
});

test('crm-module.ts: mặc định BẬT khi key chưa từng được set — không đổi hành vi hiện tại (CRM đang mở cho M1B.2) ngay lúc deploy tính năng này', () => {
  const src = readFileSync(resolve('src/lib/crm-module.ts'), 'utf8');
  assert.match(src, /const enabled = row \? row\.get\('value'\) === 'true' : true;/, 'thiếu row (key chưa set) phải mặc định enabled=true');
});

test('crm-module.ts: setCrmModuleEnabled() thực sự ghi/persist qua Sheets row (save/addRow), không chỉ update in-memory cache — đảm bảo state persist sau reload/instance khác', () => {
  const src = readFileSync(resolve('src/lib/crm-module.ts'), 'utf8');
  const fnStart = src.indexOf('export async function setCrmModuleEnabled');
  const fnBody = src.slice(fnStart, src.indexOf('\n}', fnStart));
  assert.match(fnBody, /existing\.set\('value', String\(enabled\)\);\s*\n\s*await existing\.save\(\);/);
  assert.match(fnBody, /await sheet\.addRow\(\{ key: CRM_MODULE_KEY, value: String\(enabled\) \}\);/);
});

// --- 3. API route: GET requires login, PUT requires Admin -----------------

test('/api/crm-module GET: yêu cầu đăng nhập (getCrmSessionUser), trả 401 nếu chưa — không public hoàn toàn', () => {
  const src = readFileSync(resolve('src/app/api/crm-module/route.ts'), 'utf8');
  const getStart = src.indexOf('export async function GET');
  const putStart = src.indexOf('export async function PUT');
  const getBody = src.slice(getStart, putStart);
  assert.match(getBody, /if \(!user\) return NextResponse\.json\(\{ success: false, error: 'Chưa đăng nhập' \}, \{ status: 401 \}\);/);
});

test('/api/crm-module PUT: yêu cầu isCrmAdmin — trả 403 cho non-admin, dùng ĐÚNG isCrmAdmin từ crm-auth.ts (không tự viết check role riêng)', () => {
  const src = readFileSync(resolve('src/app/api/crm-module/route.ts'), 'utf8');
  assert.match(src, /import \{ getCrmSessionUser, isCrmAdmin \} from '@\/lib\/crm-auth';/);
  const putStart = src.indexOf('export async function PUT');
  const putBody = src.slice(putStart);
  const iAuth = putBody.indexOf('if (!user)');
  const iAdminCheck = putBody.indexOf("if (!isCrmAdmin(user))");
  const iForbidden = putBody.indexOf('status: 403');
  const iSetCall = putBody.indexOf('setCrmModuleEnabled(');
  assert.ok(iAuth > -1 && iAdminCheck > -1 && iForbidden > -1 && iSetCall > -1);
  assert.ok(iAuth < iAdminCheck && iAdminCheck < iForbidden && iForbidden < iSetCall, 'thứ tự bắt buộc: check login -> check admin -> (nếu không phải) 403 -> mới gọi setCrmModuleEnabled');
});

// --- 4. Page gates: CRM Module Toggle là authority DUY NHẤT thay hard-coded gate cũ ---

const GATED_PAGES = [
  { file: 'src/app/khach-hang/page.tsx', label: 'Khách hàng' },
  { file: 'src/app/data-chat-luong/page.tsx', label: 'Data tiềm năng' },
  { file: 'src/app/pipeline/page.tsx', label: 'Giao dịch (Pipeline)' },
];

for (const { file, label } of GATED_PAGES) {
  test(`${label} (${file}): dùng canAccessCrmModule(isAdmin, crmEnabled) làm gate, KHÔNG còn hard-coded "TẠM THỜI" comment/dead code song song`, () => {
    const src = readFileSync(resolve(file), 'utf8');
    assert.match(src, /import \{ useCrmModule \} from '@\/hooks\/useCrmModule';/);
    // Phải import từ crm-module-access (pure, client-safe) — KHÔNG từ
    // crm-module (server-only, kéo theo google-spreadsheet/google-auth-
    // library -> webpack build fail "Can't resolve fs/net/child_process"
    // vì đây là 'use client' page).
    assert.match(src, /import \{ canAccessCrmModule \} from '@\/lib\/crm-module-access';/);
    assert.doesNotMatch(src, /from '@\/lib\/crm-module';/, `${label} là 'use client' page — không được import từ crm-module.ts (server-only, Node deps)`);
    assert.match(src, /canAccessCrmModule\(isAdmin, crmEnabled\)/);
    assert.doesNotMatch(src, /TẠM THỜI TẮT|TẠM THỜI mở lại/, 'không được để lại comment/dead code của gate tạm thời cũ — tránh 2 authority song song gây drift');
  });
}

test('phan-khach/page.tsx: canAccessPage kết hợp CẢ module toggle VÀ business authority hiện có (vai_tro === "Sale") — không thay thế, chỉ gate thêm bên ngoài', () => {
  const src = readFileSync(resolve('src/app/phan-khach/page.tsx'), 'utf8');
  assert.match(src, /import \{ useCrmModule \} from '@\/hooks\/useCrmModule';/);
  assert.match(src, /const canAccessPage = isAdmin \|\| \(crmEnabled && user\?\.vai_tro === 'Sale'\);/, 'phải giữ nguyên điều kiện vai_tro Sale hiện có, chỉ AND thêm crmEnabled — không thay thế bằng canAccessCrmModule đơn thuần (sẽ làm MẤT giới hạn vai_tro Sale)');
});

// --- 5. Sidebar: CRM group gate + Admin-only toggle control ----------------

test('Sidebar.tsx: nhóm CRM dùng canAccessCrmModule(isAdmin, crmEnabled) thay cho hard-coded `isAdmin &&` cũ, comment "TẠM THỜI mở lại" đã được thay bằng giải thích authority mới', () => {
  const src = readFileSync(resolve('src/components/layout/Sidebar.tsx'), 'utf8');
  assert.match(src, /import \{ useCrmModule \} from '@\/hooks\/useCrmModule';/);
  assert.match(src, /import \{ canAccessCrmModule \} from '@\/lib\/crm-module-access';/, "Sidebar.tsx là 'use client' component — phải import từ crm-module-access (pure), không từ crm-module (server-only)");
  assert.doesNotMatch(src, /from '@\/lib\/crm-module';/);
  assert.match(src, /\{canAccessCrmModule\(isAdmin, crmEnabled\) && \(/);
  assert.doesNotMatch(src, /TẠM THỜI mở lại toàn bộ/, 'comment tạm thời cũ phải được dọn, không để lại 2 giải thích authority mâu thuẫn nhau');
});

test('Sidebar.tsx: control "CRM Module" chỉ render khi isAdmin — non-admin không thấy/không đổi được toggle', () => {
  const src = readFileSync(resolve('src/components/layout/Sidebar.tsx'), 'utf8');
  const iButton = src.indexOf('CRM Module: {crmEnabled');
  assert.ok(iButton > -1, 'phải có control hiển thị trạng thái CRM Module: Bật/Tắt');
  const before = src.slice(Math.max(0, iButton - 700), iButton);
  assert.match(before, /\{isAdmin && \(\s*\n\s*<button\s*\n\s*onClick=\{\(\) => \{ setCrmModulePending/, 'control CRM Module phải nằm trong nhánh isAdmin — non-admin không thấy nút này');
});

test('Sidebar.tsx: modal CRM Module gọi PUT /api/crm-module (không phải POST tuỳ tiện, không phải ghi thẳng DB/Sheets từ client)', () => {
  const src = readFileSync(resolve('src/components/layout/Sidebar.tsx'), 'utf8');
  assert.match(src, /fetch\('\/api\/crm-module', \{\s*\n\s*method: 'PUT',/);
  assert.match(src, /body: JSON\.stringify\(\{ enabled: crmModulePending \}\)/);
});

// --- 6. Regression: không đụng M1B.2 business authority --------------------

test('crm-module.ts KHÔNG import/redefine isCrmAdmin/canManageCampaign/eligibleCampaignSales — module toggle không thay thế business authorization', () => {
  const src = readFileSync(resolve('src/lib/crm-module.ts'), 'utf8');
  // Bỏ comment (file có nhắc tên các hàm này trong doc comment giải thích
  // ranh giới) — chỉ kiểm tra CODE thật sự không import/gọi chúng.
  const codeOnly = src.split('\n').filter(line => {
    const t = line.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).join('\n');
  assert.doesNotMatch(codeOnly, /canManageCampaign|eligibleCampaignSales|canManageMembership/, 'crm-module.ts phải độc lập hoàn toàn với M1B.2 authority — không tái định nghĩa hay import các hàm business authority');
});

test('Campaign/Handoff API routes (distribute, campaigns handoff, telesale handoff) KHÔNG bị đụng — vẫn dùng canManageCampaign/isCrmAdmin/eligibleCampaignSales như cũ, không thêm crm-module vào business authorization', () => {
  const distributeSrc = readFileSync(resolve('src/app/api/campaigns/[id]/distribute/route.ts'), 'utf8');
  const handoffSrc = readFileSync(resolve('src/app/api/campaigns/[id]/members/[membershipId]/handoff/route.ts'), 'utf8');
  const telesaleSrc = readFileSync(resolve('src/app/api/crm/telesale/handoff/route.ts'), 'utf8');
  for (const src of [distributeSrc, handoffSrc, telesaleSrc]) {
    assert.doesNotMatch(src, /crm-module|isCrmModuleEnabled|canAccessCrmModule/, 'business authorization API routes không được import module toggle — hai authority phải tách biệt hoàn toàn');
  }
  assert.match(distributeSrc, /canManageCampaign\(user, campaign\)/);
  assert.match(handoffSrc, /canManageCampaign\(user, campaign\)/);
  assert.match(telesaleSrc, /canActOnHandoff\(/);
});

test('transactional-workflow.ts (M1B.2 Handoff/Pipeline transaction + cache-invalidation fix commit 43da3e7) không bị đụng bởi CRM Module Toggle — vẫn còn nguyên nhánh accept invalidate kh/pl', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.doesNotMatch(src, /crm-module|isCrmModuleEnabled/, 'transactional-workflow.ts không liên quan module toggle, không được import nó');
  assert.match(src, /if \(input\.action === 'accept'\) \{\s*\n\s*revalidateTag\('kh', \{\}\); invalidate\('gs:kh'\);/, 'fix cache-invalidation trước đó (commit 43da3e7) phải còn nguyên vẹn');
});

test('src/app/api/khach-hang/route.ts: business authorization (isCrmAdmin cho POST, canManageCustomer/canViewCustomer cho GET/PUT/DELETE) không bị nới lỏng hay thay bằng crm-module check', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/route.ts'), 'utf8');
  assert.doesNotMatch(src, /crm-module|isCrmModuleEnabled|canAccessCrmModule/, 'API route business authorization không được đụng tới module toggle — module OFF không nới lỏng/siết chặt quyền ghi dữ liệu, chỉ ẩn UI/page');
  assert.match(src, /canViewCustomer\(user, customer, projects\)/);
});
