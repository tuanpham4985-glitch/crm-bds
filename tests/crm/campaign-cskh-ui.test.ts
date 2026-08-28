import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canActOnMembership } from '../../src/lib/campaign-cskh-authority';

const admin = { id_nhan_vien: 'ADMIN1', ho_ten: 'Sếp' };
const owner = { id_nhan_vien: 'OWN1', ho_ten: 'Manager X' };
const assignedTelesale = { id_nhan_vien: 'TS_A', ho_ten: 'Lan' };
const otherTelesale = { id_nhan_vien: 'TS_B', ho_ten: 'Hương' };
const campaign = { owner_name: 'Manager X' };
const member = { telesale_id: 'TS_A' };
const employees = [{ id_nhan_vien: 'TS_A', ql_truc_tiep: 'Quản lý A' }];

// --- Root-cause regression: Admin/Campaign owner phải thấy nút Chăm sóc/Đánh giá ---

test('canActOnMembership: Admin luôn thấy nút thao tác, kể cả không phải Telesale được gán (root cause của bug: trước fix, Admin bị coi như người ngoài)', () => {
  assert.equal(canActOnMembership(admin, true, member, campaign, employees), true);
});

test('canActOnMembership: Campaign owner luôn thấy nút thao tác, kể cả không phải Telesale được gán', () => {
  assert.equal(canActOnMembership(owner, false, member, campaign, employees), true);
});

test('canActOnMembership: ĐÚNG Telesale được gán thấy nút thao tác', () => {
  assert.equal(canActOnMembership(assignedTelesale, false, member, campaign, employees), true);
});

test('canActOnMembership: quản lý trực tiếp của Telesale được gán thấy nút thao tác', () => {
  const manager = { id_nhan_vien: 'M1', ho_ten: 'Quản lý A' };
  assert.equal(canActOnMembership(manager, false, member, campaign, employees), true);
});

test('canActOnMembership: Telesale KHÔNG liên quan (không phải người được gán, không phải quản lý, không phải owner/Admin) không thấy nút', () => {
  assert.equal(canActOnMembership(otherTelesale, false, member, campaign, employees), false);
});

test('canActOnMembership: chưa đăng nhập -> false', () => {
  assert.equal(canActOnMembership(null, true, member, campaign, employees), false);
});

// --- UI wiring: interaction/qualification target ĐÚNG membership id, có refresh, không handoff/Pipeline ---

test('CampaignCskhWorkQueue: nút Chăm sóc/Đánh giá render có điều kiện canActOn(member), Lịch sử luôn render', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /\{actionable && <button[^>]*>[^<]*<Phone[^/]*\/> Chăm sóc<\/button>\}/);
  assert.match(src, /\{actionable && <button[^>]*>[^<]*<BadgeCheck[^/]*\/> Đánh giá<\/button>\}/);
  assert.match(src, /<button className="btn btn-secondary btn-sm" onClick=\{\(\) => onHistory\(member\)\}>.*Lịch sử<\/button>/);
  assert.match(src, /const actionable = canActOn\(member\);/);
});

test('CampaignCskhWorkQueue: interaction POST target ĐÚNG campaignId/interactionMember.id (membership), không phải customer_id', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /\/api\/campaigns\/\$\{campaignId\}\/members\/\$\{interactionMember\.id\}\/interaction/);
});

test('MembershipQualificationModal: qualification PUT target ĐÚNG campaignId/membership.id', () => {
  const src = readFileSync(resolve('src/components/crm/MembershipQualificationModal.tsx'), 'utf8');
  assert.match(src, /\/api\/campaigns\/\$\{campaignId\}\/members\/\$\{membership\.id\}\/qualification/);
});

