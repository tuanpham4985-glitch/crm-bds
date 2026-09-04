import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Cùng kỹ thuật đã dùng ở tests/crm/campaign-assignment-visibility.test.ts:
// đọc SOURCE THẬT của route/schema rồi assert bằng regex/substring — dùng cho
// những invariant KHÔNG unit-test được bằng pure function (server auth gate
// cần session/DB thật, schema constraint là DDL) nhưng vẫn cần khoá lại để
// không ai vô tình gỡ mất khi sửa code sau này.

const SCHEMA_PATH = 'prisma/schema.prisma';
const KHACH_HANG_ROUTE_PATH = 'src/app/api/khach-hang/route.ts';
const PRIVATE_GROUP_LIB_PATH = 'src/lib/crm-funnel/private-group.ts';
const GROUPS_ROUTE_PATH = 'src/app/api/private-groups/route.ts';
const GROUP_DETAIL_ROUTE_PATH = 'src/app/api/private-groups/[id]/route.ts';
const MEMBERS_ROUTE_PATH = 'src/app/api/private-groups/[id]/members/route.ts';
const CUSTOMERS_ROUTE_PATH = 'src/app/api/private-groups/[id]/customers/route.ts';
const REASSIGN_ROUTE_PATH = 'src/app/api/private-groups/[id]/customers/[relationId]/route.ts';
const MINE_ROUTE_PATH = 'src/app/api/private-groups/mine/route.ts';
const PRIVATE_GROUP_PANEL_PATH = 'src/components/crm/PrivateGroupPanel.tsx';
const KHACH_HANG_PAGE_PATH = 'src/app/khach-hang/page.tsx';
const GROUP_IMPORT_EXCEL_ROUTE_PATH = 'src/app/api/private-groups/[id]/customers/import-excel/route.ts';
const KHACH_HANG_IMPORT_EXCEL_ROUTE_PATH = 'src/app/api/khach-hang/import-excel/route.ts';
const GROUP_DISTRIBUTE_ROUTE_PATH = 'src/app/api/private-groups/[id]/customers/distribute/route.ts';
const CAMPAIGN_LIB_PATH = 'src/lib/crm-funnel/campaign.ts';

function read(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

// ─── #1/#2: PrivateGroup schema — đúng 1 Leader/nhóm bởi THIẾT KẾ field ─────

test('schema: PrivateGroup.leader_id là 1 field String ĐƠN (không phải list/relation nhiều dòng) -> "group có >1 Leader" KHÔNG THỂ xảy ra bởi chính schema, không cần validate riêng', () => {
  const schema = read(SCHEMA_PATH);
  const modelStart = schema.indexOf('model PrivateGroup {');
  const modelEnd = schema.indexOf('\n}', modelStart);
  const modelBody = schema.slice(modelStart, modelEnd);
  assert.match(modelBody, /leader_id\s+String\s*$/m, 'leader_id phải là String đơn, không phải String[] hay quan hệ 1-nhiều');
  assert.doesNotMatch(modelBody, /leaders\s+PrivateGroupLeader/, 'không được có bảng leaders riêng (sẽ mở khả năng >1 Leader)');
});

test('schema: PrivateGroupMember KHÔNG có field đánh dấu "is_leader" hay tương tự — Leader xác định DUY NHẤT qua PrivateGroup.leader_id, tránh 2 nguồn sự thật', () => {
  const schema = read(SCHEMA_PATH);
  const modelStart = schema.indexOf('model PrivateGroupMember {');
  const modelEnd = schema.indexOf('\n}', modelStart);
  const modelBody = schema.slice(modelStart, modelEnd);
  assert.doesNotMatch(modelBody, /is_leader|role\s+String/i);
});

test('schema: private_group_customers.customer_id UNIQUE TOÀN CỤC — 1 Customer chỉ thuộc đúng 1 Private Group tại 1 thời điểm, enforce ở DB', () => {
  const schema = read(SCHEMA_PATH);
  const modelStart = schema.indexOf('model PrivateGroupCustomer {');
  const modelEnd = schema.indexOf('\n}', modelStart);
  const modelBody = schema.slice(modelStart, modelEnd);
  assert.match(modelBody, /customer_id\s+String\s+@unique/);
});

test('schema: PrivateGroup/PrivateGroupMember/PrivateGroupCustomer KHÔNG @relation tới KhachHang/NhanVien — customer_id/leader_id/employee_id là string ref thuần (đúng convention CampaignMembership/CrmHandoff)', () => {
  const schema = read(SCHEMA_PATH);
  const start = schema.indexOf('model PrivateGroup {');
  const end = schema.indexOf('model CrmPipelineLink {');
  const section = schema.slice(start, end);
  assert.doesNotMatch(section, /@relation\(fields:\s*\[(customer_id|leader_id|employee_id)\]/);
});

// ─── #8/#9/#10: createManualCustomerWithGroupLink — không tạo duplicate,
// không mutate Customer/Campaign/Handoff/Pipeline đã tồn tại ──────────────

test('private-group.ts: dedupe theo phoneKey TRƯỚC KHI tạo, throw DuplicatePhoneError nếu trùng — không tạo Customer thứ 2 (test bắt buộc #8)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function createManualCustomerWithGroupLink');
  const fnBody = src.slice(fnStart, fnStart + 2500);
  const dedupeIdx = fnBody.indexOf('throw new DuplicatePhoneError()');
  const createIdx = fnBody.indexOf('tx.khachHang.create(');
  assert.ok(dedupeIdx > -1 && createIdx > -1 && dedupeIdx < createIdx, 'phải throw DuplicatePhoneError TRƯỚC khi gọi tx.khachHang.create');
});

