import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isCustomerInCampaign, matchesCampaignStatusFilter, summarizeCampaignMembership,
} from '../../src/lib/khach-hang-campaign-status';

// CUSTOMER USED-IN-CAMPAIGN VISIBILITY. Authority tại /khach-hang: "Customer
// đã vào Campaign = tồn tại >= 1 CampaignMembership với customer_id =
// Customer.id" — KHÔNG dùng telesale_id (đó là authority riêng của
// /phan-khach → Theo Campaign, isMembershipAssigned trong campaign-cskh-range.ts,
// hoàn toàn độc lập, xem tests/crm/campaign-assignment-visibility.test.ts).

const ROUTE_PATH = 'src/app/api/khach-hang/route.ts';
const PAGE_PATH = 'src/app/khach-hang/page.tsx';
const CAMPAIGN_LIB_PATH = 'src/lib/crm-funnel/campaign.ts';
const RANGE_STATUS_ROUTE_PATH = 'src/app/api/khach-hang/range-campaign-status/route.ts';

// --- A. Pure predicate/count helpers (khach-hang-campaign-status.ts) ---

test('isCustomerInCampaign: true khi customer_id có trong membershipCustomerIds, false khi không', () => {
  const memberships = new Set(['KH_1', 'KH_2']);
  assert.equal(isCustomerInCampaign('KH_1', memberships), true);
  assert.equal(isCustomerInCampaign('KH_3', memberships), false);
});

test('no membership -> opacity bình thường (matchesCampaignStatusFilter "not_in_campaign" = true, "in_campaign" = false)', () => {
  const memberships = new Set<string>();
  assert.equal(matchesCampaignStatusFilter('KH_1', memberships, 'not_in_campaign'), true);
  assert.equal(matchesCampaignStatusFilter('KH_1', memberships, 'in_campaign'), false);
  assert.equal(matchesCampaignStatusFilter('KH_1', memberships, 'all'), true);
});

test('one membership -> "Đã vào Campaign" (in_campaign = true, not_in_campaign = false)', () => {
  const memberships = new Set(['KH_1']);
  assert.equal(matchesCampaignStatusFilter('KH_1', memberships, 'in_campaign'), true);
  assert.equal(matchesCampaignStatusFilter('KH_1', memberships, 'not_in_campaign'), false);
});

test('multiple memberships (Customer A thuộc cả Campaign 1 và Campaign 2) -> vẫn CHỈ MỘT trạng thái "Đã vào Campaign" (distinct customer_id, không đếm theo số Campaign)', () => {
  // membershipCustomerIds luôn là distinct customer_id (getCampaignMembershipCustomerRefs
  // dùng distinct: ['customer_id']) — 1 customer dù thuộc bao nhiêu Campaign
  // cũng chỉ xuất hiện đúng 1 lần trong Set, nên kết quả filter luôn nhị phân.
  const memberships = new Set(['KH_A']);
  assert.equal(matchesCampaignStatusFilter('KH_A', memberships, 'in_campaign'), true);
  const summary = summarizeCampaignMembership(['KH_A', 'KH_B'], memberships);
  assert.deepEqual(summary, { inCampaign: 1, notInCampaign: 1 });
});

test('filter Tất cả/Chưa vào/Đã vào: matchesCampaignStatusFilter phủ đủ 3 nhánh, "all" luôn true bất kể trạng thái', () => {
  const memberships = new Set(['KH_1']);
  for (const filter of ['all', 'in_campaign', 'not_in_campaign'] as const) {
    const r1 = matchesCampaignStatusFilter('KH_1', memberships, filter);
    const r2 = matchesCampaignStatusFilter('KH_2', memberships, filter);
    if (filter === 'all') { assert.equal(r1, true); assert.equal(r2, true); }
    if (filter === 'in_campaign') { assert.equal(r1, true); assert.equal(r2, false); }
    if (filter === 'not_in_campaign') { assert.equal(r1, false); assert.equal(r2, true); }
  }
});

