import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CUSTOMER ADMIN CONTROLS — /khach-hang chỉ Admin nhìn thấy 6 control quản
// trị (Quản lý Sheet, Lịch sử Import, Quản lý Campaign, Sync từ phễu, Import
// Excel, Thêm khách hàng). Đây KHÔNG chỉ là cosmetic UI hiding — mọi operation
// quản trị tương ứng đã được server enforce Admin-only từ trước (xem các test
// bên dưới); phần UI ở đây chỉ là lớp che thêm, không phải authority duy nhất.

const PAGE_PATH = 'src/app/khach-hang/page.tsx';

// --- 1. UI: 6 control quản trị phải nằm trong 1 khối {isAdmin && (...)} ---

test('khach-hang/page.tsx: action bar header có đúng 1 khối {isAdmin && (<>...</>)} bọc 5 control (Quản lý Sheet, Lịch sử Import, Quản lý Campaign, Sync từ phễu, Import Excel + input file ẩn của nó)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const blockStart = src.indexOf('{isAdmin && (');
  assert.ok(blockStart >= 0, 'phải có khối {isAdmin && (...)} bọc action bar quản trị');
  const closeMatch = /\r?\n\s*<\/>\r?\n\s*\)\}/.exec(src.slice(blockStart));
  assert.ok(closeMatch, 'phải đóng đúng khối Fragment isAdmin của action bar');
  const blockEnd = blockStart + closeMatch!.index;
  const block = src.slice(blockStart, blockEnd);

  assert.match(block, /Quản lý Sheet/);
  assert.match(block, /Lịch sử Import/);
  assert.match(block, /Quản lý Campaign/);
  assert.match(block, /Sync từ phễu/);
  assert.match(block, /Import Excel/);
  // input file ẩn kích hoạt bởi nút Import Excel cũng phải nằm trong khối
  // Admin-only — nếu để ngoài, non-admin vẫn có 1 <input type=file> "mồ côi"
  // trong DOM (không hại vì onChange gọi API đã Admin-gate, nhưng vẫn nên gọn).
  assert.match(block, /ref=\{excelInputRef\}/);
});

// ĐÃ CẬP NHẬT (Private Sales Group task, locked business decision section A):
// "Thêm khách hàng" giờ hiển thị cho MỌI user CRM hợp lệ, KHÔNG còn Admin-only
// — đây là thay đổi CHỦ ĐÍCH, ghi đè quyết định "Admin-only" cũ của chính test
// này (xem tests/crm/private-group-api.test.ts cho test khoá hành vi mới đầy
// đủ hơn: server-side gate + self-assign sale_phu_trach cho non-admin).
test('khach-hang/page.tsx: nút "Thêm khách hàng" (tạo mới, header) KHÔNG còn bọc bởi {isAdmin && (...)} — hiện cho mọi user hợp lệ; nút "Sửa" theo dòng vẫn giữ nguyên authority cũ (canManageCustomer/isDirectManager, không đổi)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const createBtnIdx = src.indexOf('openCreate}');
  assert.ok(createBtnIdx >= 0, 'phải tìm được nút gọi openCreate');
  const before = src.slice(Math.max(0, createBtnIdx - 200), createBtnIdx);
  assert.doesNotMatch(before, /\{isAdmin && \(/, 'nút "Thêm khách hàng" không còn được gate bởi isAdmin (locked business decision mới)');

  // Nút "Sửa" ở mỗi dòng (openEdit) KHÔNG được đụng tới — đây là business
  // authority hiện có (canManageCustomer/isDirectManager ở server), không nằm
  // trong phạm vi thay đổi của task này.
  const editBtnIdx = src.indexOf('openEdit(kh)');
  assert.ok(editBtnIdx >= 0);
  const editBefore = src.slice(Math.max(0, editBtnIdx - 300), editBtnIdx);
  assert.doesNotMatch(editBefore, /isAdmin &&/, 'nút "Sửa" theo dòng không được gate thêm bởi isAdmin — giữ nguyên authority cũ (canManageCustomer/isDirectManager, enforce ở server PUT /api/khach-hang)');
});

