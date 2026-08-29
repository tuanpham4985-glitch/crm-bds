import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchesCustomerBulkFilter } from '../../src/lib/khach-hang-bulk-filter';
import { planDistribution, planBulkDistribution } from '../../src/lib/crm-funnel/campaign';

// FIX CAMPAIGN CREATION + BULK CUSTOMER TO CAMPAIGN — root cause: /khach-hang
// đã CÓ SẴN đường tạo Campaign + bulk-add CampaignMembership (CampaignDistributeModal,
// nút "Thêm vào Campaign"/"+ Tạo Campaign mới", POST /api/campaigns +
// POST /api/campaigns/[id]/distribute mode='none') nhưng KHÔNG dùng được ở
// scale thật (3.366 customer) vì selection chỉ theo trang hiện tại
// (khach-hang-selection.ts: toggleSelectAllVisible chỉ set id của visibleIds
// = trang đang xem, tối đa 20 dòng/trang). Việc này thêm "Chọn tất cả N
// khách hàng phù hợp bộ lọc" (server tự resolve id, không nhận id list từ
// client cho đường này) + đổi tên nút "Thêm vào Campaign" -> "Tạo Campaign"
// cho rõ luồng, tái dùng TOÀN BỘ authority/logic tạo Campaign + phân Sale
// hiện có (bulkAddAndDistribute, eligibleCampaignSales, canManageCampaign).

const PAGE_PATH = 'src/app/khach-hang/page.tsx';
const MODAL_PATH = 'src/components/crm/CampaignDistributeModal.tsx';
const DISTRIBUTE_ROUTE_PATH = 'src/app/api/campaigns/[id]/distribute/route.ts';
const CAMPAIGN_LIB_PATH = 'src/lib/crm-funnel/campaign.ts';
const PHAN_KHACH_PATH = 'src/app/phan-khach/page.tsx';
const WORK_QUEUE_PATH = 'src/components/crm/CampaignCskhWorkQueue.tsx';

// --- A. matchesCustomerBulkFilter (pure) ---

test('matchesCustomerBulkFilter: không filter nào -> luôn true', () => {
  assert.equal(matchesCustomerBulkFilter({ ten_KH: 'Bất kỳ', ngay_tao: '2026-01-01T00:00:00.000Z' }, {}), true);
});