test('private-group.ts: SERIALIZABLE isolation cho toàn bộ dedupe+create+group-link — concurrency-safe cho 2 request cùng nhập 1 SĐT', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  assert.match(src, /Prisma\.TransactionIsolationLevel\.Serializable/);
  const fnStart = src.indexOf('export async function createManualCustomerWithGroupLink');
  const fnBody = src.slice(fnStart, fnStart + 300);
  assert.match(fnBody, /return serializable\(async tx =>/);
});

test('private-group.ts: KHÔNG có bất kỳ lệnh ghi nào vào KhachHang đã tồn tại (chỉ .create, không .update/.upsert) — không thể silently steal/reassign Customer cũ (test bắt buộc #9)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  assert.doesNotMatch(src, /tx\.khachHang\.update/);
  assert.doesNotMatch(src, /tx\.khachHang\.upsert/);
  assert.doesNotMatch(src, /prisma\.khachHang\.update/);
  assert.doesNotMatch(src, /prisma\.khachHang\.upsert/);
});

test('private-group.ts: KHÔNG đụng tới campaignMembership/crmHandoff/pipeline — Private Group hoàn toàn tách biệt khỏi Campaign/Handoff/Pipeline (test bắt buộc #10)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  assert.doesNotMatch(src, /\.campaignMembership\./);
  assert.doesNotMatch(src, /\.crmHandoff\./);
  assert.doesNotMatch(src, /\.pipeline\./);
});

test('private-group.ts: reassignGroupCustomer CHỈ đổi assigned_to_id/name trên PrivateGroupCustomer — KHÔNG đụng KhachHang.sale_phu_trach (2 authority độc lập, xem comment schema)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function reassignGroupCustomer');
  const fnBody = src.slice(fnStart, fnStart + 500);
  assert.doesNotMatch(fnBody, /khachHang/);
  assert.match(fnBody, /privateGroupCustomer\.updateMany/);
});

// ─── #11: Authorization SERVER-SIDE — mọi route phải tự check quyền, không
// chỉ dựa vào UI ẩn/hiện nút ──────────────────────────────────────────────

test('POST /api/khach-hang: KHÔNG còn gate isCrmAdmin-only — mọi user đã đăng nhập tạo được (locked business decision A), nhưng vẫn PHẢI 401 nếu chưa đăng nhập', () => {
  const src = read(KHACH_HANG_ROUTE_PATH);
  const fnStart = src.indexOf('export async function POST(');
  const fnEnd = src.indexOf('\nexport async function PUT(');
  const fnBody = src.slice(fnStart, fnEnd);
  assert.doesNotMatch(fnBody, /if\s*\(!isCrmAdmin\(user\)\)/, 'POST không còn được chặn Admin-only');
  assert.match(fnBody, /if\s*\(!user\)\s*return NextResponse\.json\(\{ success: false, error: 'Chưa đăng nhập' \}, \{ status: 401 \}\);/);
});

test('POST /api/khach-hang: non-admin LUÔN tự gán sale_phu_trach = chính mình (ho_ten), KHÔNG tin body.sale_phu_trach client gửi — chặn gán khách cho đồng nghiệp không có quyền', () => {
  const src = read(KHACH_HANG_ROUTE_PATH);
  const fnStart = src.indexOf('export async function POST(');
  const fnEnd = src.indexOf('\nexport async function PUT(');
  const fnBody = src.slice(fnStart, fnEnd);
  assert.match(fnBody, /const sale_phu_trach = isCrmAdmin\(user\) \? \(body\.sale_phu_trach \|\| ''\) : user\.ho_ten;/);
});

test('POST /api/khach-hang: DuplicatePhoneError từ private-group.ts được map đúng 409, không lộ thành 500', () => {
  const src = read(KHACH_HANG_ROUTE_PATH);
  assert.match(src, /if \(err instanceof DuplicatePhoneError\)/);
  const idx = src.indexOf('if (err instanceof DuplicatePhoneError)');
  const snippet = src.slice(idx, idx + 200);
  assert.match(snippet, /status:\s*409/);
});