test('khach-hang/page.tsx: 2 nút bulk-action theo lựa chọn ("Tạo Campaign", "Xóa đã chọn") KHÔNG bị gate CHỈ bởi isAdmin — vẫn giữ nhánh selectedIds.size > 0 hiện có cho non-admin (Leader/Sale vẫn thêm được data đã chọn vào Campaign có sẵn/xóa data của mình, task này không đổi authority chọn-nhiều)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const addToCampaignIdx = src.indexOf('Tạo Campaign (');
  const bulkDeleteIdx = src.indexOf('Xóa đã chọn (');
  assert.ok(addToCampaignIdx >= 0 && bulkDeleteIdx >= 0);
  const beforeAdd = src.slice(Math.max(0, addToCampaignIdx - 250), addToCampaignIdx);
  const beforeDel = src.slice(Math.max(0, bulkDeleteIdx - 250), bulkDeleteIdx);
  // "Tạo Campaign" giờ có thêm nhánh OR isAdmin-only (chọn tất cả N khách
  // hàng phù hợp bộ lọc — feature mới, Admin-only theo spec) — nhưng nhánh
  // selectedIds.size > 0 gốc (non-admin thêm data đã chọn vào Campaign có
  // sẵn) PHẢI vẫn còn nguyên, không bị thay thế hẳn bằng isAdmin.
  assert.match(beforeAdd, /selectedIds\.size > 0/);
  assert.match(beforeDel, /selectedIds\.size > 0/);
  // "Xóa đã chọn" (bulk-delete) không liên quan gì tới feature Campaign mới —
  // tuyệt đối không được có điều kiện isAdmin nào chen vào (giữ nguyên
  // authority chọn-nhiều cũ, chỉ Admin/Ban lãnh đạo đã tự enforce server-side).
  assert.doesNotMatch(beforeDel, /isAdmin/, '"Xóa đã chọn" không được thêm điều kiện isAdmin');
});

// --- 2. UI: empty-state không hướng dẫn non-admin bấm nút họ không thấy ---

// ĐÃ CẬP NHẬT — gợi ý bấm nút giờ hiện cho MỌI user (nút "Thêm khách hàng"
// không còn Admin-only, xem test phía trên) — không còn lý do ẩn gợi ý này
// với non-admin vì họ giờ CÓ thấy + bấm được nút đó.
test('khach-hang/page.tsx: empty-state luôn hiện "Chưa có khách hàng" VÀ gợi ý bấm "Thêm khách hàng" cho MỌI user (không gate isAdmin nữa)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const emptyStateIdx = src.indexOf('className="empty-state"');
  assert.ok(emptyStateIdx >= 0);
  const emptyStateBlock = src.slice(emptyStateIdx, emptyStateIdx + 400);
  assert.match(emptyStateBlock, /<h3>Chưa có khách hàng<\/h3>/, 'tiêu đề trung tính phải luôn hiện, không phụ thuộc isAdmin');
  assert.match(emptyStateBlock, /<p>Nhấn &quot;Thêm khách hàng&quot; để tạo mới<\/p>/, 'gợi ý bấm nút phải hiện cho mọi user (nút đã hiện cho mọi user)');
  assert.doesNotMatch(emptyStateBlock, /\{isAdmin && <p>Nhấn/, 'gợi ý không còn được gate bởi isAdmin');
});

// --- 3. Server: audit Admin-only enforcement cho từng operation quản trị ---
// Mỗi route dưới đây phải tự enforce isCrmAdmin — KHÔNG được phép chỉ dựa vào
// việc ẩn nút ở FE (xem comment tương tự tại import-batches/[id]/delete/route.ts).

// POST /api/khach-hang (Thêm khách hàng) ĐÃ RỜI khỏi danh sách Admin-only này
// (locked business decision mới, section A) — xem
// tests/crm/private-group-api.test.ts cho test khoá hành vi mới đầy đủ
// (không còn isCrmAdmin-only, nhưng vẫn 401 nếu chưa đăng nhập + non-admin
// tự động self-assign sale_phu_trach, không tin client).
const ADMIN_ONLY_ROUTES: { file: string; label: string; guardCount: number }[] = [
  { file: 'src/app/api/khach-hang/sync-leads/route.ts', label: 'POST /api/khach-hang/sync-leads (Sync từ phễu)', guardCount: 1 },
  { file: 'src/app/api/khach-hang/import-excel/route.ts', label: 'POST /api/khach-hang/import-excel (Import Excel)', guardCount: 1 },
  { file: 'src/app/api/khach-hang/import-batches/route.ts', label: 'GET /api/khach-hang/import-batches (Lịch sử Import — list)', guardCount: 1 },
  { file: 'src/app/api/khach-hang/import-batches/[id]/route.ts', label: 'GET /api/khach-hang/import-batches/[id] (Lịch sử Import — chi tiết)', guardCount: 1 },
  { file: 'src/app/api/khach-hang/import-batches/[id]/delete/route.ts', label: 'POST /api/khach-hang/import-batches/[id]/delete (Lịch sử Import — xóa batch)', guardCount: 1 },
  { file: 'src/app/api/phan-khach/configs/route.ts', label: '/api/phan-khach/configs GET/POST/DELETE (Quản lý Sheet nguồn)', guardCount: 3 },
  { file: 'src/app/api/phan-khach/probe/route.ts', label: 'POST /api/phan-khach/probe (Quản lý Sheet — kiểm tra kết nối)', guardCount: 1 },
  { file: 'src/app/api/campaigns/[id]/delete-preflight/route.ts', label: 'GET /api/campaigns/[id]/delete-preflight (Quản lý Campaign — preflight xóa)', guardCount: 1 },
];

