import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { filterByDataset } from '../../src/lib/crm-funnel/dataset';

// CUSTOMER DATASET (Option B, locked business decision) — Customer M:N
// Dataset qua CustomerDatasetMembership, 1 Customer vẫn CHỈ 1 bản ghi
// KhachHang duy nhất. Không thể chạy DB thật trong suite này (giống toàn bộ
// campaign.ts/import-batch.ts) — audit qua nguồn để khoá cấu trúc/authority,
// cộng 1 nhóm test runtime thật cho phần thuần (filterByDataset không truyền
// datasetId, KHÔNG cần DB).

const DATASET_LIB_PATH = 'src/lib/crm-funnel/dataset.ts';
const IMPORT_ROUTE_PATH = 'src/app/api/khach-hang/import-excel/route.ts';
const IMPORT_BATCH_LIB_PATH = 'src/lib/crm-funnel/import-batch.ts';
const KHACH_HANG_ROUTE_PATH = 'src/app/api/khach-hang/route.ts';
const CAMPAIGN_LIB_PATH = 'src/lib/crm-funnel/campaign.ts';
const DISTRIBUTE_ROUTE_PATH = 'src/app/api/campaigns/[id]/distribute/route.ts';
const MODAL_PATH = 'src/components/crm/CampaignDistributeModal.tsx';
const PAGE_PATH = 'src/app/khach-hang/page.tsx';
const SCHEMA_PATH = 'prisma/schema.prisma';
const DATASETS_ROUTE_PATH = 'src/app/api/datasets/route.ts';
const BACKFILL_PREFLIGHT_ROUTE_PATH = 'src/app/api/datasets/[id]/backfill-preflight/route.ts';
const BACKFILL_APPLY_ROUTE_PATH = 'src/app/api/datasets/[id]/backfill/route.ts';

// --- A. filterByDataset (pure passthrough khi không có datasetId) — runtime thật, không cần DB ---

test('filterByDataset: không truyền datasetId -> trả về NGUYÊN input (không đụng DB, không lọc gì)', async () => {
  const customers = [{ id_khach_hang: 'KH_1' }, { id_khach_hang: 'KH_2' }];
  const result = await filterByDataset(customers, undefined);
  assert.deepEqual(result, customers);
});

test('filterByDataset: datasetId rỗng ("") cũng coi như không lọc (giống undefined)', async () => {
  const customers = [{ id_khach_hang: 'KH_1' }];
  const result = await filterByDataset(customers, '');
  assert.deepEqual(result, customers);
});

// --- B. Dataset CRUD (dataset.ts) — audit qua nguồn, cùng convention DB-dependent như campaign.ts ---

test('createDataset/listDatasets/getDataset đều gọi assertTransactionalCrm() TRƯỚC khi đụng DB — Dataset là PG-CRM-only, không có đường fallback Google Sheets', () => {
  const src = readFileSync(resolve(DATASET_LIB_PATH), 'utf8');
  for (const fn of ['createDataset', 'listDatasets', 'getDataset']) {
    const fnStart = src.indexOf(`export async function ${fn}`);
    assert.ok(fnStart >= 0, `${fn} phải tồn tại`);
    const fnBody = src.slice(fnStart, fnStart + 300);
    assert.match(fnBody, /assertTransactionalCrm\(\)/, `${fn} phải gọi assertTransactionalCrm() ngay đầu`);
  }
});