test('POST /api/private-groups: gate canCreatePrivateGroup (Admin-only) TRƯỚC khi tạo — direct API call của non-admin bị chặn, không chỉ ẩn nút UI (test bắt buộc #11)', () => {
  const src = read(GROUPS_ROUTE_PATH);
  const fnStart = src.indexOf('export async function POST(');
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.match(fnBody, /if\s*\(!canCreatePrivateGroup\(user\)\)/);
  assert.match(fnBody, /status:\s*403/);
});

test('GET /api/private-groups: kết quả lọc qua filterPrivateGroupsForUser TRƯỚC KHI trả về — server tự lọc, không trả nguyên danh sách cho client tự lọc', () => {
  const src = read(GROUPS_ROUTE_PATH);
  const fnStart = src.indexOf('export async function GET(');
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.match(fnBody, /filterPrivateGroupsForUser\(user, groups, members\)/);
});

test('PATCH /api/private-groups/[id]: đổi Leader (leader_id/leader_name) yêu cầu canChangePrivateGroupLeader (Admin-only) — Leader hiện tại không tự đổi Leader nhóm mình', () => {
  const src = read(GROUP_DETAIL_ROUTE_PATH);
  assert.match(src, /if\s*\(touchesLeader && !canChangePrivateGroupLeader\(user\)\)/);
});

test('POST+DELETE /api/private-groups/[id]/members: cả 2 đều gate canManagePrivateGroupMembers TRƯỚC khi ghi (test bắt buộc #11)', () => {
  const src = read(MEMBERS_ROUTE_PATH);
  const matches = src.match(/if\s*\(!canManagePrivateGroupMembers\(user, group\)\)/g) || [];
  assert.equal(matches.length, 2, 'phải có đúng 2 chỗ gate (POST và DELETE)');
});

test('GET /api/private-groups/[id]/customers: filter qua filterGroupCustomersForUser TRƯỚC khi trả — CHÍNH LÀ nơi enforce READ policy server-side (NEW: group membership = group-wide READ, test bắt buộc #11)', () => {
  const src = read(CUSTOMERS_ROUTE_PATH);
  assert.match(src, /filterGroupCustomersForUser\(user, group, members, relations\)/);
  assert.match(src, /if\s*\(!canViewPrivateGroup\(user, group, members\)\)/);
});

test('PATCH /api/private-groups/[id]/customers/[relationId]: gate canReassignGroupCustomer (Admin/Leader) + validate assignee PHẢI là Leader/member của ĐÚNG nhóm này', () => {
  const src = read(REASSIGN_ROUTE_PATH);
  assert.match(src, /if\s*\(!canReassignGroupCustomer\(user, group\)\)/);
  assert.match(src, /assigned_to_id === group\.leader_id \|\| members\.some\(m => m\.employee_id === assigned_to_id\)/);
});

// ─── Multi-group manual customer entry (task hiện tại) ──────────────────────
// Employee CÓ THỂ thuộc nhiều Nhóm riêng cùng lúc — resolveManualCustomerGroup
// (unit-tested đầy đủ trong private-group-auth.test.ts) là authority THUẦN;
// các test dưới đây khoá lại cách createManualCustomerWithGroupLink/route SỬ
// DỤNG đúng authority đó (order, error mapping, atomicity, reuse).

test('private-group.ts: group resolution (resolveManualCustomerGroup) chạy TRƯỚC dedupe SĐT và TRƯỚC create Customer — fail-fast, không ghi DB nếu actor chưa hợp lệ về group (test bắt buộc #4/#6/#10)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function createManualCustomerWithGroupLink');
  const fnBody = src.slice(fnStart, fnStart + 2500);
  const resolveIdx = fnBody.indexOf('resolveManualCustomerGroup(');
  const dedupeIdx = fnBody.indexOf('throw new DuplicatePhoneError()');
  const createIdx = fnBody.indexOf('tx.khachHang.create(');
  assert.ok(resolveIdx > -1 && dedupeIdx > -1 && createIdx > -1, 'phải tìm thấy cả 3 mốc trong function body');
  assert.ok(resolveIdx < dedupeIdx && dedupeIdx < createIdx, 'thứ tự PHẢI là: resolve group -> dedupe SĐT -> create Customer');
});

