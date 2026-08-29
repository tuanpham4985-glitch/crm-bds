import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// FIX — Sidebar ẩn mục "CSKH" với nhiều nhân viên vai_tro 'Sale' thật sự,
// vì canPhanKhach (/api/crm-access) trước đây CHỈ tính theo mô hình Dự án cũ
// (DuAn.truong_nhom/ds_sale, KhachHang.telesale_phu_trach/sale_nhan_khach/
// sale_phu_trach). Root cause có 2 lớp:
//  1. Không biết gì về Campaign CSKH (CampaignMembership.telesale_id,
//     Campaign.owner_id/owner_name).
//  2. Kể cả sau khi thêm (1), 1 Sale CHƯA được gán bất kỳ data nào (Dự án
//     lẫn Campaign — VD nhân viên mới) vẫn bị ẩn menu, dù /phan-khach tự nó
//     (canAccessPage) đã cho MỌI vai_tro==='Sale' vào thẳng không điều kiện.
//
// REMEDIATION (Unify CSKH Access Authority) tiếp theo: 2 công thức
// (Sidebar's canPhanKhach 3-way OR vs. /phan-khach's canAccessPage tự viết
// isAdmin||(crmEnabled&&vai_tro==='Sale')) có thể LỆCH NHAU cho 1 Leader
// Campaign không có vai_tro 'Sale' — Sidebar cho thấy mục CSKH (qua nhánh
// Campaign) nhưng trang lại chặn (canAccessPage cũ không có nhánh Campaign).
// Fix: cả 2 giờ derive từ ĐÚNG 1 hàm thuần canAccessCskh() (crm-access-
// authority.ts), resolve 1 lần duy nhất server-side — xem
// crm-access-authority.test.ts cho test trực tiếp trên hàm đó.

const CAMPAIGN_LIB_PATH = 'src/lib/crm-funnel/campaign.ts';
const CRM_ACCESS_ROUTE_PATH = 'src/app/api/crm-access/route.ts';
const USE_CRM_ACCESS_PATH = 'src/hooks/useCrmAccess.ts';
const PHAN_KHACH_PATH = 'src/app/phan-khach/page.tsx';

// --- A. campaign.ts: hasCampaignCskhAccess ---

test('hasCampaignCskhAccess: check CẢ 2 tín hiệu Campaign — CampaignMembership.telesale_id (Sale CSKH) VÀ Campaign.owner_id/owner_name (Leader) — thiếu 1 trong 2 sẽ bỏ sót đúng người', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function hasCampaignCskhAccess');
  assert.ok(fnStart >= 0);
  const fnBody = src.slice(fnStart, fnStart + 700);
  assert.match(fnBody, /campaignMembership\.count\(\{\s*where:\s*\{\s*telesale_id:\s*user\.id_nhan_vien\s*\}\s*\}\)/);
  assert.match(fnBody, /campaign\.count\(\{\s*where:\s*\{\s*OR:\s*\[\{\s*owner_id:\s*user\.id_nhan_vien\s*\},\s*\{\s*owner_name:\s*user\.ho_ten\s*\}\]\s*\}\s*\}\)/);
  assert.match(fnBody, /return membershipCount > 0 \|\| campaignCount > 0;/);
});

test('hasCampaignCskhAccess: KHÔNG throw khi Postgres CRM chưa bật — trả false gracefully (Sidebar phải luôn render được, kể cả deployment chưa bật Campaign)', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function hasCampaignCskhAccess');
  const fnBody = src.slice(fnStart, fnStart + 300);
  assert.match(fnBody, /if\s*\(!isPostgresEnabled\('crm'\) \|\| !process\.env\.DATABASE_URL\) return false;/);
  assert.doesNotMatch(fnBody, /assertTransactionalCrm\(\)/, 'hàm này phải KHÔNG throw (assertTransactionalCrm sẽ throw) — chỉ trả false, không được làm sập /api/crm-access');
});

// --- B. /api/crm-access/route.ts wiring — nguồn thật DUY NHẤT, qua canAccessCskh() ---