test('CampaignCskhWorkQueue: sau khi lưu interaction/qualification thành công đều gọi replaceMember -> work queue (filtered/stats) refresh vì phụ thuộc "members"', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /replaceMember\(\{ \.\.\.data\.data, customer: interactionMember\.customer \}\)/);
  assert.match(src, /onSaved=\{\(updated, message\) => \{ replaceMember\(updated\)/);
  assert.match(src, /const filtered = useMemo\(\(\) => members\.filter/);
  assert.match(src, /const stats = useMemo\(\(\) => \{[\s\S]*?\}, \[members\]\);/);
});

test('MembershipQualificationModal: không có bất kỳ lệnh gọi CrmHandoff/Pipeline nào — Đánh giá (qualification save) vẫn chỉ ghi CampaignMembership, không tự trigger Handoff (M1B.2: chỉ Bàn giao explicit trong CampaignCskhWorkQueue mới được động tới Handoff)', () => {
  const src = readFileSync(resolve('src/components/crm/MembershipQualificationModal.tsx'), 'utf8');
  const codeOnly = src.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
  assert.doesNotMatch(codeOnly, /handoff|pipeline/i, 'MembershipQualificationModal.tsx không được nhắc tới handoff/pipeline trong code');
});

// M1B.2: CampaignCskhWorkQueue.tsx GIỜ ĐÃ hợp lệ nhắc tới handoff (action Bàn
// giao + Accept/Reject explicit) — không còn kiểm tra "không nhắc tới" toàn
// file như M1B.1. Thay vào đó siết đúng bất biến còn lại: hàm saveInteraction
// (lưu kết quả Chăm sóc, M1B.1) tuyệt đối không được tự đụng tới handoff —
// chỉ action "Bàn giao" explicit (nút riêng, người dùng tự bấm) mới được.
test('CampaignCskhWorkQueue.tsx: saveInteraction() (lưu Chăm sóc) không tự gọi handoff/pipeline nào — trigger Quan tâm chỉ đưa vào candidate, Handoff vẫn phải qua hành động Bàn giao explicit riêng biệt', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  const fnStart = src.indexOf('async function saveInteraction()');
  // Chỉ tới dòng đóng hàm ("  }\n") đầu tiên sau fnStart — không lấy tới tận
  // đầu hàm kế tiếp, tránh dính comment giải thích nằm GIỮA 2 hàm.
  const fnEndMarker = '\n  }\n';
  const fnEnd = src.indexOf(fnEndMarker, fnStart) + fnEndMarker.length;
  const fnBody = src.slice(fnStart, fnEnd);
  assert.ok(fnStart > -1 && fnEnd > fnStart);
  assert.doesNotMatch(fnBody, /handoff|pipeline/i, 'saveInteraction() không được tự trigger handoff/pipeline nào');
});

// --- Root-cause regression: tab "Theo Campaign" (CampaignCskhWorkQueue) treo
// spinner vô hạn khi tài khoản KHÔNG có Campaign nào (hoặc GET /api/campaigns
// lỗi/rỗng) ---
//
// "loading" khởi tạo true. Trước fix, loadCampaigns() KHÔNG hề đụng tới
// setLoading — chỉ loadMembers(id) mới set/clear loading, và loadMembers chỉ
// làm vậy khi id có giá trị thật. Vì campaignId ban đầu rỗng, và chỉ được
// gán giá trị SAU KHI campaigns.length > 0, nếu campaigns fetch xong mà rỗng
// (0 Campaign) hoặc lỗi, "loading" mắc kẹt mãi mãi ở true -> gate
// "if (loading && campaigns.length === 0)" quay spinner vô hạn, không bao
// giờ tự thoát để hiện empty-state/thông báo lỗi.
test("CampaignCskhWorkQueue.tsx: loadCampaigns() phải tự setLoading(true)/setLoading(false) (finally) — nếu không, tài khoản không có Campaign nào (hoặc GET /api/campaigns lỗi) sẽ bị kẹt spinner vô hạn vì loadMembers('') lúc mount không đụng tới loading", () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  const fnStart = src.indexOf('const loadCampaigns = useCallback(async () => {');
  assert.ok(fnStart >= 0, 'phải tìm được loadCampaigns');
  const fnEndMarker = '}, []);';
  const fnEnd = src.indexOf(fnEndMarker, fnStart) + fnEndMarker.length;
  const fnBody = src.slice(fnStart, fnEnd);
  assert.match(fnBody, /setLoading\(true\)/, 'loadCampaigns phải setLoading(true) khi bắt đầu fetch');
  assert.match(fnBody, /finally\s*\{\s*setLoading\(false\);?\s*\}/, 'loadCampaigns phải setLoading(false) trong finally — đảm bảo thoát spinner dù fetch thành công, lỗi, hay campaigns trả về rỗng');
});

test('CampaignCskhWorkQueue.tsx: gate spinner top-level "loading && campaigns.length === 0" vẫn còn nguyên (chỉ fix nguồn set loading, không đổi điều kiện render)', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /if\s*\(loading && campaigns\.length === 0\)\s*return/);
});