test('private-group.ts: "required" (thiếu groupId khi >=2 nhóm) và "forbidden" (groupId không thuộc actor) đều throw TRƯỚC dòng dedupe — không tạo Customer khi group không hợp lệ (test bắt buộc #4/#6)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function createManualCustomerWithGroupLink');
  const fnBody = src.slice(fnStart, fnStart + 2500);
  const requiredIdx = fnBody.indexOf("resolution.status === 'required'");
  const forbiddenIdx = fnBody.indexOf("resolution.status === 'forbidden'");
  const dedupeIdx = fnBody.indexOf('throw new DuplicatePhoneError()');
  assert.ok(requiredIdx > -1 && forbiddenIdx > -1 && dedupeIdx > -1);
  assert.ok(requiredIdx < dedupeIdx && forbiddenIdx < dedupeIdx);
});

test('private-group.ts: group-link ("ok") tạo trong CÙNG transaction/tx với Customer — không có code path nào tạo Customer rồi return sớm trước khi xét resolution.status === \'ok\' (test bắt buộc #10, atomic)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function createManualCustomerWithGroupLink');
  const fnBody = src.slice(fnStart, fnStart + 3000);
  assert.match(fnBody, /tx\.privateGroupCustomer\.create\(/);
  const createCustomerIdx = fnBody.indexOf('tx.khachHang.create(');
  const createLinkIdx = fnBody.indexOf('tx.privateGroupCustomer.create(');
  assert.ok(createCustomerIdx > -1 && createLinkIdx > createCustomerIdx, 'group-link phải tạo SAU customer, cùng transaction tx');
});

test('POST /api/khach-hang: groupId đọc từ body (string) và truyền vào createManualCustomerWithGroupLink — KHÔNG tin field khác (VD group_id snake_case) làm authority', () => {
  const src = read(KHACH_HANG_ROUTE_PATH);
  assert.match(src, /groupId:\s*typeof body\.groupId === 'string' && body\.groupId \? body\.groupId : undefined/);
});

test('POST /api/khach-hang: GroupSelectionRequiredError -> 400 (test bắt buộc #4)', () => {
  const src = read(KHACH_HANG_ROUTE_PATH);
  const idx = src.indexOf('if (err instanceof GroupSelectionRequiredError)');
  assert.ok(idx > -1);
  assert.match(src.slice(idx, idx + 200), /status:\s*400/);
});

test('POST /api/khach-hang: GroupNotAllowedError -> 403 (test bắt buộc #6)', () => {
  const src = read(KHACH_HANG_ROUTE_PATH);
  const idx = src.indexOf('if (err instanceof GroupNotAllowedError)');
  assert.ok(idx > -1);
  assert.match(src.slice(idx, idx + 200), /status:\s*403/);
});

test('GET /api/private-groups/mine: dùng resolvePrivateGroupsForEmployee(user.id_nhan_vien) — KHÔNG dùng filterPrivateGroupsForUser (đó là "nhóm được XEM", Admin thấy hết; endpoint này phải là "nhóm actor THỰC SỰ thuộc về", test bắt buộc #1)', () => {
  const src = read(MINE_ROUTE_PATH);
  assert.match(src, /resolvePrivateGroupsForEmployee\(user\.id_nhan_vien\)/);
  assert.doesNotMatch(src, /filterPrivateGroupsForUser/);
});

test('GET /api/private-groups/mine: TransactionalCrmRequiredError -> success:true, data:[] (Postgres CRM tắt = coi như 0 nhóm, KHÔNG lỗi cứng UI "Thêm khách hàng")', () => {
  const src = read(MINE_ROUTE_PATH);
  const idx = src.indexOf('if (error instanceof TransactionalCrmRequiredError)');
  assert.ok(idx > -1);
  assert.match(src.slice(idx, idx + 150), /success:\s*true,\s*data:\s*\[\]/);
});

test('PrivateGroupPanel: "Thêm khách hàng" từ group detail POST tới /api/khach-hang (CÙNG engine với trang Khách hàng) — KHÔNG tạo API tạo-khách thứ 2 (test bắt buộc #11)', () => {
  const src = read(PRIVATE_GROUP_PANEL_PATH);
  assert.match(src, /fetch\('\/api\/khach-hang', \{/);
  const idx = src.indexOf("fetch('/api/khach-hang', {");
  assert.match(src.slice(idx, idx + 400), /groupId/, 'phải gửi kèm groupId đã biết sẵn của group detail');
});

test('khach-hang/page.tsx: modal "Thêm khách hàng" fetch /api/private-groups/mine để quyết định 0/1/nhiều nhóm', () => {
  const src = read(KHACH_HANG_PAGE_PATH);
  assert.match(src, /\/api\/private-groups\/mine/);
});

// ─── Badge "Nhóm riêng" trên bảng /khach-hang (task hiện tại) ───────────────

test('private-group.ts: getPrivateGroupLinksForCustomers/getPrivateGroupsByIds KHÔNG dùng assertTransactionalCrm (throw) — dùng isPostgresEnabled-guard-trả-rỗng, GET /khach-hang phải luôn chạy được kể cả Postgres CRM tắt', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const linksStart = src.indexOf('export async function getPrivateGroupLinksForCustomers');
  const linksBody = src.slice(linksStart, linksStart + 400);
  assert.match(linksBody, /!isPostgresEnabled\('crm'\) \|\| !process\.env\.DATABASE_URL\) return \[\]/);
  assert.doesNotMatch(linksBody, /assertTransactionalCrm/);

  const groupsStart = src.indexOf('export async function getPrivateGroupsByIds');
  const groupsBody = src.slice(groupsStart, groupsStart + 400);
  assert.match(groupsBody, /!isPostgresEnabled\('crm'\) \|\| !process\.env\.DATABASE_URL\) return \[\]/);
  assert.doesNotMatch(groupsBody, /assertTransactionalCrm/);
});