test('matchesCustomerBulkFilter: search khớp theo tên/SĐT/email (case-insensitive), không khớp cái nào -> false', () => {
  const customer = { ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0901234567', email: 'a@example.com', ngay_tao: '2026-01-01T00:00:00.000Z' };
  assert.equal(matchesCustomerBulkFilter(customer, { search: 'nguyễn' }), true);
  assert.equal(matchesCustomerBulkFilter(customer, { search: '901234' }), true);
  assert.equal(matchesCustomerBulkFilter(customer, { search: 'EXAMPLE.COM' }), true);
  assert.equal(matchesCustomerBulkFilter(customer, { search: 'không tồn tại' }), false);
});

test('matchesCustomerBulkFilter: so_dien_thoai/email null (dữ liệu Sheets cũ) -> không throw, chỉ không khớp qua field đó', () => {
  const customer = { ten_KH: 'Trần Thị B', so_dien_thoai: null, email: null, ngay_tao: '2026-01-01T00:00:00.000Z' };
  assert.doesNotThrow(() => matchesCustomerBulkFilter(customer, { search: 'trần' }));
  assert.equal(matchesCustomerBulkFilter(customer, { search: 'trần' }), true);
  assert.equal(matchesCustomerBulkFilter(customer, { search: '0909' }), false);
});

test('matchesCustomerBulkFilter: from/to lọc theo ngay_tao — biên "to" bao gồm hết ngày (23:59:59), khớp đúng semantics GET /api/khach-hang', () => {
  const customer = { ten_KH: 'X', ngay_tao: '2026-03-15T10:00:00.000Z' };
  assert.equal(matchesCustomerBulkFilter(customer, { from: '2026-03-15' }), true);
  assert.equal(matchesCustomerBulkFilter(customer, { from: '2026-03-16' }), false);
  assert.equal(matchesCustomerBulkFilter(customer, { to: '2026-03-15' }), true);
  assert.equal(matchesCustomerBulkFilter(customer, { to: '2026-03-14' }), false);
});

test('drift guard: matchesCustomerBulkFilter (khach-hang-bulk-filter.ts) cố ý MIRROR semantics search/from/to của GET /api/khach-hang (route.ts) — nếu route.ts đổi filter mà không soát lại đây, test này fail để nhắc cập nhật cả 2 phía', () => {
  const routeSrc = readFileSync(resolve('src/app/api/khach-hang/route.ts'), 'utf8');
  assert.match(routeSrc, /kh\.ten_KH\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(routeSrc, /kh\.so_dien_thoai\.includes\(q\)/);
  assert.match(routeSrc, /kh\.email\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(routeSrc, /new Date\(kh\.ngay_tao\) >= new Date\(from\)/);
  assert.match(routeSrc, /new Date\(kh\.ngay_tao\) <= new Date\(to \+ 'T23:59:59'\)/);
});

// --- B. resolveCustomerIdsByFilter (campaign.ts) — không thể chạy DB thật
// trong test suite này (giống toàn bộ campaign.ts, xem quy ước bulkAddAndDistribute
// chỉ test qua planBulkDistribution thuần) — audit qua source để khoá: chỉ
// select field cần thiết (không kéo nguyên KhachHang), reuse matchesCustomerBulkFilter
// (không viết lại filter), và KHÔNG có cap/slice nào giới hạn số lượng (bắt
// buộc "3k+ compatible" — không được âm thầm cắt bớt kết quả). ---

test('resolveCustomerIdsByFilter: chỉ select field cần cho filter (id_khach_hang/ten_KH/so_dien_thoai/email/ngay_tao) — KHÔNG load nguyên KhachHang, nhẹ với vài nghìn dòng', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function resolveCustomerIdsByFilter');
  assert.ok(fnStart >= 0);
  const fnBody = src.slice(fnStart, fnStart + 500);
  assert.match(fnBody, /select:\s*\{\s*id_khach_hang: true, ten_KH: true, so_dien_thoai: true, email: true, ngay_tao: true\s*\}/);
  assert.match(fnBody, /matchesCustomerBulkFilter\(/, 'phải reuse matchesCustomerBulkFilter, không viết lại logic filter trong hàm này');
});

test('resolveCustomerIdsByFilter: KHÔNG có cap/slice/limit nào trên kết quả — phải trả đủ toàn bộ id khớp filter dù có vài nghìn dòng (yêu cầu "3.366 customer" của task)', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function resolveCustomerIdsByFilter');
  const fnEnd = src.indexOf('\n}', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert.doesNotMatch(fnBody, /\.slice\(|take:|limit/i);
});

// --- C. POST /api/campaigns/[id]/distribute — customer_filter (Admin-only) ---

test('distribute route: nhánh customer_filter yêu cầu isCrmAdmin RIÊNG (chặt hơn canManageCampaign chung của route) — Leader (owner Campaign, canManageCampaign=true nhưng không phải Admin) KHÔNG được dùng "chọn tất cả theo filter"', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const filterBranchStart = src.indexOf('body?.customer_filter');
  assert.ok(filterBranchStart >= 0);
  const filterBranch = src.slice(filterBranchStart, filterBranchStart + 900);
  assert.match(filterBranch, /if\s*\(!isCrmAdmin\(user\)\)/, 'phải có gate isCrmAdmin RIÊNG cho nhánh customer_filter');
  assert.match(filterBranch, /status:\s*403/);
  assert.match(filterBranch, /resolveCustomerIdsByFilter\(/, 'phải resolve qua resolveCustomerIdsByFilter (DB), không tin id nào từ client cho đường này');
});

test('distribute route: customer_filter KHÔNG nhận customer_ids song song từ client — id luôn resolve lại từ DB theo search/from/to, kể cả nếu client cố gửi kèm id list', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const filterBranchStart = src.indexOf('if (body?.customer_filter');
  const elseIdx = src.indexOf('} else {', filterBranchStart);
  assert.ok(filterBranchStart >= 0 && elseIdx > filterBranchStart);
  const filterBranch = src.slice(filterBranchStart, elseIdx);
  assert.doesNotMatch(filterBranch, /body\?\.customer_ids|body!\.customer_ids/, 'nhánh customer_filter không được đọc customer_ids từ body — tránh 1 request vừa gửi filter vừa gửi id giả mạo');
});

test('distribute route: dù customer_ids (path cũ) hay customer_filter (path mới), CẢ 2 đều đổ về ĐÚNG 1 lệnh gọi bulkAddAndDistribute duy nhất — không có write path riêng cho "chọn tất cả" (giữ nguyên toàn bộ dedup/idempotent guarantee đã có)', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const calls = src.match(/bulkAddAndDistribute\(/g) || [];
  assert.equal(calls.length, 1, 'chỉ được có đúng 1 lệnh gọi bulkAddAndDistribute trong route — path filter và path id list phải hội tụ về cùng 1 chỗ ghi DB');
});

test('distribute route: auth chung (canManageCampaign) vẫn kiểm tra TRƯỚC khi đọc body/customer_filter — không có cách nào bỏ qua gate cũ bằng cách gửi customer_filter', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const authIdx = src.indexOf('canManageCampaign(user, campaign)');
  const filterIdx = src.indexOf('body?.customer_filter');
  assert.ok(authIdx >= 0 && filterIdx >= 0 && authIdx < filterIdx, 'canManageCampaign phải được check trước khi route đọc/xử lý customer_filter');
});

// --- D. UI: /khach-hang — "Chọn tất cả N khách hàng phù hợp bộ lọc" (Admin-only) ---

test('khach-hang/page.tsx: banner "Chọn tất cả" (cả 2 trạng thái: gợi ý bật + đã bật) chỉ hiện cho Admin — feature chọn-tất-cả-theo-filter là Admin-only theo spec', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /isAdmin && allVisibleSelected && !selectAllMatching && total > data\.length/);
  assert.match(src, /isAdmin && selectAllMatching/);
});

