// CSKH: sắp xếp theo lần gọi gần nhất + lọc khoảng ngày gọi (xem tiến độ Sale).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyContactTimeView, isContactTimeViewActive } from '../../src/lib/campaign-cskh-range';

const ROWS = [
  { id: 'never', ngay_lien_he_cuoi: null },
  { id: 'sep9', ngay_lien_he_cuoi: new Date(2026, 8, 9, 11, 35).toISOString() },
  { id: 'sep3', ngay_lien_he_cuoi: new Date(2026, 8, 3, 14, 50).toISOString() },
  { id: 'oct20', ngay_lien_he_cuoi: new Date(2026, 9, 20, 9, 0).toISOString() },
];

test('cũ nhất → mới nhất / mới nhất → cũ nhất; khách chưa gọi luôn ở cuối', () => {
  assert.deepEqual(applyContactTimeView(ROWS, { sort: 'last_contact_asc' }).map(r => r.id), ['sep3', 'sep9', 'oct20', 'never']);
  assert.deepEqual(applyContactTimeView(ROWS, { sort: 'last_contact_desc' }).map(r => r.id), ['oct20', 'sep9', 'sep3', 'never']);
  assert.deepEqual(applyContactTimeView(ROWS, { sort: 'default' }).map(r => r.id), ['never', 'sep9', 'sep3', 'oct20']);
});

test('lọc khoảng ngày gọi (bao gồm 2 đầu) loại khách chưa gọi', () => {
  assert.deepEqual(applyContactTimeView(ROWS, { sort: 'default', from: '2026-09-03', to: '2026-09-09' }).map(r => r.id), ['sep9', 'sep3']);
  assert.deepEqual(applyContactTimeView(ROWS, { sort: 'last_contact_asc', from: '2026-09-04' }).map(r => r.id), ['sep9', 'oct20']);
});

test('isContactTimeViewActive + UI tắt "Chọn khách Từ…đến…" khi view thời gian gọi bật (STT khác thứ tự range)', () => {
  assert.equal(isContactTimeViewActive({ sort: 'default' }), false);
  assert.equal(isContactTimeViewActive({ sort: 'default', to: '2026-10-01' }), true);
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /\{contactViewActive \? \(/);
  assert.match(src, /paginate\(displayed, page, MEMBERS_PAGE_SIZE\)/);
});