test('private-group.ts: getPrivateGroupLinksForCustomers là ĐÚNG 1 query customer_id IN (...) — KHÔNG N+1 theo từng dòng (test bắt buộc #5)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function getPrivateGroupLinksForCustomers');
  const fnBody = src.slice(fnStart, fnStart + 400);
  assert.match(fnBody, /prisma\.privateGroupCustomer\.findMany\(\{/);
  assert.match(fnBody, /customer_id:\s*\{\s*in:/);
  // Đúng 1 lời gọi findMany trong function này (không loop gọi lại).
  const matches = fnBody.match(/\.findMany\(/g) || [];
  assert.equal(matches.length, 1);
});

test('GET /api/khach-hang: badge Nhóm riêng chỉ query cho customer_id CỦA TRANG ĐANG HIỂN THỊ (paginatedData/pageCustomerIds), KHÔNG cho toàn bộ "data" trước phân trang (test bắt buộc #5, cùng tinh thần campaignByCustomer)', () => {
  const src = read(KHACH_HANG_ROUTE_PATH);
  const idx = src.indexOf('getPrivateGroupLinksForCustomers(');
  assert.ok(idx > -1);
  const before = src.slice(Math.max(0, idx - 300), idx);
  assert.match(before, /pageCustomerIds\s*=\s*paginatedData\.map/);
});

test('GET /api/khach-hang: badge tính qua buildCustomerGroupBadges(user, ...) — permission filtering CHẠY Ở SERVER trước khi trả response, không trả link thô rồi tin client tự lọc (test bắt buộc #4)', () => {
  const src = read(KHACH_HANG_ROUTE_PATH);
  assert.match(src, /buildCustomerGroupBadges\(user, privateGroupLinks, privateGroupsById, privateGroupMembers\)/);
});

test('GET /api/khach-hang: visibility = existing CRM ownership (canViewCustomer/isDirectManager) OR private-group-membership (privateGroupVisibleIds) — Nhóm riêng là ĐƯỜNG XEM BỔ SUNG, KHÔNG thay thế authority /khach-hang hiện có (task hiện tại)', () => {
  const src = read(KHACH_HANG_ROUTE_PATH);
  assert.match(src, /getPrivateGroupVisibleCustomerIdsForEmployee\(user\.id_nhan_vien\)/);
  const idx = src.indexOf('let data = allCustomers.filter(');
  assert.ok(idx > -1);
  const snippet = src.slice(idx, idx + 400);
  assert.match(snippet, /canViewCustomer\(user, customer, projects\)/);
  assert.match(snippet, /isDirectManager\(user, customer, employees\)/);
  assert.match(snippet, /privateGroupVisibleIds\.has\(customer\.id_khach_hang\)/);
});

test('GET /api/khach-hang: response trả privateGroupByCustomer (cùng shape pattern campaignByCustomer) — KHÔNG gắn field group thẳng vào từng customer object (giữ nguyên shape KhachHang hiện có)', () => {
  const src = read(KHACH_HANG_ROUTE_PATH);
  assert.match(src, /privateGroupByCustomer,/);
});

test('khach-hang/page.tsx: badge Nhóm riêng render TRONG cùng <td> Tên KH, dòng RIÊNG bên dưới (flexDirection column) — không phải cột bảng mới, không phải cùng dòng với tên', () => {
  const src = read(KHACH_HANG_PAGE_PATH);
  const renderIdx = src.indexOf('{privateGroup.name}');
  assert.ok(renderIdx > -1);
  const before = src.slice(Math.max(0, renderIdx - 1000), renderIdx);
  assert.match(before, /flexDirection:\s*'column'/, 'badge phải nằm trong khối column cùng ô Tên KH, không phải cột mới');
  assert.match(before, /\{kh\.ten_KH\}/, 'badge phải nằm trong CÙNG <td> với Tên KH, không phải <td> mới');
});

test('khach-hang/page.tsx: KHÔNG có customer nào bị render "—"/"Không có nhóm" khi thiếu badge — chỉ render có điều kiện (privateGroup &&)', () => {
  const src = read(KHACH_HANG_PAGE_PATH);
  const idx = src.indexOf('const privateGroup = privateGroupByCustomer');
  assert.ok(idx > -1);
  const after = src.slice(idx, idx + 1600);
  assert.match(after, /\{privateGroup && \(/);
  assert.doesNotMatch(after, /Không có nhóm/);
});

// ─── Import Excel cho Nhóm riêng (task hiện tại) ────────────────────────────
// Route riêng cho group detail — KHÔNG phải Import Excel chung ở /khach-hang
// (Admin-only + bắt buộc Dataset). Group đã xác định qua URL (KHÔNG chọn lại,
// giống "+ Thêm khách hàng"); actor phải THỰC SỰ Leader/member của ĐÚNG group
// này (không có Admin-bypass, đồng nhất add đơn); parse/classify TÁI DÙNG
// NGUYÊN VẸN pipeline chung (findImportSheets/classifyRow/phoneKey/
// detectDuplicateNameWarnings) — không viết lại logic đó lần 2.

test('POST .../customers/import-excel: gate canViewPrivateGroup TRƯỚC khi đọc file — 401 nếu chưa đăng nhập, 404 nếu group không tồn tại, 403 nếu không xem được group', () => {
  const src = read(GROUP_IMPORT_EXCEL_ROUTE_PATH);
  assert.match(src, /if\s*\(!user\)\s*return NextResponse\.json\(\{ success: false, error: 'Chưa đăng nhập' \}, \{ status: 401 \}\);/);
  assert.match(src, /if\s*\(!group\)\s*return NextResponse\.json\(\{ success: false, error: 'Không tìm thấy Nhóm riêng' \}, \{ status: 404 \}\);/);
  assert.match(src, /if\s*\(!canViewPrivateGroup\(user, group, members\)\)/);
});

test('POST .../customers/import-excel: TÁI DÙNG NGUYÊN VẸN pipeline parse/classify chung (findImportSheets/classifyRow/phoneKey/detectDuplicateNameWarnings) — không viết lại logic phân loại dòng lần 2', () => {
  const src = read(GROUP_IMPORT_EXCEL_ROUTE_PATH);
  assert.match(src, /from '@\/lib\/khach-hang-excel-import'/);
  assert.match(src, /findImportSheets\(sheets\)/);
  assert.match(src, /classifyRow\(row, columns, existingDbPhoneKeys, seenInFilePhoneKeys\)/);
  assert.match(src, /detectDuplicateNameWarnings\(readyRows\)/);
});

test('POST .../customers/import-excel: CHỈ dòng \'ready\' được truyền vào importCustomersToPrivateGroupTransactional — blank/invalid/already_exists/duplicate_in_file đều bị lọc TRƯỚC (route tự phân loại, KHÔNG đẩy hết cho hàm ghi)', () => {
  const src = read(GROUP_IMPORT_EXCEL_ROUTE_PATH);
  const importCallIdx = src.indexOf('importCustomersToPrivateGroupTransactional({');
  assert.ok(importCallIdx > -1);
  const before = src.slice(0, importCallIdx);
  assert.match(before, /status === 'blank'/);
  assert.match(before, /status === 'invalid'/);
  assert.match(before, /status === 'already_exists'/);
  assert.match(before, /status === 'duplicate_in_file'/);
  assert.match(src.slice(importCallIdx, importCallIdx + 200), /rows: readyRows/);
});

test('POST .../customers/import-excel: error mapping — GroupNotAllowedError -> 403, TransactionalCrmRequiredError -> 503', () => {
  const src = read(GROUP_IMPORT_EXCEL_ROUTE_PATH);
  const groupIdx = src.indexOf('if (error instanceof GroupNotAllowedError)');
  assert.ok(groupIdx > -1);
  assert.match(src.slice(groupIdx, groupIdx + 150), /status:\s*403/);
  const txIdx = src.indexOf('if (error instanceof TransactionalCrmRequiredError)');
  assert.ok(txIdx > -1);
  assert.match(src.slice(txIdx, txIdx + 150), /status:\s*503/);
});

test('POST .../customers/import-excel: KHÔNG có Dataset/Import Batch nào được đụng tới — Private Group độc lập khỏi 2 hệ đó (khác Import Excel chung ở /khach-hang)', () => {
  const src = read(GROUP_IMPORT_EXCEL_ROUTE_PATH);
  assert.doesNotMatch(src, /createImportBatch|dataset_id|createDataset|ensureCustomerDatasetMemberships/);
});

test('POST .../customers/import-excel: KHÔNG gate isCrmAdmin — khác Import Excel chung (Admin-only), authority thật nằm ở importCustomersToPrivateGroupTransactional (Leader/member của group)', () => {
  const src = read(GROUP_IMPORT_EXCEL_ROUTE_PATH);
  assert.doesNotMatch(src, /isCrmAdmin/);
});

test('private-group.ts: importCustomersToPrivateGroupTransactional validate actor THỰC SỰ Leader/member của ĐÚNG group (resolvePrivateGroupsForEmployee) — throw GroupNotAllowedError nếu không, KHÔNG có Admin-bypass', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function importCustomersToPrivateGroupTransactional');
  const fnBody = src.slice(fnStart, fnStart + 900);
  assert.match(fnBody, /resolvePrivateGroupsForEmployee\(input\.actor\.id_nhan_vien\)/);
  assert.match(fnBody, /groups\.leaderOf\.some\(g => g\.id === input\.groupId\) \|\| groups\.memberOf\.some\(g => g\.id === input\.groupId\)/);
  assert.match(fnBody, /if \(!allowed\) throw new GroupNotAllowedError\(\);/);
  assert.doesNotMatch(fnBody, /isCrmAdmin/);
});

test('private-group.ts: importCustomersToPrivateGroupTransactional tạo Customer + PrivateGroupCustomer ATOMIC per-row (transaction riêng từng dòng) — 1 dòng lỗi bị cô lập vào errors, KHÔNG fail cả batch', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function importCustomersToPrivateGroupTransactional');
  const fnBody = src.slice(fnStart, fnStart + 2200);
  assert.match(fnBody, /prisma\.\$transaction\(async tx => \{/);
  assert.match(fnBody, /tx\.khachHang\.create\(/);
  assert.match(fnBody, /tx\.privateGroupCustomer\.create\(/);
  assert.match(fnBody, /catch \(e\) \{\s*errors\.push\(/);
  // Customer PHẢI tạo trước PrivateGroupCustomer (link cần customer_id đã tồn tại về mặt logic nghiệp vụ).
  const createCustomerIdx = fnBody.indexOf('tx.khachHang.create(');
  const createLinkIdx = fnBody.indexOf('tx.privateGroupCustomer.create(');
  assert.ok(createCustomerIdx > -1 && createLinkIdx > createCustomerIdx);
});

test('private-group.ts: importCustomersToPrivateGroupTransactional gán entered_by = assigned_to = actor (tự động được quyền act ngay, cùng rule createManualCustomerWithGroupLink)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function importCustomersToPrivateGroupTransactional');
  const fnBody = src.slice(fnStart, fnStart + 2200);
  assert.match(fnBody, /entered_by_id: input\.actor\.id_nhan_vien/);
  assert.match(fnBody, /assigned_to_id: input\.actor\.id_nhan_vien/);
});

test('PrivateGroupPanel.tsx: nút "Import Excel" POST tới ĐÚNG route /api/private-groups/{groupId}/customers/import-excel (route riêng, không dùng chung /api/khach-hang/import-excel)', () => {
  const src = read(PRIVATE_GROUP_PANEL_PATH);
  assert.match(src, /fetch\(`\/api\/private-groups\/\$\{groupId\}\/customers\/import-excel`, \{ method: 'POST', body: formData \}\)/);
});

test('/api/khach-hang/import-excel (route chung, Admin-only) KHÔNG bị đụng bởi task này — vẫn giữ nguyên gate isCrmAdmin', () => {
  const src = read(KHACH_HANG_IMPORT_EXCEL_ROUTE_PATH);
  assert.match(src, /if\s*\(!isCrmAdmin\(user\)\)/);
});

// ─── "Chia đều" (round-robin) cho Nhóm riêng (task hiện tại) ────────────────
// TÁI DÙNG NGUYÊN VẸN planDistribution (campaign.ts, THUẦN) — KHÔNG viết lại
// công thức round-robin. Authority CÙNG canReassignGroupCustomer (Admin/
// Leader, khác "+ Thêm khách hàng"/"Import Excel" mở cho mọi member) vì đây
// đụng vào assignment của CẢ nhóm, không chỉ data của chính actor.

test('POST .../customers/distribute: gate canReassignGroupCustomer (Admin/Leader, KHÔNG mở cho Sale thường) — 401/404/403 đúng thứ tự', () => {
  const src = read(GROUP_DISTRIBUTE_ROUTE_PATH);
  assert.match(src, /if\s*\(!user\)\s*return NextResponse\.json\(\{ success: false, error: 'Chưa đăng nhập' \}, \{ status: 401 \}\);/);
  assert.match(src, /if\s*\(!group\)\s*return NextResponse\.json\(\{ success: false, error: 'Không tìm thấy Nhóm riêng' \}, \{ status: 404 \}\);/);
  assert.match(src, /if\s*\(!canReassignGroupCustomer\(user, group\)\)/);
  const idx = src.indexOf('if (!canReassignGroupCustomer(user, group))');
  assert.match(src.slice(idx, idx + 200), /status:\s*403/);
});

test('POST .../customers/distribute: validate member_ids PHẢI là Leader hoặc member ĐÃ có trong ĐÚNG nhóm này — không chia cho người ngoài nhóm (cùng rule PATCH reassign đơn)', () => {
  const src = read(GROUP_DISTRIBUTE_ROUTE_PATH);
  assert.match(src, /if \(memberId === group\.leader_id\)/);
  assert.match(src, /members\.find\(m => m\.employee_id === memberId\)/);
  assert.match(src, /'Chỉ được chia cho Leader hoặc Sale thành viên của chính nhóm này'/);
});

test('POST .../customers/distribute: thiếu member_ids -> 400, không gọi tới distributeGroupCustomersTransactional', () => {
  const src = read(GROUP_DISTRIBUTE_ROUTE_PATH);
  const idx = src.indexOf("if (memberIds.length === 0)");
  assert.ok(idx > -1);
  const distributeIdx = src.indexOf('distributeGroupCustomersTransactional(');
  assert.ok(distributeIdx > idx, 'check "chưa chọn Sale" phải chạy TRƯỚC khi gọi hàm ghi');
  assert.match(src.slice(idx, idx + 200), /status:\s*400/);
});

test('private-group.ts: distributeGroupCustomersTransactional TÁI DÙNG NGUYÊN VẸN planDistribution (campaign.ts) — không viết lại công thức round-robin lần 2', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  assert.match(src, /import \{ planDistribution, type TelesaleRef \} from '\.\/campaign';/);
  const fnStart = src.indexOf('export async function distributeGroupCustomersTransactional');
  const fnBody = src.slice(fnStart, fnStart + 1200);
  assert.match(fnBody, /planDistribution\(\{/);
  assert.match(fnBody, /mode: 'round_robin',/);
});

test('private-group.ts: distributeGroupCustomersTransactional lấy TOÀN BỘ Customer hiện có của nhóm (findMany theo group_id) — không lọc theo assigned_to hiện tại (đúng ý nghĩa "chia đều lại toàn bộ")', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function distributeGroupCustomersTransactional');
  const fnBody = src.slice(fnStart, fnStart + 1200);
  assert.match(fnBody, /prisma\.privateGroupCustomer\.findMany\(\{\s*where: \{ group_id: input\.groupId \}/);
});

test('private-group.ts: distributeGroupCustomersTransactional gộp update vào 1 prisma.$transaction([...]) — hoặc chia hết hoặc không đổi gì, không nửa vời', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function distributeGroupCustomersTransactional');
  const fnBody = src.slice(fnStart, fnStart + 1600);
  assert.match(fnBody, /prisma\.\$transaction\(updates\)/);
  assert.match(fnBody, /prisma\.privateGroupCustomer\.update\(\{/);
});

test('private-group.ts: distributeGroupCustomersTransactional KHÔNG đụng KhachHang.sale_phu_trach — CHỈ đổi assigned_to_id/name trên PrivateGroupCustomer (cùng bất biến reassignGroupCustomer)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function distributeGroupCustomersTransactional');
  const fnBody = src.slice(fnStart, fnStart + 1600);
  assert.doesNotMatch(fnBody, /khachHang/);
  assert.match(fnBody, /data: \{ assigned_to_id: item\.telesale_id, assigned_to_name: item\.telesale_name \}/);
});

test('campaign.ts: planDistribution KHÔNG bị đụng bởi task này (vẫn export nguyên vẹn cho cả Campaign lẫn Private Group dùng chung)', () => {
  const src = read(CAMPAIGN_LIB_PATH);
  assert.match(src, /export function planDistribution\(input: DistributionInput\): DistributionPlanItem\[\]/);
});

test('PrivateGroupPanel.tsx: nút "Chia đều" CHỈ hiện khi canManage (Admin/Leader) — KHÁC "+ Thêm khách hàng"/"Import Excel" (mở cho mọi member)', () => {
  const src = read(PRIVATE_GROUP_PANEL_PATH);
  assert.match(src, /\{canManage && customers\.length > 0 && !showDistribute && \(/);
});

test('PrivateGroupPanel.tsx: "Chia đều" POST tới ĐÚNG route /api/private-groups/{groupId}/customers/distribute với member_ids đã chọn', () => {
  const src = read(PRIVATE_GROUP_PANEL_PATH);
  assert.match(src, /fetch\(`\/api\/private-groups\/\$\{groupId\}\/customers\/distribute`, \{/);
  assert.match(src, /body: JSON\.stringify\(\{ member_ids: selectedIds \}\)/);
});
