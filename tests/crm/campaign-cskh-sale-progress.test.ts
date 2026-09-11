import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { summarizeMembersBySale, matchesMembershipQueueFilter, type MembershipQueueFilterable } from '../../src/lib/campaign-cskh-range';

// CSKH SALE PROGRESS (V1) — LOCKED semantics per ChatGPT Architecture Review:
//   assigned    = isMembershipAssigned(member) (telesale_id, NOT assignment_status)
//   unprocessed = assigned && bucketOf() === 'Chưa gọi'
//   inProgress  = assigned && bucketOf() IN ('Đang chăm sóc', 'Gọi lại hôm nay')
//   overdue     = assigned && bucketOf() === 'Quá lịch'
//   interested  = assigned && bucketOf() === 'Quan tâm'
//   completed   = assigned && bucketOf() === 'Hoàn tất / Không phù hợp'
//   processed   = assigned - unprocessed
//   progressPercent = assigned > 0 ? round(processed/assigned*100) : 0
// Aggregation must be a PURE derivation of already-fetched `members` — no
// fetch/DB call anywhere in this module (NEON_TRANSFER_AUDIT P0/P1 follow-up).

const ROUTE_PATH_QUEUE = 'src/components/crm/CampaignCskhWorkQueue.tsx';
const RANGE_MODULE_PATH = 'src/lib/campaign-cskh-range.ts';

function member(overrides: Partial<MembershipQueueFilterable> = {}): MembershipQueueFilterable {
  return {
    telesale_id: 'NV1', telesale_name: 'Nguyễn Văn A',
    trang_thai_cham_soc: 'Chưa gọi', ngay_lien_he_tiep: null,
    ...overrides,
  };
}

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// --- 1. Unassigned membership excluded ---

test('summarizeMembersBySale: unassigned membership (telesale_id null) KHÔNG xuất hiện trong summary', () => {
  const rows = summarizeMembersBySale([member({ telesale_id: null }), member({ telesale_id: undefined })]);
  assert.deepEqual(rows, []);
});

// --- 2. telesale_id là grouping authority ---

test('summarizeMembersBySale: group theo telesale_id, KHÔNG theo telesale_name', () => {
  const rows = summarizeMembersBySale([
    member({ telesale_id: 'NV1', telesale_name: 'Nguyễn Văn A' }),
    member({ telesale_id: 'NV1', telesale_name: 'Nguyễn Văn A' }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].telesaleId, 'NV1');
  assert.equal(rows[0].assigned, 2);
});

// --- 3. Chưa gọi: assigned=1, unprocessed=1, processed=0, progress=0% ---

test('summarizeMembersBySale: 1 membership "Chưa gọi" -> assigned=1 unprocessed=1 processed=0 progress=0%', () => {
  const rows = summarizeMembersBySale([member({ trang_thai_cham_soc: 'Chưa gọi' })]);
  assert.deepEqual(rows[0], {
    telesaleId: 'NV1', telesaleName: 'Nguyễn Văn A',
    assigned: 1, unprocessed: 1, inProgress: 0, overdue: 0, interested: 0, completed: 0,
    processed: 0, progressPercent: 0,
  });
});

// --- 4. "Đã liên hệ" literal status -> bucketOf -> Đang chăm sóc -> inProgress tăng ---

test('summarizeMembersBySale: trang_thai_cham_soc = "Đã liên hệ" (literal) -> bucketOf trả "Đang chăm sóc" -> inProgress tăng, không có cột "Đã liên hệ" riêng', () => {
  const rows = summarizeMembersBySale([member({ trang_thai_cham_soc: 'Đã liên hệ' })]);
  assert.equal(rows[0].inProgress, 1);
  assert.equal(rows[0].unprocessed, 0);
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    'assigned', 'completed', 'inProgress', 'interested', 'overdue', 'processed', 'progressPercent', 'telesaleId', 'telesaleName', 'unprocessed',
  ].sort());
});

// --- 5. Không nghe máy / Gọi lại -> theo existing bucketOf semantics (Đang chăm sóc, trừ khi trùng "Gọi lại hôm nay") ---

test('summarizeMembersBySale: "Không nghe máy" và "Gọi lại" (không phải hôm nay) -> inProgress tăng (bucketOf -> Đang chăm sóc)', () => {
  const rows = summarizeMembersBySale([
    member({ telesale_id: 'NV1', trang_thai_cham_soc: 'Không nghe máy' }),
    member({ telesale_id: 'NV1', trang_thai_cham_soc: 'Gọi lại', ngay_lien_he_tiep: FUTURE }),
  ]);
  assert.equal(rows[0].inProgress, 2);
});