test('counts đúng: summarizeCampaignMembership trên tập hỗn hợp -> inCampaign + notInCampaign = total, không đếm trùng/thiếu', () => {
  const memberships = new Set(['KH_1', 'KH_3', 'KH_5']);
  const ids = ['KH_1', 'KH_2', 'KH_3', 'KH_4', 'KH_5', 'KH_6', 'KH_7'];
  const summary = summarizeCampaignMembership(ids, memberships);
  assert.deepEqual(summary, { inCampaign: 3, notInCampaign: 4 });
  assert.equal(summary.inCampaign + summary.notInCampaign, ids.length);
});

test('summarizeCampaignMembership: danh sách rỗng -> {0,0}, không lỗi', () => {
  assert.deepEqual(summarizeCampaignMembership([], new Set()), { inCampaign: 0, notInCampaign: 0 });
});

// --- B. Wiring: GET /api/khach-hang ---

test('route.ts: GET dùng getCampaignMembershipCustomerRefs() ĐÚNG 1 lần trong Promise.all cùng getDuAn/getNhanVien/getKhachHang — KHÔNG query CampaignMembership riêng theo từng customer (N+1)', () => {
  const src = readFileSync(resolve(ROUTE_PATH), 'utf8');
  const getStart = src.indexOf('export async function GET');
  const postStart = src.indexOf('export async function POST');
  const getBody = src.slice(getStart, postStart);
  assert.match(getBody, /Promise\.all\(\[\s*getDuAn\(\), getNhanVien\(\), getKhachHang\(\), getCampaignMembershipCustomerRefs\(\),?\s*\]\)/);
  assert.doesNotMatch(getBody, /allCustomers\.map[\s\S]{0,80}getCampaignMembership/, 'không được gọi truy vấn CampaignMembership bên trong .map/.forEach theo từng customer');
});

test('route.ts: "total" (dùng cho Customer Range + "Chọn tất cả") được tính TRƯỚC khi áp campaignStatus filter — campaignStatus KHÔNG được làm lệch total khỏi scope search/nguon/sale/du_an/date hiện có', () => {
  const src = readFileSync(resolve(ROUTE_PATH), 'utf8');
  const totalIdx = src.indexOf('const total = data.length;');
  const filterIdx = src.indexOf('data = data.filter(kh => matchesCampaignStatusFilter(');
  assert.ok(totalIdx >= 0 && filterIdx > totalIdx, 'const total phải được gán TRƯỚC dòng filter theo campaignStatus');
});

test('route.ts: campaignSummary tính trên CÙNG scope với "total" (trước khi áp campaignStatus) — 3 số Tổng/Đã vào/Chưa vào không đổi theo tab đang chọn', () => {
  const src = readFileSync(resolve(ROUTE_PATH), 'utf8');
  const summaryIdx = src.indexOf('const campaignSummary = summarizeCampaignMembership(');
  const filterIdx = src.indexOf('data = data.filter(kh => matchesCampaignStatusFilter(');
  assert.ok(summaryIdx >= 0 && summaryIdx < filterIdx, 'campaignSummary phải tính TRƯỚC khi data bị lọc lại theo campaignStatus');
});

test('route.ts: response trả cả filteredTotal (đếm SAU campaignStatus, dùng phân trang bảng) lẫn total (KHÔNG đổi ý nghĩa) — client có đủ cả 2 con số', () => {
  const src = readFileSync(resolve(ROUTE_PATH), 'utf8');
  const getStart = src.indexOf('export async function GET');
  const postStart = src.indexOf('export async function POST');
  const getBody = src.slice(getStart, postStart);
  assert.match(getBody, /total,\s*\n\s*filteredTotal,/);
});

test('route.ts: badge "Đã vào Campaign" chỉ query tên Campaign cho id CỦA TRANG đang hiển thị (paginatedData), không phải toàn bộ data đã lọc — tránh N+1/tải thừa với dataset hàng nghìn dòng', () => {
  const src = readFileSync(resolve(ROUTE_PATH), 'utf8');
  const callIdx = src.indexOf('getCampaignNamesByCustomerIds(');
  assert.ok(callIdx >= 0);
  const callSlice = src.slice(callIdx, callIdx + 200);
  assert.match(callSlice, /paginatedData\.filter/);
});

