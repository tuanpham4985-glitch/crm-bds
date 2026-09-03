import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Private Group — "Xóa nhóm" (task hiện tại). Cùng kỹ thuật source-regex đã
// dùng ở private-group-api.test.ts/private-group-cskh.test.ts: server auth
// gate + transaction cần session/DB thật, không unit-test trực tiếp được —
// khoá lại bằng cách đọc SOURCE THẬT rồi assert, để không ai vô tình gỡ mất
// invariant khi sửa code sau này. canDeletePrivateGroup (pure function) đã
// unit-test riêng trong private-group-auth.test.ts.

const PRIVATE_GROUP_LIB_PATH = 'src/lib/crm-funnel/private-group.ts';
const GROUP_DETAIL_ROUTE_PATH = 'src/app/api/private-groups/[id]/route.ts';
const PRIVATE_GROUP_PANEL_PATH = 'src/components/crm/PrivateGroupPanel.tsx';

function read(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

// ─── private-group.ts: deletePrivateGroupTransactional ─────────────────────

test('deletePrivateGroupTransactional: xóa privateGroupCustomer + privateGroupMember TRƯỚC khi xóa privateGroup — order xóa con trước cha (test bắt buộc #2/#3/#11)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function deletePrivateGroupTransactional');
  assert.ok(fnStart > -1, 'phải có deletePrivateGroupTransactional');
  const fnBody = src.slice(fnStart, fnStart + 1200);
  const customerIdx = fnBody.indexOf('tx.privateGroupCustomer.deleteMany(');
  const memberIdx = fnBody.indexOf('tx.privateGroupMember.deleteMany(');
  const groupDeleteIdx = fnBody.indexOf('tx.privateGroup.delete(');
  assert.ok(customerIdx > -1 && memberIdx > -1 && groupDeleteIdx > -1, 'phải tìm thấy cả 3 lệnh xóa');
  assert.ok(customerIdx < groupDeleteIdx && memberIdx < groupDeleteIdx, 'privateGroupCustomer/privateGroupMember phải xóa TRƯỚC privateGroup');
});

test('deletePrivateGroupTransactional: cả 2 deleteMany đều scope theo group_id (KHÔNG xóa nhầm dòng của nhóm khác) — employee ở group khác giữ nguyên membership (test bắt buộc #7)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function deletePrivateGroupTransactional');
  const fnBody = src.slice(fnStart, fnStart + 1200);
  assert.match(fnBody, /tx\.privateGroupCustomer\.deleteMany\(\{ where: \{ group_id: groupId \} \}\)/);
  assert.match(fnBody, /tx\.privateGroupMember\.deleteMany\(\{ where: \{ group_id: groupId \} \}\)/);
});

test('deletePrivateGroupTransactional: toàn bộ trong 1 prisma.$transaction — atomic, group không tồn tại trả về null TRƯỚC khi ghi gì (test bắt buộc #1/#10/#11)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function deletePrivateGroupTransactional');
  const fnBody = src.slice(fnStart, fnStart + 1200);
  assert.match(fnBody, /return prisma\.\$transaction\(async tx => \{/);
  const notFoundIdx = fnBody.indexOf('if (!group) return null;');
  const deleteIdx = fnBody.indexOf('tx.privateGroupCustomer.deleteMany(');
  assert.ok(notFoundIdx > -1 && notFoundIdx < deleteIdx, 'phải check group tồn tại TRƯỚC khi xóa bất kỳ dòng nào');
});

test('deletePrivateGroupTransactional: KHÔNG đụng KhachHang, CampaignMembership, CrmHandoff, CrmPipelineLink, CustomerDatasetMembership (test bắt buộc #4/#5/#6)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function deletePrivateGroupTransactional');
  const fnBody = src.slice(fnStart, fnStart + 1200);
  assert.doesNotMatch(fnBody, /tx\.khachHang\./);
  assert.doesNotMatch(fnBody, /tx\.campaignMembership\./);
  assert.doesNotMatch(fnBody, /tx\.crmHandoff\./);
  assert.doesNotMatch(fnBody, /tx\.crmPipelineLink\./);
  assert.doesNotMatch(fnBody, /tx\.customerDatasetMembership\./);
});

// ─── schema — FK onDelete: Cascade KHÔNG bị đổi bởi task này ────────────────

test('schema: PrivateGroupMember/PrivateGroupCustomer.group vẫn onDelete: Cascade (không đổi so với migration v1 đã apply) — deletePrivateGroupTransactional dùng explicit deleteMany, KHÔNG rely riêng vào cascade cho deterministic/testability', () => {
  const schema = read('prisma/schema.prisma');
  const matches = schema.match(/group\s+PrivateGroup @relation\(fields: \[group_id\], references: \[id\], onDelete: Cascade\)/g) || [];
  assert.equal(matches.length, 2, 'phải còn đúng 2 chỗ (PrivateGroupMember + PrivateGroupCustomer), không migration schema mới nào đổi field này');
});

// ─── DELETE /api/private-groups/[id] ────────────────────────────────────────