// --- 6. Gọi lại hôm nay: inProgress tăng, KHÔNG sửa bucketOf ---

test('summarizeMembersBySale: "Gọi lại" + hẹn lại HÔM NAY -> bucketOf = "Gọi lại hôm nay" -> GỘP vào inProgress ở summary (chỉ ở summary, không đổi bucketOf detail queue)', () => {
  const today = new Date().toISOString();
  const rows = summarizeMembersBySale([member({ trang_thai_cham_soc: 'Gọi lại', ngay_lien_he_tiep: today })]);
  assert.equal(rows[0].inProgress, 1);
  assert.equal(rows[0].overdue, 0);
});

// --- 7. Quá lịch: overdue tăng, processed tăng ---

test('summarizeMembersBySale: ngay_lien_he_tiep đã qua (PAST) và chưa Quan tâm/Hoàn tất -> overdue tăng, VẪN tính là processed', () => {
  const rows = summarizeMembersBySale([member({ trang_thai_cham_soc: 'Không nghe máy', ngay_lien_he_tiep: PAST })]);
  assert.equal(rows[0].overdue, 1);
  assert.equal(rows[0].unprocessed, 0);
  assert.equal(rows[0].processed, 1);
  assert.equal(rows[0].progressPercent, 100);
});

// --- 8. Quan tâm: interested tăng, processed tăng ---

test('summarizeMembersBySale: "Quan tâm" -> interested tăng, processed tăng, KHÔNG bị tính là overdue dù ngay_lien_he_tiep đã qua', () => {
  const rows = summarizeMembersBySale([member({ trang_thai_cham_soc: 'Quan tâm', ngay_lien_he_tiep: PAST })]);
  assert.equal(rows[0].interested, 1);
  assert.equal(rows[0].overdue, 0, 'Quan tâm ưu tiên cao hơn Quá lịch trong bucketOf — không được đè lẫn nhau');
  assert.equal(rows[0].processed, 1);
});

// --- 9. Không phù hợp / Sai số: completed tăng, processed tăng ---

test('summarizeMembersBySale: "Không phù hợp" và "Sai số" -> completed tăng, processed tăng', () => {
  const rows = summarizeMembersBySale([
    member({ telesale_id: 'NV1', trang_thai_cham_soc: 'Không phù hợp' }),
    member({ telesale_id: 'NV1', trang_thai_cham_soc: 'Sai số', ngay_lien_he_tiep: PAST }),
  ]);
  assert.equal(rows[0].completed, 2);
  assert.equal(rows[0].overdue, 0, 'Hoàn tất/KPH ưu tiên cao hơn Quá lịch trong bucketOf');
  assert.equal(rows[0].processed, 2);
});

// --- 10. Progress calculation: 300 assigned / 120 unprocessed -> 180 processed -> 60% ---

test('summarizeMembersBySale: 300 assigned, 120 unprocessed -> 180 processed -> progress 60%', () => {
  const members: MembershipQueueFilterable[] = [];
  for (let i = 0; i < 120; i++) members.push(member({ trang_thai_cham_soc: 'Chưa gọi' }));
  for (let i = 0; i < 180; i++) members.push(member({ trang_thai_cham_soc: 'Quan tâm' }));
  const rows = summarizeMembersBySale(members);
  assert.equal(rows[0].assigned, 300);
  assert.equal(rows[0].unprocessed, 120);
  assert.equal(rows[0].processed, 180);
  assert.equal(rows[0].progressPercent, 60);
});

test('summarizeMembersBySale: assigned = 0 (không có membership nào được giao) không thể xảy ra trong output (unassigned bị loại từ đầu) — nhưng formula tự vẫn an toàn (không chia 0)', () => {
  const rows = summarizeMembersBySale([]);
  assert.deepEqual(rows, []);
});

// --- 11. Multiple Sales: counts không leak giữa Sale ---

test('summarizeMembersBySale: nhiều Sale -> counts tách biệt hoàn toàn, không leak chéo', () => {
  const rows = summarizeMembersBySale([
    member({ telesale_id: 'NV1', telesale_name: 'Sale A', trang_thai_cham_soc: 'Chưa gọi' }),
    member({ telesale_id: 'NV1', telesale_name: 'Sale A', trang_thai_cham_soc: 'Quan tâm' }),
    member({ telesale_id: 'NV2', telesale_name: 'Sale B', trang_thai_cham_soc: 'Chưa gọi' }),
  ]);
  assert.equal(rows.length, 2);
  const a = rows.find(r => r.telesaleId === 'NV1')!;
  const b = rows.find(r => r.telesaleId === 'NV2')!;
  assert.equal(a.assigned, 2); assert.equal(a.unprocessed, 1); assert.equal(a.interested, 1);
  assert.equal(b.assigned, 1); assert.equal(b.unprocessed, 1); assert.equal(b.interested, 0);
});