// --- C. campaign.ts: getCampaignNamesByCustomerIds / previewCustomerRangeCampaignStatus ---

test('campaign.ts: getCampaignNamesByCustomerIds không throw khi Postgres CRM chưa bật (trả {} rỗng) — trang /khach-hang phải luôn render được', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function getCampaignNamesByCustomerIds');
  const fnEnd = src.indexOf('\n}', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert.match(fnBody, /if\s*\(customerIds\.length === 0 \|\| !isPostgresEnabled\('crm'\) \|\| !process\.env\.DATABASE_URL\) return \{\};/);
  assert.doesNotMatch(fnBody, /\.create\(|\.update\(|\.delete/, 'phải hoàn toàn read-only');
});

test('campaign.ts: previewCustomerRangeCampaignStatus tái dùng NGUYÊN resolveCustomerIdsByRange (KHÔNG viết lại filter/order riêng) — Customer Range → Campaign là Locked authority', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function previewCustomerRangeCampaignStatus');
  const fnEnd = src.indexOf('\n}', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert.match(fnBody, /resolveCustomerIdsByRange\(selection\)/);
  assert.match(fnBody, /getCampaignMembershipCustomerRefs\(\)/);
  assert.doesNotMatch(fnBody, /orderBy|matchesCustomerBulkFilter|resolveListRange\(/, 'không được viết lại query/filter/range — chỉ đối chiếu thêm kết quả đã resolve sẵn');
});

// --- D. range-campaign-status route: Admin-only, read-only ---

test('range-campaign-status/route.ts: Admin-only (isCrmAdmin), read-only, dùng previewCustomerRangeCampaignStatus (không tự viết logic riêng)', () => {
  const src = readFileSync(resolve(RANGE_STATUS_ROUTE_PATH), 'utf8');
  assert.match(src, /if\s*\(!isCrmAdmin\(user\)\)/);
  assert.match(src, /status:\s*403/);
  assert.match(src, /previewCustomerRangeCampaignStatus\(/);
  assert.doesNotMatch(src, /\.create\(|\.update\(|\.delete|bulkAddAndDistribute/, 'route preview phải hoàn toàn read-only, không được ghi CampaignMembership');
});

// --- E. UI wiring: /khach-hang page ---

test('page.tsx: filter tri-state Tất cả/Chưa vào Campaign/Đã vào Campaign — 3 lựa chọn, set campaignStatus + reset page', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /'all', 'Tất cả'/);
  assert.match(src, /'not_in_campaign', 'Chưa vào Campaign'/);
  assert.match(src, /'in_campaign', 'Đã vào Campaign'/);
  assert.match(src, /setCampaignStatus\(key\); setPage\(1\);/);
});

test('page.tsx: summary "Tổng X · Đã vào Campaign Y · Chưa vào Campaign Z" dùng "total" (scope, KHÔNG đổi theo tab) + campaignSummary từ server — không tự tính lại ở client', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /Tổng \{total\} · Đã vào Campaign \{campaignSummary\.inCampaign\} · Chưa vào Campaign \{campaignSummary\.notInCampaign\}/);
});

test('page.tsx: fetchData() gửi campaignStatus lên server khi khác "all" — filter phải server-side/authoritative, không tự lọc lại 20 dòng đã tải', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const fetchStart = src.indexOf('const fetchData = useCallback');
  const fetchEnd = src.indexOf('}, [page, search, fromDate, toDate, campaignStatus]);');
  assert.ok(fetchStart >= 0 && fetchEnd > fetchStart, 'fetchData phải refetch khi campaignStatus đổi (có trong dependency array)');
  const fetchBody = src.slice(fetchStart, fetchEnd);
  assert.match(fetchBody, /if \(campaignStatus !== 'all'\) params\.set\('campaignStatus', campaignStatus\);/);
});

test('page.tsx: bảng dùng filteredTotal (KHÔNG phải total) để tính totalPages/"Hiển thị x-y/z" — phân trang phải khớp đúng tập ĐANG hiển thị (post campaignStatus), không lệch khi tab != Tất cả', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /const totalPages = Math\.ceil\(filteredTotal \/ limit\);/);
  assert.match(src, /Hiển thị \{\(page - 1\) \* limit \+ 1\}–\{Math\.min\(page \* limit, filteredTotal\)\} \/ \{filteredTotal\}/);
});