for (const { file, label, guardCount } of ADMIN_ONLY_ROUTES) {
  test(`${label}: enforce isCrmAdmin server-side, đủ ${guardCount} chỗ gate — non-admin gọi thẳng API (bypass UI) vẫn bị 403`, () => {
    const src = readFileSync(resolve(file), 'utf8');
    assert.match(src, /import \{[^}]*\bisCrmAdmin\b[^}]*\} from '@\/lib\/crm-auth';/, `${file} phải import isCrmAdmin từ crm-auth.ts (không tự viết check role riêng)`);
    const guardMatches = src.match(/if\s*\(!isCrmAdmin\(user\)\)/g) || [];
    assert.equal(guardMatches.length, guardCount, `${file} phải có đúng ${guardCount} chỗ gate isCrmAdmin(user)`);
    assert.match(src, /status:\s*403/, `${file} phải trả 403 khi không phải Admin`);
  });
}

test('DELETE /api/campaigns/[id] (Quản lý Campaign — xóa Campaign thật): vẫn Admin-only tuyệt đối (isCrmAdmin), KHÔNG dùng canManageCampaign — Leader/owner không phải Admin không tự xóa được Campaign của mình', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/route.ts'), 'utf8');
  const deleteStart = src.indexOf('export async function DELETE');
  assert.ok(deleteStart >= 0);
  const deleteBody = src.slice(deleteStart, deleteStart + 700);
  assert.match(deleteBody, /if\s*\(!isCrmAdmin\(user\)\)/, 'DELETE Campaign phải gate bằng isCrmAdmin');
  assert.doesNotMatch(deleteBody, /canManageCampaign\(/, 'DELETE Campaign KHÔNG được nới ra canManageCampaign (sẽ cho phép Leader tự xóa Campaign của mình)');
  assert.match(deleteBody, /status:\s*403/);
});

// --- 4. Regression: Campaign Leader/Sale CSKH — Handoff/Pipeline authority KHÔNG bị đụng ---
// Task này chỉ thêm Admin-only UI + audit; PUT Campaign (sửa field thường),
// distribute, members, interaction, qualification, handoff route phải giữ
// NGUYÊN canManageCampaign/canManageMembership/isMembershipDirectManager —
// không được siết xuống isCrmAdmin-only.

const CAMPAIGN_CSKH_AUTHORITY_ROUTES = [
  { file: 'src/app/api/campaigns/[id]/route.ts', label: 'PUT Campaign (sửa field thường)', mustContain: 'canManageCampaign(' },
  { file: 'src/app/api/campaigns/[id]/distribute/route.ts', label: 'POST distribute', mustContain: 'canManageCampaign(' },
  { file: 'src/app/api/campaigns/[id]/members/route.ts', label: 'GET members', mustContain: 'canManageCampaign(' },
  { file: 'src/app/api/campaigns/[id]/members/[membershipId]/handoff/route.ts', label: 'Handoff', mustContain: 'canManageCampaign(' },
  { file: 'src/app/api/campaigns/[id]/members/[membershipId]/interaction/route.ts', label: 'Interaction (CSKH)', mustContain: 'canManageMembership(' },
  { file: 'src/app/api/campaigns/[id]/members/[membershipId]/qualification/route.ts', label: 'Qualification (CSKH)', mustContain: 'canManageMembership(' },
];

for (const { file, label, mustContain } of CAMPAIGN_CSKH_AUTHORITY_ROUTES) {
  test(`regression: ${label} (${file}) vẫn dùng đúng authority cũ (${mustContain.replace('(', '')}) — Admin-only UI trên /khach-hang KHÔNG thu hồi business authority của Campaign Leader/Sale CSKH ở flow này`, () => {
    const src = readFileSync(resolve(file), 'utf8');
    assert.match(src, new RegExp(mustContain.replace('(', '\\(')), `${file} phải còn gọi ${mustContain}`);
  });
}

test('regression: PUT/DELETE /api/khach-hang (Sửa/Xóa khách hàng theo dòng) vẫn dùng canManageCustomer/isDirectManager — KHÔNG bị siết thành isCrmAdmin-only bởi task Admin-only-controls này', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/route.ts'), 'utf8');
  const putStart = src.indexOf('export async function PUT');
  const deleteStart = src.indexOf('export async function DELETE');
  const putBody = src.slice(putStart, deleteStart);
  const deleteBody = src.slice(deleteStart);
  assert.match(putBody, /canManageCustomer\(user, current, projects\) && !isDirectManager\(user, current, employees\)/);
  assert.match(deleteBody, /canManageCustomer\(user, current, projects\) && !isDirectManager\(user, current, employees\)/);
});

test('regression: GET /api/campaigns (list, dùng bởi nhiều flow Campaign khác ngoài "Quản lý Campaign" admin panel) vẫn CHỈ yêu cầu đăng nhập, không bị siết thành Admin-only — tránh phá CSKH flow khác đang dùng chung endpoint này', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/route.ts'), 'utf8');
  const getStart = src.indexOf('export async function GET');
  const postStart = src.indexOf('export async function POST');
  const getBody = src.slice(getStart, postStart);
  assert.doesNotMatch(getBody, /isCrmAdmin/, 'GET /api/campaigns không được thêm gate isCrmAdmin — vẫn là list read-only cho mọi user đã đăng nhập');
});