// --- 12. Same/similar display names: không merge nếu telesale_id khác nhau ---

test('summarizeMembersBySale: 2 Sale trùng telesale_name nhưng khác telesale_id -> KHÔNG merge thành 1 dòng', () => {
  const rows = summarizeMembersBySale([
    member({ telesale_id: 'NV1', telesale_name: 'Nguyễn Văn A' }),
    member({ telesale_id: 'NV2', telesale_name: 'Nguyễn Văn A' }),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map(r => r.telesaleId)), new Set(['NV1', 'NV2']));
});

// --- Deterministic ordering ---

test('summarizeMembersBySale: output sort theo telesaleName rồi telesaleId (tie-break), deterministic', () => {
  const rows = summarizeMembersBySale([
    member({ telesale_id: 'NV2', telesale_name: 'Bùi Văn B' }),
    member({ telesale_id: 'NV1', telesale_name: 'An Văn A' }),
  ]);
  assert.deepEqual(rows.map(r => r.telesaleId), ['NV1', 'NV2']);
});

test('summarizeMembersBySale: không mutate input array/objects', () => {
  const input = [member({ telesale_id: 'NV1' })];
  const snapshot = JSON.stringify(input);
  summarizeMembersBySale(input);
  assert.equal(JSON.stringify(input), snapshot);
});

// --- 13. Drill-down exact Sale: KHÔNG dùng substring matching ---

test('matchesMembershipQueueFilter: telesaleId lọc EXACT match, KHÔNG substring — 2 telesale_id khác nhau (1 là substring của cái kia) không match nhầm', () => {
  const m1 = member({ telesale_id: 'NV1' });
  const m2 = member({ telesale_id: 'NV10' });
  assert.equal(matchesMembershipQueueFilter(m1, { telesaleId: 'NV1' }), true);
  assert.equal(matchesMembershipQueueFilter(m2, { telesaleId: 'NV1' }), false, 'NV10 không được match filter telesaleId="NV1" dù là substring');
});

test('matchesMembershipQueueFilter: "Đã giao" drill-down (telesaleId, không kèm buckets) -> match mọi bucket của đúng Sale đó', () => {
  const m1 = member({ telesale_id: 'NV1', trang_thai_cham_soc: 'Chưa gọi' });
  const m2 = member({ telesale_id: 'NV1', trang_thai_cham_soc: 'Quan tâm' });
  const m3 = member({ telesale_id: 'NV2', trang_thai_cham_soc: 'Chưa gọi' });
  assert.equal(matchesMembershipQueueFilter(m1, { telesaleId: 'NV1' }), true);
  assert.equal(matchesMembershipQueueFilter(m2, { telesaleId: 'NV1' }), true);
  assert.equal(matchesMembershipQueueFilter(m3, { telesaleId: 'NV1' }), false);
});

// --- 14. Summary "Đang chăm sóc" drill-down: match cả 2 existing bucket ---

test('matchesMembershipQueueFilter: buckets=["Đang chăm sóc","Gọi lại hôm nay"] match cả 2 bucket gốc, không đổi ý nghĩa `bucket` (single) hiện có', () => {
  const today = new Date().toISOString();
  const dangChamSoc = member({ trang_thai_cham_soc: 'Đã liên hệ' });
  const goiLaiHomNay = member({ trang_thai_cham_soc: 'Gọi lại', ngay_lien_he_tiep: today });
  const chuaGoi = member({ trang_thai_cham_soc: 'Chưa gọi' });
  const filter = { buckets: ['Đang chăm sóc', 'Gọi lại hôm nay'] as const };
  assert.equal(matchesMembershipQueueFilter(dangChamSoc, filter), true);
  assert.equal(matchesMembershipQueueFilter(goiLaiHomNay, filter), true);
  assert.equal(matchesMembershipQueueFilter(chuaGoi, filter), false);
});

