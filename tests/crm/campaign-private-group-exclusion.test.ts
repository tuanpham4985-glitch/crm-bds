// Khách thuộc Nhóm riêng KHÔNG được trộn vào Campaign: không tính là "Chưa
// vào Campaign" (Chia nhanh / Chọn khách) và luôn bị bỏ qua khi phân Campaign.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchesCampaignStatusFilter, summarizeCampaignMembership } from '../../src/lib/khach-hang-campaign-status';

const IN_CAMPAIGN = new Set(['C1', 'PG2']);
const PRIVATE_GROUP = new Set(['PG1', 'PG2']);

test('not_in_campaign loại khách Nhóm riêng; in_campaign/all giữ nguyên', () => {
  assert.equal(matchesCampaignStatusFilter('PG1', IN_CAMPAIGN, 'not_in_campaign', PRIVATE_GROUP), false);
  assert.equal(matchesCampaignStatusFilter('FREE', IN_CAMPAIGN, 'not_in_campaign', PRIVATE_GROUP), true);
  assert.equal(matchesCampaignStatusFilter('PG2', IN_CAMPAIGN, 'in_campaign', PRIVATE_GROUP), true);
  assert.equal(matchesCampaignStatusFilter('PG1', IN_CAMPAIGN, 'all', PRIVATE_GROUP), true);
  // Không truyền tập Nhóm riêng -> hành vi cũ
  assert.equal(matchesCampaignStatusFilter('PG1', IN_CAMPAIGN, 'not_in_campaign'), true);
});

test('summary tách riêng Nhóm riêng (chưa vào Campaign) khỏi "Chưa vào Campaign"', () => {
  assert.deepEqual(
    summarizeCampaignMembership(['C1', 'PG1', 'PG2', 'FREE'], IN_CAMPAIGN, PRIVATE_GROUP),
    { inCampaign: 2, inPrivateGroup: 1, notInCampaign: 1 },
  );
});

test('server: bulkAddAndDistribute lọc khách Nhóm riêng trong transaction trước mọi bước ghi; range + list route dùng tập Nhóm riêng', () => {
  const lib = readFileSync(resolve('src/lib/crm-funnel/campaign.ts'), 'utf8');
  const fnStart = lib.indexOf('export async function bulkAddAndDistribute');
  const fnBody = lib.slice(fnStart, lib.indexOf('\n}', fnStart));
  const pgIdx = fnBody.indexOf('tx.privateGroupCustomer.findMany');
  assert.ok(pgIdx > 0 && pgIdx < fnBody.indexOf('planBulkDistribution('));
  assert.match(fnBody, /privateGroupSkipped: privateGroupIds\.size/);
  const rangeStart = lib.indexOf('export async function resolveCustomerIdsByRange');
  assert.match(lib.slice(rangeStart, lib.indexOf('\n}', rangeStart)), /matchesCampaignStatusFilter\(customer\.id_khach_hang, membershipSet, campaignStatus, privateGroupSet\)/);
  const route = readFileSync(resolve('src/app/api/khach-hang/route.ts'), 'utf8');
  assert.match(route, /notIn: \[\.\.\.membershipSet, \.\.\.privateGroupCustomerSet\]/);
});