test('page.tsx: row đã vào Campaign -> opacity 0.6 + badge "Đã vào Campaign" với tooltip tên Campaign; row chưa vào -> opacity bình thường (không có style override)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /const campaignNames = campaignByCustomer\[kh\.id_khach_hang\];/);
  assert.match(src, /const inCampaign = Boolean\(campaignNames && campaignNames\.length > 0\);/);
  assert.match(src, /style=\{inCampaign \? \{ opacity: 0\.6 \} : undefined\}/);
  assert.match(src, /title=\{`Đã vào Campaign: \$\{campaignNames!\.join\(', '\)\}`\}/);
  assert.match(src, />\s*Đã vào Campaign\s*<\/span>/);
});

test('page.tsx: Customer Range preview (validateListRangeAgainstTotal) KHÔNG bị đổi bởi campaignStatus — dùng đúng "total" như cũ (regression khoá bởi campaign-customer-range.test.ts), chỉ nối thêm text preview campaign status', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /validateListRangeAgainstTotal\(total, \{ from: rangeFromNum, to: rangeToNum \}\)/);
  assert.match(src, /rangeCampaignPreview && ` · Đã vào Campaign \$\{rangeCampaignPreview\.inCampaign\} · Chưa vào Campaign \$\{rangeCampaignPreview\.notInCampaign\}`/);
});

test('page.tsx: fetch range-campaign-status KHÔNG gửi campaignStatus — Customer Range range preview độc lập hoàn toàn với tab tri-state (đúng semantics resolveCustomerIdsByRange, không nhận field này)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const paramsStart = src.indexOf('const params = new URLSearchParams({ from: String(rangeFromNumForPreview)');
  const fetchIdx = src.indexOf('/api/khach-hang/range-campaign-status');
  assert.ok(paramsStart >= 0 && fetchIdx > paramsStart);
  const codeOnly = src.slice(paramsStart, fetchIdx);
  assert.doesNotMatch(codeOnly, /params\.set\('campaignStatus'/, 'không được set campaignStatus vào query của range preview — Customer Range chỉ nhận search/dateFrom/dateTo');
});

test('page.tsx: "Chọn tất cả N phù hợp bộ lọc" banner ẩn khi campaignStatus khác "all" — tránh Admin chọn nhầm tập rộng hơn tập đang xem trong tab Đã/Chưa vào Campaign', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /campaignStatus === 'all' && isAdmin && allVisibleSelected && !selectAllMatching && total > data\.length/);
});

// --- F. Không side-effect lên telesale/ownership/Handoff/Pipeline ---

test('không có mutation nào tới CampaignMembership trong toàn bộ code path visibility mới (route.ts GET, khach-hang-campaign-status.ts, range-campaign-status route) — chỉ đọc, không ghi', () => {
  const files = [ROUTE_PATH, 'src/lib/khach-hang-campaign-status.ts', RANGE_STATUS_ROUTE_PATH];
  for (const file of files) {
    const src = readFileSync(resolve(file), 'utf8');
    assert.doesNotMatch(src, /campaignMembership\.(create|update|delete)|telesale_id\s*=[^=]|crmHandoff|pipeline\.(create|update)|bulkAddAndDistribute/i, `${file} không được có side-effect ghi dữ liệu`);
  }
});

test('regression: matchesMembershipQueueFilter/isMembershipAssigned (authority telesale_id của /phan-khach → Theo Campaign) KHÔNG bị đụng bởi feature mới — 2 authority tách biệt hoàn toàn', () => {
  const src = readFileSync(resolve('src/lib/campaign-cskh-range.ts'), 'utf8');
  assert.doesNotMatch(src, /khach-hang-campaign-status|matchesCampaignStatusFilter|summarizeCampaignMembership/, 'campaign-cskh-range.ts (authority telesale_id) không được import module authority mới của /khach-hang');
});