test('matchesMembershipQueueFilter: `buckets` là field độc lập, không set thì không lọc gì (giống các filter khác) — `bucket` (single) vẫn hoạt động y hệt cũ', () => {
  const m = member({ trang_thai_cham_soc: 'Không nghe máy', ngay_lien_he_tiep: PAST }); // bucketOf -> 'Quá lịch'
  assert.equal(matchesMembershipQueueFilter(m, {}), true);
  assert.equal(matchesMembershipQueueFilter(m, { bucket: 'Quá lịch' }), true);
  assert.equal(matchesMembershipQueueFilter(m, { bucket: 'Quan tâm' }), false);
});

// --- 15. Existing queue filtering semantics — no regression ---

test('matchesMembershipQueueFilter: search/assignment filter cũ vẫn hoạt động y hệt khi telesaleId/buckets không set (backward-compatible)', () => {
  const m = member({ telesale_id: 'NV1', telesale_name: 'Hương', customer: { ten_KH: 'Nguyễn Văn Khách', so_dien_thoai: '0901234567' } });
  assert.equal(matchesMembershipQueueFilter(m, { search: 'hương' }), true);
  assert.equal(matchesMembershipQueueFilter(m, { search: '901234' }), true);
  assert.equal(matchesMembershipQueueFilter(m, { assignment: 'assigned' }), true);
  assert.equal(matchesMembershipQueueFilter(m, { assignment: 'unassigned' }), false);
});

// --- Component wiring (structural) ---

test('CampaignCskhWorkQueue.tsx: bảng "Tiến độ Sale" chỉ render khi canManageThisCampaign (cùng authority với action Phân Sale) — Sale thường không thấy cross-Sale summary', () => {
  const src = readFileSync(resolve(ROUTE_PATH_QUEUE), 'utf8');
  const idx = src.indexOf('<strong style={{ fontSize: 13.5 }}>Tiến độ Sale</strong>');
  assert.ok(idx >= 0, 'phải tìm được JSX render "Tiến độ Sale" (không phải chỉ comment nhắc tới)');
  const before = src.slice(Math.max(0, idx - 400), idx);
  assert.match(before, /canManageThisCampaign && saleProgress\.length > 0/, 'panel phải gate bởi canManageThisCampaign (cùng authority server /api/campaigns/[id]/members)');
});

test('CampaignCskhWorkQueue.tsx: saleProgress derive từ summarizeMembersBySale(members) — KHÔNG fetch API mới, KHÔNG gọi getKhachHang/getPipeline', () => {
  const src = readFileSync(resolve(ROUTE_PATH_QUEUE), 'utf8');
  assert.match(src, /const saleProgress = useMemo\(\(\) => summarizeMembersBySale\(members\), \[members\]\)/);
  assert.doesNotMatch(src, /getKhachHang\(\)|getPipeline\(\)/);
});

test('CampaignCskhWorkQueue.tsx: click metric cell gọi toggleSummaryFilter (reuse existing filtered/matchesMembershipQueueFilter, không tạo bảng khách thứ 2)', () => {
  const src = readFileSync(resolve(ROUTE_PATH_QUEUE), 'utf8');
  assert.match(src, /onClick=\{\(\) => toggleSummaryFilter\(sale, metric\.label, metric\.buckets\)\}/);
  assert.match(src, /telesaleId: summaryFilter\?\.telesaleId, buckets: summaryFilter\?\.buckets/, 'filtered useMemo phải merge summaryFilter vào matchesMembershipQueueFilter hiện có');
  const matches = [...src.matchAll(/<MembershipTable\b/g)];
  assert.equal(matches.length, 1, 'chỉ 1 bảng khách hàng (MembershipTable) — không tạo bảng thứ 2 cho drill-down');
});

test('CampaignCskhWorkQueue.tsx: có "Xóa lọc" khi summaryFilter đang active', () => {
  const src = readFileSync(resolve(ROUTE_PATH_QUEUE), 'utf8');
  assert.match(src, /Xóa lọc/);
  assert.match(src, /onClick=\{\(\) => setSummaryFilter\(null\)\}/);
});

test('campaign-cskh-range.ts: summarizeMembersBySale dùng isMembershipAssigned (telesale_id) làm authority — KHÔNG dùng assignment_status', () => {
  const src = readFileSync(resolve(RANGE_MODULE_PATH), 'utf8');
  const start = src.indexOf('export function summarizeMembersBySale');
  const end = src.indexOf('\n}', src.indexOf('rows.sort', start));
  const body = src.slice(start, end);
  assert.match(body, /isMembershipAssigned\(member\)/);
  assert.doesNotMatch(body, /assignment_status/);
});