test('khach-hang/page.tsx: hiển thị đúng "Đã chọn X khách hàng" — X = selectedIds.size khi chọn theo trang, X = total khi đã bật chọn tất cả (KHÔNG bao giờ hiện total khi chưa bật chọn tất cả, tránh Admin tưởng nhầm)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /Đã chọn \{selectedIds\.size\} khách hàng trên trang này\./);
  assert.match(src, /Đã chọn <strong>\{total\}<\/strong> khách hàng \(tất cả phù hợp với bộ lọc hiện tại\)\./);
});

test('khach-hang/page.tsx: fetchData() reset selectAllMatching mỗi khi filter/trang đổi — tránh giữ "chọn tất cả" lố sang 1 filter/trang khác', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const fetchStart = src.indexOf('const fetchData = useCallback');
  // CUSTOMER USED-IN-CAMPAIGN VISIBILITY thêm campaignStatus vào dependency
  // array (filter mới, cũng phải reset selectAllMatching khi đổi tab) —
  // KHÔNG bớt page/search/fromDate/toDate đã có. CUSTOMER DATASET thêm tiếp
  // datasetFilter cùng tinh thần.
  const fetchEnd = src.indexOf('}, [page, search, fromDate, toDate, campaignStatus, datasetFilter]);');
  assert.ok(fetchStart >= 0 && fetchEnd > fetchStart);
  const fetchBody = src.slice(fetchStart, fetchEnd);
  assert.match(fetchBody, /setSelectAllMatching\(false\)/);
});

