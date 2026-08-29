import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// FIX — Sidebar ẩn mục "CSKH" với nhân viên CHỈ có quyền qua Campaign CSKH
// (Sale CSKH ở CampaignMembership.telesale_id, hoặc Leader ở
// Campaign.owner_id/owner_name), vì canPhanKhach (/api/crm-access) trước đây
// CHỈ tính theo mô hình Dự án cũ (DuAn.truong_nhom/ds_sale, KhachHang.
// telesale_phu_trach/sale_nhan_khach/sale_phu_trach) — không biết gì về
// Campaign. Root cause: Sidebar dùng canPhanKhach làm gate cho mục con
// "crm.cskh" (menu-registry.ts), trong khi /phan-khach/page.tsx tự nó chỉ
// cần vai_tro === 'Sale' — 2 gate lệch nhau.

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

// --- B. /api/crm-access/route.ts wiring ---

test('crm-access route: nhánh non-admin gọi hasCampaignCskhAccess(userData) và trả về trong response — KHÔNG nhét id giả vào phanKhachIds (vẫn giữ nguyên ý nghĩa Dự án cũ, dùng lọc dropdown "Theo Dự án")', () => {
  const src = readFileSync(resolve(CRM_ACCESS_ROUTE_PATH), 'utf8');
  assert.match(src, /import \{ hasCampaignCskhAccess \} from '@\/lib\/crm-funnel\/campaign';/);
  assert.match(src, /const hasCampaignAccess = await hasCampaignCskhAccess\(userData\);/);
  const responseStart = src.indexOf('return NextResponse.json({\n      canKH: false, phanKhachIds: accessibleIds');
  assert.ok(responseStart >= 0, 'phanKhachIds phải vẫn = accessibleIds (project-based), không đổi');
  const responseBody = src.slice(responseStart, responseStart + 300);
  assert.match(responseBody, /hasCampaignCskhAccess:\s*hasCampaignAccess/);
});

test('crm-access route: nhánh Admin (phanKhachIds: null) không cần gọi hasCampaignCskhAccess — Admin đã bypass hoàn toàn, không đổi hành vi cũ', () => {
  const src = readFileSync(resolve(CRM_ACCESS_ROUTE_PATH), 'utf8');
  const adminBranchStart = src.indexOf('if (isAdmin) {');
  const adminBranchEnd = src.indexOf('// Find projects this user is involved in', adminBranchStart);
  assert.ok(adminBranchStart >= 0 && adminBranchEnd > adminBranchStart);
  const adminBranch = src.slice(adminBranchStart, adminBranchEnd);
  assert.doesNotMatch(adminBranch, /hasCampaignCskhAccess/, 'nhánh Admin không cần đổi — vẫn bypass qua phanKhachIds: null như cũ');
});

// --- C. useCrmAccess.ts: canPhanKhach OR thêm hasCampaignCskhAccess ---

test('useCrmAccess.ts: canPhanKhach = (phanKhachIds null/không rỗng) HOẶC hasCampaignCskhAccess — Sidebar (canPhanKhach) giờ công nhận cả quyền qua Campaign, không chỉ Dự án cũ', () => {
  const src = readFileSync(resolve(USE_CRM_ACCESS_PATH), 'utf8');
  const fnStart = src.indexOf('const canPhanKhach =');
  assert.ok(fnStart >= 0);
  const fnBody = src.slice(fnStart, fnStart + 300);
  assert.match(fnBody, /phanKhachIds === null/);
  assert.match(fnBody, /Array\.isArray\(phanKhachIds\) && phanKhachIds\.length > 0/);
  assert.match(fnBody, /Boolean\(data\?\.hasCampaignCskhAccess\)/);
});

// --- D. Regression: phanKhachIds vẫn dùng ĐÚNG như cũ để lọc dropdown "Theo Dự án" ---

test('regression: /phan-khach/page.tsx accessibleProjects vẫn lọc theo ĐÚNG phanKhachIds cũ (không đổi ý nghĩa/logic) — chỉ Sidebar (canPhanKhach) thay đổi, không phải danh sách Dự án hiển thị', () => {
  const src = readFileSync(resolve(PHAN_KHACH_PATH), 'utf8');
  assert.match(src, /phanKhachIds === null \|\| \(Array\.isArray\(phanKhachIds\) && phanKhachIds\.includes\(project\.id_du_an\)\)/);
});

test('regression: /phan-khach/page.tsx canAccessPage (gate truy cập trang thật) không đổi — vẫn chỉ cần isAdmin || (crmEnabled && vai_tro Sale), KHÔNG phụ thuộc phanKhachIds/canPhanKhach (2 gate khác nhau, fix này không trộn lẫn)', () => {
  const src = readFileSync(resolve(PHAN_KHACH_PATH), 'utf8');
  assert.match(src, /const canAccessPage = isAdmin \|\| \(crmEnabled && user\?\.vai_tro === 'Sale'\);/);
});

test('regression: menu-registry.ts mục "crm.cskh" vẫn dùng đúng businessAccess: "canPhanKhach" (không đổi wiring registry/Sidebar, chỉ đổi NGUỒN dữ liệu canPhanKhach ở API/hook)', () => {
  const src = readFileSync(resolve('src/lib/menu-registry.ts'), 'utf8');
  assert.match(src, /key: 'crm\.cskh', label: 'CSKH', href: '\/phan-khach', icon: PhoneCall, businessAccess: 'canPhanKhach'/);
});