test('getDatasetMembershipCustomerRefs: KHÔNG throw khi Postgres CRM chưa bật hoặc thiếu datasetId — trả về [] để /khach-hang luôn render được', () => {
  const src = readFileSync(resolve(DATASET_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function getDatasetMembershipCustomerRefs');
  const fnBody = src.slice(fnStart, fnStart + 400);
  assert.match(fnBody, /if\s*\(!datasetId \|\| !isPostgresEnabled\('crm'\) \|\| !process\.env\.DATABASE_URL\) return \[\];/);
  assert.doesNotMatch(fnBody, /assertTransactionalCrm/, 'hàm này KHÔNG được throw (dùng cho filter hiển thị, khác các hàm ghi/CRUD Admin)');
});

test('ensureCustomerDatasetMemberships: idempotent qua createMany + skipDuplicates, tự dedupe input bằng Set, có chunking (không 1 câu lệnh khổng lồ cho file hàng nghìn dòng)', () => {
  const src = readFileSync(resolve(DATASET_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function ensureCustomerDatasetMemberships');
  const fnBody = src.slice(fnStart, fnStart + 700);
  assert.match(fnBody, /new Set\(customerIds\)/, 'phải tự dedupe input');
  assert.match(fnBody, /createMany\(/);
  assert.match(fnBody, /skipDuplicates:\s*true/);
  assert.match(fnBody, /for\s*\(let start = 0; start < uniqueIds\.length; start \+= MEMBERSHIP_INSERT_CHUNK_SIZE\)/, 'phải chunk thay vì 1 createMany duy nhất cho toàn bộ input');
});

test('schema.prisma: @@unique([customer_id, dataset_id]) trên CustomerDatasetMembership — nền tảng cho skipDuplicates idempotent thật sự (không phải chỉ ở code)', () => {
  const src = readFileSync(resolve(SCHEMA_PATH), 'utf8');
  const modelStart = src.indexOf('model CustomerDatasetMembership');
  assert.ok(modelStart >= 0);
  const modelBody = src.slice(modelStart, src.indexOf('}', modelStart));
  assert.match(modelBody, /@@unique\(\[customer_id, dataset_id\]\)/);
});

// --- C. Import Excel: Dataset bắt buộc + membership cho CẢ ready lẫn already_exists ---

test('import-excel/route.ts: khi Postgres CRM bật, THIẾU cả dataset_id lẫn new_dataset_name -> 400, chặn TRƯỚC khi tạo Import Batch/customer nào', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  const resolveStart = src.indexOf("const datasetIdInput");
  const batchIdx = src.indexOf('const batchId: string | null = pgCrmEnabled');
  assert.ok(resolveStart >= 0 && batchIdx > resolveStart, 'dataset resolution phải nằm TRƯỚC khi tạo Import Batch');
  const resolveBody = src.slice(resolveStart, batchIdx);
  assert.match(resolveBody, /Vui lòng chọn hoặc tạo Dataset trước khi import/);
  assert.match(resolveBody, /status:\s*400/);
});

test('import-excel/route.ts: dataset_id hợp lệ (getDataset tìm thấy) -> dùng ĐÚNG Dataset đó, KHÔNG tự tạo Dataset trùng khi Admin đã chọn Dataset có sẵn', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  const resolveStart = src.indexOf("const datasetIdInput");
  const batchIdx = src.indexOf('const batchId: string | null = pgCrmEnabled');
  const resolveBody = src.slice(resolveStart, batchIdx);
  assert.match(resolveBody, /if\s*\(datasetIdInput\)\s*\{/);
  assert.match(resolveBody, /const found = await getDataset\(datasetIdInput\)/);
  assert.match(resolveBody, /Dataset đã chọn không còn tồn tại/);
});

test('import-excel/route.ts: createImportBatch nhận datasetId đã resolve, gói trong 1 object literal phẳng (không nested {}) — giữ đúng regex khoá totalRows: workRows.length của import-batch.test.ts', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  assert.match(src, /createImportBatch\(\{[^}]*totalRows:\s*workRows\.length[^}]*datasetId:\s*resolvedDatasetId \?\? undefined[^}]*\}\)/);
});

test('import-excel/route.ts: readyRecords mang theo id_khach_hang (mọi push site trong flushPgChunk + nhánh Google Sheets) — cần thiết để gọi ensureCustomerDatasetMemberships sau vòng lặp', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  const pushMatches = src.match(/readyRecords\.push\(\{[^}]*\}\)/g) || [];
  assert.ok(pushMatches.length >= 3, `phải có ít nhất 3 chỗ push vào readyRecords (2 trong flushPgChunk + 1 nhánh Google Sheets), thấy ${pushMatches.length}`);
  for (const call of pushMatches) {
    assert.match(call, /id_khach_hang:/, `mỗi readyRecords.push phải mang theo id_khach_hang: ${call}`);
  }
});

