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

test('CampaignCskhWorkQueue + MembershipQualificationModal: không có bất kỳ lệnh gọi CrmHandoff/Pipeline nào (M1B.2 chưa mở)', () => {
  for (const file of ['src/components/crm/CampaignCskhWorkQueue.tsx', 'src/components/crm/MembershipQualificationModal.tsx']) {
    const src = readFileSync(resolve(file), 'utf8');
    const codeOnly = src.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
    assert.doesNotMatch(codeOnly, /handoff|pipeline/i, `${file} không được nhắc tới handoff/pipeline trong code`);
  }
});
