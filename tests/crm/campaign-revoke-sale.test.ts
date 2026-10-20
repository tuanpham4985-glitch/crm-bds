// "Thu hồi" khách chưa gọi của 1 Sale (bảng Tiến độ Sale, CSKH → Theo Campaign).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRevocableMembershipWhere } from '../../src/lib/crm-funnel/campaign';

test('chỉ thu hồi khách CHƯA GỌI lần nào của đúng Sale đó trong đúng Campaign', () => {
  const where = buildRevocableMembershipWhere('CAMP', 'S1') as Record<string, unknown>;
  assert.equal(where.campaign_id, 'CAMP');
  assert.equal(where.telesale_id, 'S1');
  assert.equal(where.assignment_status, 'ASSIGNED');
  assert.equal(where.handoff_id, null, 'khách đã chuyển giao giữ nguyên');
  assert.equal(where.so_lan_lien_he, 0, 'khách đã gọi giữ nguyên');
  assert.equal(where.ngay_lien_he_tiep, null, 'khách đã hẹn lịch giữ nguyên');
  assert.match(JSON.stringify(where.AND), /"trang_thai_cham_soc":"Chưa gọi"/);
  assert.match(JSON.stringify(where.AND), /"lich_su_cham_soc":"\[\]"/);
});

test('revoke route: gate canManageCampaign, Sale nhận phải hợp lệ (eligibleCampaignSales) và khác Sale bị thu hồi; preview không ghi', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/revoke/route.ts'), 'utf8');
  assert.ok(src.indexOf('canManageCampaign(user, campaign)') < src.indexOf('request.json()'));
  assert.ok(src.indexOf('body?.preview === true') < src.indexOf('revokeSaleMemberships('));
  assert.match(src, /eligibleCampaignSales\(isCrmAdmin\(user\), campaign, projects, employees\)/);
  assert.match(src, /target\.id_nhan_vien === fromTelesaleId/);
});

test('revokeSaleMemberships ghi bằng 1 updateMany theo đúng WHERE "chưa gọi"', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/campaign.ts'), 'utf8');
  const start = src.indexOf('export async function revokeSaleMemberships');
  const body = src.slice(start, src.indexOf('\n}', start));
  assert.match(body, /where: buildRevocableMembershipWhere\(input\.campaignId, input\.fromTelesaleId\)/);
  assert.match(body, /assignment_status: 'UNASSIGNED'/);
});