test('khach-hang/page.tsx: nút "Tạo Campaign" hiện đúng số đã chọn (total khi selectAllMatching, selectedIds.size khi không) — CampaignDistributeModal nhận customerFilter (kèm count) thay cho customerIds khi ở chế độ chọn tất cả, và server tự resolve lại count thật (không tin count client) khi submit', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /Tạo Campaign \(\{selectAllMatching \? total : selectedIds\.size\}\)/);
  const modalCallStart = src.indexOf('<CampaignDistributeModal');
  const modalCallEnd = src.indexOf('/>', modalCallStart);
  const modalCall = src.slice(modalCallStart, modalCallEnd);
  assert.match(modalCall, /customerIds=\{selectAllMatching \? undefined : \[\.\.\.selectedIds\]\}/);
  assert.match(modalCall, /customerFilter=\{selectAllMatching \? \{ search, from: fromDate, to: toDate, datasetId: datasetFilter \|\| undefined, count: total \} : undefined\}/);
});

// --- E. UI: CampaignDistributeModal — customerFilter wiring + kết quả "Đã tạo Campaign" ---

// REMEDIATION (Customer Range Selection) thêm nhánh thứ 3 customerRange —
// cập nhật assertion theo cấu trúc mới, không phải regression (xem
// campaign-customer-range.test.ts cho coverage đầy đủ nhánh mới).
test('CampaignDistributeModal.tsx: selectionCount lấy từ customerFilter.count khi có customerFilter, customerRange.count khi có customerRange, ngược lại từ customerIds.length', () => {
  const src = readFileSync(resolve(MODAL_PATH), 'utf8');
  assert.match(src, /const selectionCount = customerFilter \? customerFilter\.count : customerRange \? customerRange\.count : \(customerIds\?\.length \?\? 0\);/);
});

test('CampaignDistributeModal.tsx: submit() gửi customer_filter (KHÔNG kèm customer_ids) khi có customerFilter, customer_range khi có customerRange, ngược lại gửi customer_ids như cũ', () => {
  const src = readFileSync(resolve(MODAL_PATH), 'utf8');
  const bodyStart = src.indexOf('body: JSON.stringify({', src.indexOf('/distribute`'));
  const body = src.slice(bodyStart, bodyStart + 500);
  assert.match(body, /customerFilter\s*\?\s*\{ customer_filter:/);
  assert.match(body, /:\s*customerRange\s*\n\s*\? \{ customer_range:/);
  assert.match(body, /:\s*\{ customer_ids: customerIds \}\)/);
});

test('CampaignDistributeModal.tsx: chỉ set createdCampaign khi THỰC SỰ vừa tạo Campaign mới (nhánh creatingNew, không phải chọn Campaign có sẵn) — message "Đã tạo Campaign" không được hiện sai khi Admin chỉ thêm vào Campaign đã tồn tại', () => {
  const src = readFileSync(resolve(MODAL_PATH), 'utf8');
  const creatingNewBlockStart = src.indexOf('if (!fixedCampaign && creatingNew) {');
  const creatingNewBlockEnd = src.indexOf('\n      }', creatingNewBlockStart);
  const block = src.slice(creatingNewBlockStart, creatingNewBlockEnd);
  assert.match(block, /setCreatedCampaign\(\{ id: created\.data\.id, name: created\.data\.name \}\)/);
  // Ngoài khối if này, không còn chỗ nào khác GỌI setCreatedCampaign(...) —
  // chỉ đúng 1 lệnh gọi thật (dòng useState khai báo setter, không phải call).
  const allCalls = src.match(/setCreatedCampaign\(\{/g) || [];
  assert.equal(allCalls.length, 1, 'setCreatedCampaign(...) chỉ được gọi đúng 1 chỗ, trong nhánh tạo mới');
});

test('CampaignDistributeModal.tsx: kết quả hiện đúng câu "Đã tạo Campaign X với Y khách hàng" khi createdCampaign có giá trị, kèm nút "Đi tới CSKH → Theo Campaign" trỏ /phan-khach?mode=campaign&campaignId=', () => {
  const src = readFileSync(resolve(MODAL_PATH), 'utf8');
  assert.match(src, /Đã tạo Campaign "\$\{createdCampaign\.name\}" với \$\{result\.created\} khách hàng\./);
  assert.match(src, /\/phan-khach\?mode=campaign&campaignId=\$\{createdCampaign\?\.id \|\| campaignId\}/);
});

// --- F. UI: /phan-khach — deep link ?mode=campaign&campaignId= ---

// CAMPAIGN-FIRST CSKH remediation đổi default mode từ 'project' sang
// 'campaign' cho MỌI role (trước đây chỉ non-admin) — tab "Theo Dự án" ẩn
// khỏi UI, chỉ còn truy cập được qua `?mode=project` (không xoá code/nhánh
// 'project', xem tests/crm/campaign-first-cskh.test.ts). `?mode=campaign`
// vẫn resolve đúng 'campaign' (đã là default) nên deep link cũ không đổi
// hành vi quan sát được.
test('phan-khach/page.tsx: dùng useSearchParams() trong Suspense boundary (bắt buộc theo Next.js App Router) — mode default = campaign (chỉ ?mode=project mới vào lại "Theo Dự án"), ?campaignId= để truyền initialCampaignId', () => {
  const src = readFileSync(resolve(PHAN_KHACH_PATH), 'utf8');
  assert.match(src, /import \{ useSearchParams \} from 'next\/navigation';/);
  assert.match(src, /<Suspense fallback=\{[^}]*\}>\s*<PhanKhachContent \/>\s*<\/Suspense>/);
  assert.match(src, /searchParams\.get\('mode'\) === 'project' \? 'project' : 'campaign'/);
  assert.match(src, /const initialCampaignId = searchParams\.get\('campaignId'\) \|\| undefined;/);
  assert.match(src, /<CampaignCskhWorkQueue employees=\{employees\} projects=\{projects\} initialCampaignId=\{initialCampaignId\} \/>/);
});

test('CampaignCskhWorkQueue.tsx: campaignId state khởi tạo từ prop initialCampaignId khi có — Campaign vừa tạo phải tự chọn sẵn, Admin không phải tự tìm trong dropdown', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /initialCampaignId\?: string/);
  assert.match(src, /const \[campaignId, setCampaignId\] = useState\(initialCampaignId \|\| ''\);/);
});