test('import-excel/route.ts: nhánh "already_exists" tra cứu id_khach_hang qua phoneKeyToCustomerId, gom vào existingCustomerIdsForDataset — Customer ĐÃ TỒN TẠI cũng phải được ghi CustomerDatasetMembership, không chỉ Customer mới tạo', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  const branchStart = src.indexOf("if (classification.status === 'already_exists') {");
  const branchEnd = src.indexOf('continue;', branchStart);
  const branch = src.slice(branchStart, branchEnd);
  assert.match(branch, /phoneKeyToCustomerId\.get\(phoneKey\(classification\.so_dien_thoai\)\)/);
  assert.match(branch, /existingCustomerIdsForDataset\.add\(/);
});

test('import-excel/route.ts: "duplicate_in_file" KHÔNG được gom vào existingCustomerIdsForDataset — dòng trùng trong file không tạo customer mới, không có id_khach_hang thật nào để gán Dataset (khác already_exists, vốn TRỎ ĐẾN 1 Customer thật đã có id)', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  const branchStart = src.indexOf("if (classification.status === 'duplicate_in_file') {");
  const branchEnd = src.indexOf('continue;', branchStart);
  const branch = src.slice(branchStart, branchEnd);
  assert.doesNotMatch(branch, /existingCustomerIdsForDataset/);
});

test('import-excel/route.ts: ensureCustomerDatasetMemberships gọi SAU vòng lặp (sau flushPgChunk cuối), dùng UNION readyRecords + existingCustomerIdsForDataset, bọc try/catch RIÊNG (không fail cả request nếu bước này lỗi)', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  const loopIdx = src.indexOf('for (let i = 0; i < workRows.length; i++)');
  const lastFlushIdx = src.lastIndexOf('await flushPgChunk();');
  const ensureIdx = src.indexOf('ensureCustomerDatasetMemberships(');
  assert.ok(loopIdx >= 0 && lastFlushIdx > loopIdx && ensureIdx > lastFlushIdx, 'ensureCustomerDatasetMemberships phải được gọi SAU flushPgChunk cuối (sau khi vòng lặp xử lý dòng xong)');
  const callSiteStart = src.lastIndexOf('if (pgCrmEnabled && resolvedDatasetId) {', ensureIdx);
  const callSiteBody = src.slice(callSiteStart, ensureIdx + 400);
  assert.match(callSiteBody, /readyRecords\.map\(r => r\.id_khach_hang\)/);
  assert.match(callSiteBody, /\.\.\.existingCustomerIdsForDataset/);
  assert.match(callSiteBody, /try\s*\{/);
  assert.match(callSiteBody, /catch\s*\(e:\s*unknown\)/);
  assert.match(callSiteBody, /datasetMembershipWarning/);
});

test('import-excel/route.ts: vẫn chỉ đúng 1 vòng lặp "for (let i" xử lý dòng — thêm dataset resolution/membership KHÔNG được tạo vòng lặp thứ 2 (regression guard, cùng bất biến với import-batch.test.ts)', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  const forLetMatches = src.match(/for \(let i/g) || [];
  assert.equal(forLetMatches.length, 1);
});

test('ImportResult interface: datasetId/datasetName/datasetMembershipCount là field bắt buộc, datasetMembershipWarning optional — response luôn cho biết Dataset của lần import này (null nếu PG CRM tắt, giống batchId)', () => {
  const src = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  const ifaceStart = src.indexOf('export interface ImportResult');
  const ifaceEnd = src.indexOf('\n}', ifaceStart);
  const ifaceBody = src.slice(ifaceStart, ifaceEnd);
  assert.match(ifaceBody, /datasetId:\s*string \| null;/);
  assert.match(ifaceBody, /datasetName:\s*string \| null;/);
  assert.match(ifaceBody, /datasetMembershipCount:\s*number;/);
  assert.match(ifaceBody, /datasetMembershipWarning\?:\s*string;/);
});