test('DELETE /api/private-groups/[id]: 401 nếu chưa đăng nhập, gate canDeletePrivateGroup (Admin-only) TRƯỚC khi đụng DB -> 403 nếu không phải Admin (test bắt buộc #8/#9)', () => {
  const src = read(GROUP_DETAIL_ROUTE_PATH);
  const fnStart = src.indexOf('export async function DELETE(');
  assert.ok(fnStart > -1);
  const fnBody = src.slice(fnStart, fnStart + 700);
  assert.match(fnBody, /if\s*\(!user\)\s*return NextResponse\.json\(\{ success: false, error: 'Chưa đăng nhập' \}, \{ status: 401 \}\);/);
  const gateIdx = fnBody.indexOf('if (!canDeletePrivateGroup(user))');
  assert.ok(gateIdx > -1, 'phải gate canDeletePrivateGroup');
  assert.match(fnBody.slice(gateIdx, gateIdx + 150), /status:\s*403/);
  const deleteCallIdx = fnBody.indexOf('deletePrivateGroupTransactional(');
  assert.ok(gateIdx < deleteCallIdx, 'gate 403 phải chạy TRƯỚC khi gọi deletePrivateGroupTransactional');
});

test('DELETE /api/private-groups/[id]: group không tồn tại -> 404 (test bắt buộc #10)', () => {
  const src = read(GROUP_DETAIL_ROUTE_PATH);
  const fnStart = src.indexOf('export async function DELETE(');
  const fnBody = src.slice(fnStart, fnStart + 700);
  const idx = fnBody.indexOf('if (!result) return NextResponse.json');
  assert.ok(idx > -1);
  assert.match(fnBody.slice(idx, idx + 150), /status:\s*404/);
});

test('DELETE /api/private-groups/[id]: success trả 200 với data từ deletePrivateGroupTransactional (test bắt buộc #1)', () => {
  const src = read(GROUP_DETAIL_ROUTE_PATH);
  const fnStart = src.indexOf('export async function DELETE(');
  const fnBody = src.slice(fnStart, fnStart + 900);
  assert.match(fnBody, /return NextResponse\.json\(\{ success: true, data: result \}\);/);
});

// ─── UI: PrivateGroupPanel.tsx ───────────────────────────────────────────────

test('PrivateGroupPanel.tsx: nút "Xóa nhóm" CHỈ render khi isAdmin (test bắt buộc #12)', () => {
  const src = read(PRIVATE_GROUP_PANEL_PATH);
  // Tìm ĐÚNG JSX của nút (icon + label), không phải comment giải thích phía
  // trên (comment cũng chứa chữ "Xóa nhóm" nên indexOf thô sẽ khớp nhầm).
  const buttonIdx = src.indexOf('<Trash2 size={14} /> Xóa nhóm');
  assert.ok(buttonIdx > -1);
  const before = src.slice(Math.max(0, buttonIdx - 300), buttonIdx);
  assert.match(before, /\{isAdmin && \(/);
});

test('PrivateGroupPanel.tsx: KHÔNG dùng window.confirm cho xóa nhóm — reuse confirm-overlay/confirm-box pattern đã có sẵn trong app (test bắt buộc #13, giống khach-hang/page.tsx)', () => {
  const src = read(PRIVATE_GROUP_PANEL_PATH);
  assert.doesNotMatch(src, /window\.confirm\(/);
  assert.match(src, /className="confirm-overlay"/);
  assert.match(src, /className="confirm-box"/);
});

test('PrivateGroupPanel.tsx: confirm copy đúng nguyên văn warning yêu cầu — nêu rõ liên kết + CSKH bị xóa, Customer gốc được giữ lại (test bắt buộc #13)', () => {
  const src = read(PRIVATE_GROUP_PANEL_PATH);
  assert.match(src, /Xóa nhóm sẽ xóa liên kết Nhóm riêng và toàn bộ lịch sử\/trạng thái CSKH thuộc riêng nhóm này\. Khách hàng gốc vẫn được giữ lại\./);
});

test('PrivateGroupPanel.tsx: sau xóa thành công -> đóng detail + refresh danh sách + hiện thông báo, KHÔNG reload toàn page (test bắt buộc #14)', () => {
  const src = read(PRIVATE_GROUP_PANEL_PATH);
  assert.match(src, /onDeleted=\{\(groupName\) => \{ setSelectedGroupId\(null\); fetchGroups\(\); setNotice\(`Đã xóa nhóm "\$\{groupName\}"\.`\); \}\}/);
  assert.doesNotMatch(src, /window\.location\.reload/);
});

test('PrivateGroupPanel.tsx: handleDeleteGroup gọi DELETE /api/private-groups/${groupId} (reuse ĐÚNG route, không tạo API xóa thứ 2)', () => {
  const src = read(PRIVATE_GROUP_PANEL_PATH);
  assert.match(src, /fetch\(`\/api\/private-groups\/\$\{groupId\}`, \{ method: 'DELETE' \}\)/);
});