// --- G. Scale ("3k+ compatible") — pure algorithm, không cần DB thật ---

test('planDistribution/planBulkDistribution xử lý được 3.400 customerId (mô phỏng scale thật của task) không lỗi, không chậm bất thường, kết quả đúng tổng số', () => {
  const customerIds = Array.from({ length: 3400 }, (_, i) => `KH_${i}`);
  const telesales = [{ id_nhan_vien: 'S1', ho_ten: 'Sale A' }, { id_nhan_vien: 'S2', ho_ten: 'Sale B' }];
  const start = Date.now();
  const plan = planBulkDistribution({
    orderedIds: customerIds,
    existingCustomerIds: new Set(customerIds),
    existingMemberships: [],
    telesales,
    mode: 'round_robin',
    quantities: undefined,
  });
  const elapsedMs = Date.now() - start;
  assert.equal(plan.toCreate.length, 3400);
  assert.equal(plan.notFound.length, 0);
  assert.ok(elapsedMs < 2000, `planBulkDistribution với 3.400 id phải nhanh (pure, in-memory) — mất ${elapsedMs}ms`);
  // round-robin: đúng round-robin xen kẽ Sale A/Sale B, không lệch giữa chừng.
  assert.equal(plan.toCreate[0].telesale_name, 'Sale A');
  assert.equal(plan.toCreate[1].telesale_name, 'Sale B');
  assert.equal(plan.toCreate[3399].telesale_name, telesales[3399 % 2].ho_ten);
});

test('campaign.ts: bulkAddAndDistribute dùng createMany (bulk insert 1 lệnh) chứ không loop tạo từng CampaignMembership 1 dòng — bắt buộc để chịu được scale 3k+ dòng trong 1 request', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function bulkAddAndDistribute');
  const fnBody = src.slice(fnStart, fnStart + 2500);
  assert.match(fnBody, /tx\.campaignMembership\.createMany\(/);
  assert.doesNotMatch(fnBody, /for\s*\([^)]*\)\s*\{\s*await tx\.campaignMembership\.create\(/, 'không được có vòng lặp create() từng dòng cho phần tạo mới — phải dùng createMany');
});