test('import-batch.ts: createImportBatch nhận datasetId?: string optional -> mọi call site cũ (không truyền datasetId) vẫn hợp lệ, không breaking change', () => {
  const src = readFileSync(resolve(IMPORT_BATCH_LIB_PATH), 'utf8');
  assert.match(src, /export async function createImportBatch\(input:\s*\{[^}]*datasetId\?:\s*string[^}]*\}\)/);
  assert.match(src, /dataset_id:\s*input\.datasetId,/);
});

test('import-batch.ts: listImportBatches/getImportBatchCustomers/getImportBatch include Dataset qua 1 query duy nhất (không N+1) để Lịch sử Import hiện Dataset per batch', () => {
  const src = readFileSync(resolve(IMPORT_BATCH_LIB_PATH), 'utf8');
  const listFn = src.slice(src.indexOf('export async function listImportBatches'), src.indexOf('export async function getImportBatch('));
  assert.match(listFn, /include:\s*\{\s*dataset:\s*\{\s*select:\s*\{\s*id:\s*true,\s*name:\s*true\s*\}\s*\}\s*\}/);
});

// --- D. GET /api/khach-hang: datasetId filter — mirror campaignStatus pattern (scope-preserving total) ---

test('route.ts (GET /api/khach-hang): datasetId filter áp dụng SAU khi "total" đã tính (cùng tinh thần campaignStatus) — Dataset KHÔNG được làm lệch total khỏi scope search/nguon/sale/du_an/date hiện có', () => {
  const src = readFileSync(resolve(KHACH_HANG_ROUTE_PATH), 'utf8');
  const totalIdx = src.indexOf('const total = data.length;');
  const datasetFilterIdx = src.indexOf('if (datasetId) data = data.filter(');
  assert.ok(totalIdx >= 0 && datasetFilterIdx > totalIdx, 'datasetId filter phải áp dụng SAU khi total đã gán');
});

test('route.ts (GET /api/khach-hang): datasetMembershipRefs query RIÊNG (không gộp vào Promise.all 4-tuple đã khoá của getCampaignMembershipCustomerRefs) — chỉ chạy khi có datasetId', () => {
  const src = readFileSync(resolve(KHACH_HANG_ROUTE_PATH), 'utf8');
  // Giữ nguyên đúng regex đã khoá ở customer-campaign-visibility.test.ts —
  // đảm bảo thêm Dataset KHÔNG phá vỡ shape Promise.all 4-tuple hiện có.
  assert.match(src, /Promise\.all\(\[\s*getDuAn\(\), getNhanVien\(\), getKhachHang\(\), getCampaignMembershipCustomerRefs\(\),?\s*\]\)/);
  assert.match(src, /const datasetMembershipRefs = datasetId \? await getDatasetMembershipCustomerRefs\(datasetId\) : \[\];/);
});

test('route.ts (GET /api/khach-hang): filteredTotal tính SAU CẢ campaignStatus lẫn datasetId filter — client phân trang đúng tập đang thực sự hiển thị', () => {
  const src = readFileSync(resolve(KHACH_HANG_ROUTE_PATH), 'utf8');
  const campaignFilterIdx = src.indexOf('data = data.filter(kh => matchesCampaignStatusFilter(');
  const datasetFilterIdx = src.indexOf('if (datasetId) data = data.filter(');
  const filteredTotalIdx = src.indexOf('const filteredTotal = data.length;');
  assert.ok(campaignFilterIdx >= 0 && datasetFilterIdx > campaignFilterIdx && filteredTotalIdx > datasetFilterIdx);
});

// --- E. Customer Range/Filter → Campaign: Dataset LÀ 1 chiều filter (KHÁC campaignStatus, vốn bị loại khỏi 2 hàm này) ---