test('crm-access route: nhánh non-admin resolve canPhanKhach qua canAccessCskh() (crm-access-authority.ts) — KHÔNG tự viết lại công thức OR ở đây nữa', () => {
  const src = readFileSync(resolve(CRM_ACCESS_ROUTE_PATH), 'utf8');
  assert.match(src, /import \{ hasCampaignCskhAccess \} from '@\/lib\/crm-funnel\/campaign';/);
  assert.match(src, /import \{ isCrmModuleEnabled \} from '@\/lib\/crm-module';/);
  assert.match(src, /import \{ canAccessCskh \} from '@\/lib\/crm-access-authority';/);
  assert.match(src, /const \[hasCampaignAccess, crmModuleEnabled\] = await Promise\.all\(\[\s*hasCampaignCskhAccess\(userData\),\s*isCrmModuleEnabled\(\),\s*\]\);/);
  assert.match(src, /const canPhanKhach = canAccessCskh\(\{/);
  const callStart = src.indexOf('const canPhanKhach = canAccessCskh({');
  const callBody = src.slice(callStart, callStart + 400);
  assert.match(callBody, /isAdmin:\s*false,/);
  assert.match(callBody, /crmModuleEnabled,/);
  assert.match(callBody, /vaiTro:\s*userData\.vai_tro,/);
  assert.match(callBody, /hasLegacyProjectAccess:\s*accessibleIds\.length > 0,/);
  assert.match(callBody, /hasCampaignCskhAccess:\s*hasCampaignAccess,/);
  const responseStart = src.indexOf('return NextResponse.json({\n      canKH: false, phanKhachIds: accessibleIds');
  assert.ok(responseStart >= 0, 'phanKhachIds phải vẫn = accessibleIds (project-based), không đổi');
  const responseBody = src.slice(responseStart, responseStart + 200);
  assert.match(responseBody, /canQualityDashboard:\s*scope\.canManageQuality,\s*canPhanKhach/);
});

test('crm-access route: nhánh Admin (phanKhachIds: null) không đổi — vẫn bypass hoàn toàn qua hook (phanKhachIds === null), không cần gọi canAccessCskh riêng', () => {
  const src = readFileSync(resolve(CRM_ACCESS_ROUTE_PATH), 'utf8');
  const adminBranchStart = src.indexOf('if (isAdmin) {');
  const adminBranchEnd = src.indexOf('// Find projects this user is involved in', adminBranchStart);
  assert.ok(adminBranchStart >= 0 && adminBranchEnd > adminBranchStart);
  const adminBranch = src.slice(adminBranchStart, adminBranchEnd);
  assert.match(adminBranch, /phanKhachIds:\s*null/);
  assert.doesNotMatch(adminBranch, /hasCampaignCskhAccess|canPhanKhach|canAccessCskh/, 'nhánh Admin không cần đổi — vẫn bypass qua phanKhachIds: null như cũ');
});

// --- C. useCrmAccess.ts: canPhanKhach dùng thẳng field server đã tính đủ (non-admin) ---

test('useCrmAccess.ts: canPhanKhach = (phanKhachIds === null, Admin) HOẶC data.canPhanKhach (server đã resolve qua canAccessCskh cho non-admin) — không tự suy diễn lại logic ở client', () => {
  const src = readFileSync(resolve(USE_CRM_ACCESS_PATH), 'utf8');
  assert.match(src, /const canPhanKhach = phanKhachIds === null \|\| Boolean\(data\?\.canPhanKhach\);/);
});

// --- D. /phan-khach/page.tsx: canAccessPage giờ ĐỌC THẲNG canPhanKhach — cùng nguồn với Sidebar ---

test('regression: /phan-khach/page.tsx accessibleProjects vẫn lọc theo ĐÚNG phanKhachIds cũ (không đổi ý nghĩa/logic) — không bị unify hoá lẫn với canPhanKhach', () => {
  const src = readFileSync(resolve(PHAN_KHACH_PATH), 'utf8');
  assert.match(src, /phanKhachIds === null \|\| \(Array\.isArray\(phanKhachIds\) && phanKhachIds\.includes\(project\.id_du_an\)\)/);
});

test('/phan-khach/page.tsx: canAccessPage = canPhanKhach (đọc thẳng từ useCrmAccess) — cùng NGUỒN THẬT với Sidebar, không còn công thức thứ 2 (đây là mục tiêu chính của remediation "Unify CSKH Access Authority")', () => {
  const src = readFileSync(resolve(PHAN_KHACH_PATH), 'utf8');
  assert.match(src, /const \{ phanKhachIds, canPhanKhach, isLoading: crmAccessLoading \} = useCrmAccess\(\);/);
  assert.match(src, /const canAccessPage = canPhanKhach;/);
  assert.doesNotMatch(src, /vai_tro === 'Sale'\)\)/, 'canAccessPage không được tự check vai_tro nữa — chỉ canAccessCskh() (server) mới được làm việc đó');
});

test('/phan-khach/page.tsx: chờ đủ CẢ 3 hook (auth/crmModule/crmAccess) loading xong trước khi quyết định canAccessPage — tránh flash "Không có quyền" sai trong lúc canPhanKhach (async, qua network) chưa về kịp', () => {
  const src = readFileSync(resolve(PHAN_KHACH_PATH), 'utf8');
  assert.match(src, /if \(authLoading \|\| crmModuleLoading \|\| crmAccessLoading\) return null;/);
});

test('regression: menu-registry.ts mục "crm.cskh" vẫn dùng đúng businessAccess: "canPhanKhach" (không đổi wiring registry/Sidebar, chỉ đổi NGUỒN dữ liệu canPhanKhach ở API/hook)', () => {
  const src = readFileSync(resolve('src/lib/menu-registry.ts'), 'utf8');
  assert.match(src, /key: 'crm\.cskh', label: 'CSKH', href: '\/phan-khach', icon: PhoneCall, businessAccess: 'canPhanKhach'/);
});