test('campaign.ts: resolveCustomerIdsByFilter áp dụng filterByDataset SAU matchesCustomerBulkFilter, không thêm cap/slice/limit nào, vẫn reuse đúng matchesCustomerBulkFilter (không viết lại filter)', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function resolveCustomerIdsByFilter');
  const fnEnd = src.indexOf('\n}', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert.match(fnBody, /matchesCustomerBulkFilter\(/);
  assert.match(fnBody, /filterByDataset\(matched, filter\.datasetId\)/);
  assert.doesNotMatch(fnBody, /\.slice\(|take:|limit/i);
});

test('campaign.ts: resolveCustomerIdsByRange áp dụng filterByDataset TRƯỚC resolveListRange — "Từ x đến y" khi có Dataset là vị trí TRONG tập đã lọc theo Dataset, không phải toàn bộ (đảm bảo STT/range xác định/deterministic, không leak customer ngoài Dataset)', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function resolveCustomerIdsByRange');
  const filterByDatasetIdx = src.indexOf('filterByDataset(', fnStart);
  const resolveListRangeIdx = src.indexOf('resolveListRange(', fnStart);
  assert.ok(filterByDatasetIdx > fnStart && resolveListRangeIdx > filterByDatasetIdx, 'filterByDataset phải chạy TRƯỚC resolveListRange (thu hẹp tập rồi mới cắt theo vị trí)');
  const fnBody = src.slice(fnStart, src.indexOf('\n}', fnStart));
  assert.match(fnBody, /orderBy:\s*\{\s*ngay_tao:\s*'desc'\s*\}/, 'order vẫn phải giữ nguyên ngay_tao desc — Dataset chỉ thu hẹp tập, không đổi thứ tự');
  assert.doesNotMatch(fnBody, /campaignMembership|CampaignMembership/i, 'vẫn KHÔNG được đụng CampaignMembership — Dataset tách biệt hoàn toàn khỏi authority đó');
});

test('CustomerRangeSelection/CustomerBulkFilter: datasetId là field optional -> mọi call site cũ (không truyền datasetId, VD Sync/Import cũ) vẫn hợp lệ, không breaking change', () => {
  const bulkFilterSrc = readFileSync(resolve('src/lib/khach-hang-bulk-filter.ts'), 'utf8');
  const rangeSrc = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  assert.match(bulkFilterSrc, /datasetId\?:\s*string;/);
  const rangeIfaceStart = rangeSrc.indexOf('export interface CustomerRangeSelection');
  const rangeIfaceBody = rangeSrc.slice(rangeIfaceStart, rangeSrc.indexOf('}', rangeIfaceStart));
  assert.match(rangeIfaceBody, /datasetId\?:\s*string;/);
});

// --- F. Distribute route + Modal: datasetId forward đúng cho customer_filter/customer_range ---

test('distribute route: nhánh customer_filter forward datasetId (string) vào resolveCustomerIdsByFilter, nhánh customer_range forward vào resolveCustomerIdsByRange — Dataset filter thực sự có hiệu lực khi bulk-add vào Campaign', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const filterBranchStart = src.indexOf('body?.customer_filter');
  const filterBranchEnd = src.indexOf('} else if (body?.customer_range', filterBranchStart);
  const filterBranch = src.slice(filterBranchStart, filterBranchEnd);
  assert.match(filterBranch, /datasetId:\s*typeof filterInput\.datasetId === 'string' \? filterInput\.datasetId : undefined,/);

  const rangeBranchStart = src.indexOf('body?.customer_range');
  const rangeBranchEnd = src.indexOf('} else if (body?.membership_range', rangeBranchStart);
  const rangeBranch = src.slice(rangeBranchStart, rangeBranchEnd);
  assert.match(rangeBranch, /datasetId:\s*typeof rangeInput\.datasetId === 'string' \? rangeInput\.datasetId : undefined,/);
});

test('CampaignDistributeModal.tsx: customerFilter/customerRange props có datasetId optional, forward đúng vào body customer_filter/customer_range khi submit', () => {
  const src = readFileSync(resolve(MODAL_PATH), 'utf8');
  assert.match(src, /customerFilter\?:\s*\{[^}]*datasetId\?:\s*string[^}]*\}/);
  assert.match(src, /customerRange\?:\s*\{[^}]*datasetId\?:\s*string[^}]*\}/);
  assert.match(src, /customer_filter:\s*\{[^}]*datasetId:\s*customerFilter\.datasetId[^}]*\}/);
  assert.match(src, /customer_range:\s*\{[^}]*datasetId:\s*customerRange\.datasetId[^}]*\}/);
});

test('khach-hang/page.tsx: cả 2 lời gọi CampaignDistributeModal (selectAllMatching + Customer Range) đều forward datasetFilter hiện tại (|| undefined khi rỗng) — filter Dataset đang xem được áp dụng đúng khi tạo Campaign từ bộ lọc/range', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /customerFilter=\{selectAllMatching \? \{ search, from: fromDate, to: toDate, datasetId: datasetFilter \|\| undefined, count: total \} : undefined\}/);
  assert.match(src, /customerRange=\{\{ from: rangeFromNum, to: rangeToNum, search, dateFrom: fromDate, dateTo: toDate, datasetId: datasetFilter \|\| undefined, count: rangeValidation\.count \}\}/);
});

// --- G. Backfill remediation: preflight/apply idempotent, chỉ Customer ĐƯỢC TẠO bởi đúng batch đã chọn ---

test('getDatasetBackfillPreflight: loại batch ĐÃ THUỘC Dataset KHÁC khỏi eligibleBatchIds — không tự ý cướp/gộp provenance của Dataset khác', () => {
  const src = readFileSync(resolve(DATASET_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function getDatasetBackfillPreflight');
  const fnBody = src.slice(fnStart, src.indexOf('\n}', fnStart));
  assert.match(fnBody, /assignedToOtherDataset:\s*Boolean\(b\.dataset_id\) && b\.dataset_id !== datasetId/);
  assert.match(fnBody, /eligibleBatchIds\s*=\s*batchInfos\.filter\(b => !b\.assignedToOtherDataset\)/);
  assert.match(fnBody, /import_batch_id:\s*\{\s*in:\s*eligibleBatchIds\s*\}/, 'chỉ tính Customer mà import_batch_id trỏ ĐÚNG batch đủ điều kiện — không suy diễn theo tên file/thời gian');
});

test('applyDatasetBackfill: re-check eligibility TẠI THỜI ĐIỂM apply (không chỉ tin preflight) tránh TOCTOU, reuse ensureCustomerDatasetMemberships (không viết lại logic idempotent riêng)', () => {
  const src = readFileSync(resolve(DATASET_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function applyDatasetBackfill');
  const fnBody = src.slice(fnStart, src.indexOf('\n}', fnStart));
  assert.match(fnBody, /eligibleBatchIds\s*=\s*batches\.filter\(b => !b\.dataset_id \|\| b\.dataset_id === datasetId\)/);
  assert.match(fnBody, /ensureCustomerDatasetMemberships\(customers\.map\(c => c\.id_khach_hang\), datasetId\)/);
  assert.doesNotMatch(fnBody, /createMany/, 'KHÔNG được tự viết lại createMany/skipDuplicates ở đây — phải đi qua ensureCustomerDatasetMemberships duy nhất');
});

test('applyDatasetBackfill: updateMany gán dataset_id CHỈ cho batch đang dataset_id=null — KHÔNG ghi đè batch đã có Dataset khác (kể cả nếu lọt qua bước filter, vẫn còn 1 lớp an toàn ở chính câu update)', () => {
  const src = readFileSync(resolve(DATASET_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function applyDatasetBackfill');
  const fnBody = src.slice(fnStart, src.indexOf('\n}', fnStart));
  assert.match(fnBody, /updateMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*eligibleBatchIds\s*\},\s*dataset_id:\s*null\s*\}/);
});

test('backfill API routes: GET preflight và POST apply đều Admin-only (isCrmAdmin), preflight hoàn toàn read-only (không gọi applyDatasetBackfill)', () => {
  const preflightSrc = readFileSync(resolve(BACKFILL_PREFLIGHT_ROUTE_PATH), 'utf8');
  const applySrc = readFileSync(resolve(BACKFILL_APPLY_ROUTE_PATH), 'utf8');
  assert.match(preflightSrc, /if\s*\(!isCrmAdmin\(user\)\)/);
  assert.match(preflightSrc, /status:\s*403/);
  assert.doesNotMatch(preflightSrc, /applyDatasetBackfill/, 'preflight route KHÔNG được gọi apply — chỉ xem trước');
  assert.match(applySrc, /if\s*\(!isCrmAdmin\(user\)\)/);
  assert.match(applySrc, /status:\s*403/);
  assert.match(applySrc, /getDatasetBackfillPreflight\(/, 'apply route phải re-check preflight (dataset tồn tại) ngay trước khi ghi, tránh ghi vào Dataset đã bị xóa giữa chừng');
  assert.match(applySrc, /applyDatasetBackfill\(/);
});

test('/api/datasets route: GET yêu cầu đăng nhập (mọi user xem được, dùng cho dropdown), POST tạo Dataset yêu cầu isCrmAdmin (cùng tier với import Excel)', () => {
  const src = readFileSync(resolve(DATASETS_ROUTE_PATH), 'utf8');
  const getStart = src.indexOf('export async function GET');
  const postStart = src.indexOf('export async function POST');
  const getBody = src.slice(getStart, postStart);
  const postBody = src.slice(postStart);
  assert.match(getBody, /if\s*\(!user\)/);
  assert.doesNotMatch(getBody, /isCrmAdmin/, 'GET (list) không cần Admin — dùng cho dropdown filter của mọi user xem được customer');
  assert.match(postBody, /if\s*\(!isCrmAdmin\(user\)\)/);
});

// --- H. Delete-safety: Dataset deletion KHÔNG BAO GIỜ cascade sang Customer/Campaign/CampaignMembership/Handoff/Pipeline ---

test('schema.prisma: Dataset model KHÔNG có bất kỳ quan hệ nào tới KhachHang/Campaign/CampaignMembership/CrmHandoff/Pipeline — Dataset hoàn toàn tách biệt khỏi các authority đó (chỉ liên hệ CrmImportBatch + CustomerDatasetMembership)', () => {
  const src = readFileSync(resolve(SCHEMA_PATH), 'utf8');
  const modelStart = src.indexOf('model Dataset {');
  const modelBody = src.slice(modelStart, src.indexOf('\n}', modelStart));
  assert.doesNotMatch(modelBody, /KhachHang|Campaign|CrmHandoff|Pipeline/);
  assert.match(modelBody, /import_batches\s+CrmImportBatch\[\]/);
  assert.match(modelBody, /memberships\s+CustomerDatasetMembership\[\]/);
});

test('schema.prisma: CustomerDatasetMembership CHỈ có customer_id dạng String thô (không phải quan hệ Prisma tới KhachHang) — xóa Dataset (Restrict) hay xóa membership không bao giờ tự động đụng bảng khach_hang qua cascade', () => {
  const src = readFileSync(resolve(SCHEMA_PATH), 'utf8');
  const modelStart = src.indexOf('model CustomerDatasetMembership');
  const modelBody = src.slice(modelStart, src.indexOf('\n}', modelStart));
  assert.match(modelBody, /customer_id\s+String/);
  assert.doesNotMatch(modelBody, /@relation[^\n]*KhachHang/);
});

test('campaign.ts: KHÔNG có Campaign.dataset_id nào được thêm — lock tường minh business đã cấm (Dataset và Campaign là 2 chiều filter độc lập, không gộp)', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const schemaSrc = readFileSync(resolve(SCHEMA_PATH), 'utf8');
  assert.doesNotMatch(src, /dataset_id/i, 'campaign.ts tuyệt đối không được đụng dataset_id trên Campaign');
  const campaignModelStart = schemaSrc.indexOf('model Campaign {');
  const campaignModelBody = schemaSrc.slice(campaignModelStart, schemaSrc.indexOf('\nmodel ', campaignModelStart + 10));
  assert.doesNotMatch(campaignModelBody, /dataset_id/i, 'model Campaign trong schema.prisma tuyệt đối không được có cột dataset_id');
});
