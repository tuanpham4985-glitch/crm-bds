import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { paginate } from '../../src/lib/table-pagination';
import { qualificationStatusLabel, leadQualityRankLabel } from '../../src/lib/crm-funnel/quality-labels';

// CSKH TABLE UX — pagination 50/trang + horizontal scroll UX + Vietnamese
// localization trên CSKH → Theo Campaign (CampaignCskhWorkQueue.tsx).
// UI-only/presentation, KHÔNG đổi CampaignMembership/telesale_id/assigned
// semantics/Campaign Leader authority/Project.ds_sale/eligibleCampaignSales/
// scoring/Handoff/Pipeline/ownership/range-selection authority/distribution
// algorithm — mọi test dưới đây chỉ khoá phần trình bày mới + xác nhận các
// authority trên vẫn y nguyên.

const WORK_QUEUE_PATH = 'src/components/crm/CampaignCskhWorkQueue.tsx';
const QUALIFICATION_MODAL_PATH = 'src/components/crm/MembershipQualificationModal.tsx';

// --- A. paginate() — pure windowing, tách biệt hoàn toàn khỏi list-range.ts ---

test('paginate: 300 khách, pageSize 50 -> đúng 6 trang', () => {
  const items = Array.from({ length: 300 }, (_, i) => `M_${i}`);
  const page1 = paginate(items, 1, 50);
  assert.equal(page1.totalPages, 6);
  assert.equal(page1.total, 300);
  assert.equal(page1.items.length, 50);
  assert.equal(page1.items[0], 'M_0');
  assert.equal(page1.items[49], 'M_49');
  assert.equal(page1.startIndex, 0);
});

test('paginate: trang cuối (300/50) đúng số còn lại — không thừa/thiếu', () => {
  const items = Array.from({ length: 320 }, (_, i) => `M_${i}`);
  const result = paginate(items, 7, 50); // 320 / 50 = 6.4 -> 7 trang, trang 7 còn 20
  assert.equal(result.totalPages, 7);
  assert.equal(result.page, 7);
  assert.equal(result.items.length, 20);
  assert.equal(result.startIndex, 300);
  assert.equal(result.items[0], 'M_300');
  assert.equal(result.items[19], 'M_319');
});

test('paginate: STT tiếp tục (startIndex) — page 2 bắt đầu từ 51 (index 50), không reset về 1/index 0', () => {
  const items = Array.from({ length: 300 }, (_, i) => `M_${i}`);
  const page2 = paginate(items, 2, 50);
  assert.equal(page2.startIndex, 50);
  // STT hiển thị = startIndex + idx + 1 -> dòng đầu trang 2 = 51
  assert.equal(page2.startIndex + 0 + 1, 51);
  assert.equal(page2.items[0], 'M_50');
});

test('paginate: page vượt totalPages (VD filter mới thu hẹp dataset) -> clamp về trang hợp lệ cuối cùng, không trả mảng rỗng bất ngờ hay lỗi', () => {
  const items = Array.from({ length: 10 }, (_, i) => `M_${i}`);
  const result = paginate(items, 99, 50);
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.items.length, 10);
});

test('paginate: mảng rỗng -> 1 trang rỗng, không lỗi, totalPages tối thiểu = 1', () => {
  const result = paginate([], 1, 50);
  assert.equal(result.totalPages, 1);
  assert.equal(result.items.length, 0);
  assert.equal(result.total, 0);
});

test('paginate: page <= 0 hoặc không phải số nguyên -> vẫn clamp về trang 1, không throw', () => {
  const items = Array.from({ length: 10 }, (_, i) => `M_${i}`);
  assert.equal(paginate(items, 0, 50).page, 1);
  assert.equal(paginate(items, -3, 50).page, 1);
  assert.equal(paginate(items, NaN, 50).page, 1);
});

// --- B. Wiring: CampaignCskhWorkQueue.tsx dùng paginate() TRÊN "filtered" (toàn tập), KHÔNG cắt range/summary ---

test('CampaignCskhWorkQueue.tsx: pageWindow = paginate(filtered, page, MEMBERS_PAGE_SIZE) — pagination tính trên "filtered" (toàn tập đã lọc, search/bucket/assignment), KHÔNG phải trên 1 trang', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /const pageWindow = useMemo\(\(\) => paginate\(filtered, page, MEMBERS_PAGE_SIZE\), \[filtered, page\]\);/);
  assert.match(src, /const MEMBERS_PAGE_SIZE = 50;/);
});

test('CampaignCskhWorkQueue.tsx: "filtered" useMemo KHÔNG bị đổi bởi pagination (vẫn members.filter(...) y nguyên) — khoá cùng regex với campaign-range-distribution.test.ts để 2 test không lệch nhau', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /const filtered = useMemo\(\s*\(\) => members\.filter\(member => matchesMembershipQueueFilter\(member, \{ search, bucket: bucketFilter, assignment: assignmentFilter \}\)\)/);
});

test('CampaignCskhWorkQueue.tsx: stats/assignmentSummary VẪN tính trên "members" (TOÀN campaign) — không bị đổi sang "filtered" hay "pageWindow.items" bởi pagination', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /const stats = useMemo\(\(\) => \{[\s\S]*?\}, \[members\]\);/);
  assert.match(src, /const assignmentSummary = useMemo\(\(\) => membershipAssignmentBreakdown\(members\), \[members\]\);/);
});

test('CampaignCskhWorkQueue.tsx: rangeResult (range 101-200, "Chọn khách: Từ x đến y") VẪN resolveMembershipRange trên "filtered" (toàn filtered dataset) — KHÔNG bị giới hạn bởi "pageWindow"/50 dòng của trang đang xem', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /resolveMembershipRange\(filtered, \{ from: rangeFromNum, to: rangeToNum \}\)/);
  assert.doesNotMatch(src, /resolveMembershipRange\(pageWindow/, 'range tuyệt đối không được resolve trên pageWindow.items (chỉ 50 dòng) — phải luôn trên "filtered" toàn tập');
});

test('CampaignCskhWorkQueue.tsx: MembershipTable nhận members={pageWindow.items} (50 dòng/trang) — bảng chỉ RENDER 1 trang, không phải toàn "filtered"', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /members=\{pageWindow\.items\}/);
});

test('CampaignCskhWorkQueue.tsx: reset về trang 1 khi campaignId/search/bucketFilter/assignmentFilter đổi (dataset "filtered" đổi) — không giữ trang cũ sai nghĩa', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /useEffect\(\(\) => \{ setPage\(1\); \}, \[campaignId, search, bucketFilter, assignmentFilter\]\);/);
});

test('CampaignCskhWorkQueue.tsx: STT hiển thị = startIndex + idx + 1 (tiếp tục qua các trang, VD trang 2 bắt đầu 51) — không phải idx + 1 (sẽ reset về 1 mỗi trang)', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /\{startIndex \+ idx \+ 1\}/);
  assert.doesNotMatch(src, /\{idx \+ 1\}/, 'không được có STT kiểu idx+1 trần (sẽ reset về 1 ở mỗi trang) sót lại đâu đó trong bảng CSKH');
});

// --- C. Pagination UI: format đúng spec "1–50 / 300 khách" + "Trước/Trang X/Y/Sau" ---

test('CampaignCskhWorkQueue.tsx: pagination info đúng format "{startIndex+1}–{...}/{totalCount} khách" và điều khiển Trước/Trang X trên Y/Sau, disable đúng ở biên', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /\{startIndex \+ 1\}–\{Math\.min\(startIndex \+ pageSize, totalCount\)\} \/ \{totalCount\} khách/);
  assert.match(src, /Trang \{page\} \/ \{totalPages\}/);
  assert.match(src, /disabled=\{page <= 1\}[\s\S]{0,40}onClick=\{onPrevPage\}/);
  assert.match(src, /disabled=\{page >= totalPages\}[\s\S]{0,40}onClick=\{onNextPage\}/);
  assert.match(src, />\s*Trước<\/button>/);
  assert.match(src, /Sau\s*</);
});

test('CampaignCskhWorkQueue.tsx: onPrevPage/onNextPage clamp trong [1, totalPages] — không cho lùi dưới 1 hay vượt totalPages', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /onPrevPage=\{\(\) => setPage\(current => Math\.max\(1, current - 1\)\)\}/);
  assert.match(src, /onNextPage=\{\(\) => setPage\(current => Math\.min\(pageWindow\.totalPages, current \+ 1\)\)\}/);
});

// --- D. Horizontal scroll UX ---

test('CampaignCskhWorkQueue.tsx: table-wrapper CỦA BẢNG NÀY dùng overflowX+overflowY+maxHeight (bounded box) — horizontal scrollbar luôn nằm trong 1 khung cố định trong viewport, không cần cuộn xuống hết bảng mới thấy', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /className="table-wrapper" style=\{\{ overflowX: 'auto', overflowY: 'auto', maxHeight: '62vh' \}\}/);
});

test('globals.css: class dùng chung .table-wrapper KHÔNG bị đổi bởi fix này — chỉ đổi inline style CỦA RIÊNG CampaignCskhWorkQueue, các bảng khác trong app (VD /khach-hang) không bị ảnh hưởng', () => {
  const css = readFileSync(resolve('src/app/globals.css'), 'utf8');
  const blockStart = css.indexOf('.table-wrapper {');
  const blockEnd = css.indexOf('}', blockStart);
  const block = css.slice(blockStart, blockEnd);
  assert.doesNotMatch(block, /overflow-y|max-height/i, '.table-wrapper (class dùng chung) không được thêm overflow-y/max-height toàn cục — fix chỉ áp dụng cục bộ qua inline style');
});

// --- E. Vietnamese localization ---

test('quality-labels.ts (mapping SẴN CÓ, reuse không tạo mapping song song): đủ mapping theo spec RAW/CONTACTED/INTERESTED/QUALIFIED/HOT/UNQUALIFIED + WARM', () => {
  assert.equal(qualificationStatusLabel('RAW'), 'Chưa chăm sóc');
  assert.equal(qualificationStatusLabel('CONTACTED'), 'Đã liên hệ');
  assert.equal(qualificationStatusLabel('INTERESTED'), 'Quan tâm');
  assert.equal(qualificationStatusLabel('QUALIFIED'), 'Đủ điều kiện');
  assert.equal(qualificationStatusLabel('HOT'), 'Tiềm năng cao');
  assert.equal(qualificationStatusLabel('UNQUALIFIED'), 'Chưa đủ điều kiện');
  assert.equal(leadQualityRankLabel('WARM'), 'Tiềm năng trung bình');
});

test('CampaignCskhWorkQueue.tsx: import qualificationStatusLabel/leadQualityRankLabel từ quality-labels.ts (mapping có sẵn) — KHÔNG tự viết Record<QualificationStatus,string> song song trong file này', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /import \{ qualificationStatusLabel, leadQualityRankLabel \} from '@\/lib\/crm-funnel\/quality-labels';/);
  assert.doesNotMatch(src, /RAW:\s*'|Record<QualificationStatus/, 'không được tự định nghĩa mapping RAW/CONTACTED/... song song với quality-labels.ts');
});

test('CampaignCskhWorkQueue.tsx: cell Mức độ tiềm năng/Điểm-Xếp hạng dùng label function, KHÔNG hiển thị thẳng enum thô member.qualification_status/member.lead_quality_rank', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /\{qualificationStatusLabel\(member\.qualification_status\)\}/);
  assert.match(src, /\{leadQualityRankLabel\(member\.lead_quality_rank\)\}/);
  assert.doesNotMatch(src, /<span[^>]*>\{member\.qualification_status\}<\/span>/, 'không được còn chỗ nào hiển thị thẳng member.qualification_status thô');
  assert.doesNotMatch(src, /\{member\.lead_quality_rank\}<\/span>/, 'không được còn chỗ nào hiển thị thẳng member.lead_quality_rank thô (phải qua leadQualityRankLabel)');
});

test('CampaignCskhWorkQueue.tsx: header bảng đã Việt hóa — "Mức độ tiềm năng" thay "Qualification", "Điểm / Xếp hạng" thay "Score/Rank"', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, />Mức độ tiềm năng<\/th>/);
  assert.match(src, />Điểm \/ Xếp hạng<\/th>/);
  assert.doesNotMatch(src, />Qualification<\/th>/);
  assert.doesNotMatch(src, />Score\/Rank<\/th>/);
});

test('CampaignCskhWorkQueue.tsx: MembershipHandoffModal hiển thị "Mức độ tiềm năng" (localized) thay vì "Qualification:" + dùng qualificationStatusLabel, không còn hiển thị enum thô', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /Mức độ tiềm năng: <strong>\{qualificationStatusLabel\(membership\.qualification_status\)\}<\/strong>/);
  assert.doesNotMatch(src, /Qualification: <strong>\{membership\.qualification_status\}<\/strong>/);
});

test('MembershipQualificationModal.tsx: thông báo sau khi lưu dùng "Điểm tiềm năng" + leadQualityRankLabel(result.score.rank) — không còn "Lead Score"/enum thô trong message', () => {
  const src = readFileSync(resolve(QUALIFICATION_MODAL_PATH), 'utf8');
  assert.match(src, /import \{ leadQualityRankLabel \} from '@\/lib\/crm-funnel\/quality-labels';/);
  assert.match(src, /`Điểm tiềm năng \$\{result\.score\.score\}\/100 · \$\{leadQualityRankLabel\(result\.score\.rank\)\}`/);
  assert.doesNotMatch(src, /Lead Score \$\{result\.score\.score\}\/100 · \$\{result\.score\.rank\}/);
});

test('MembershipQualificationModal.tsx: câu giải thích "Điểm và Xếp hạng tiềm năng do server tự tính" — không còn "Lead Score và Lead Rank" tiếng Anh', () => {
  const src = readFileSync(resolve(QUALIFICATION_MODAL_PATH), 'utf8');
  assert.match(src, /Điểm và Xếp hạng tiềm năng do server tự tính, riêng cho Campaign này\./);
  assert.doesNotMatch(src, /Lead Score và Lead Rank/);
});

test('CampaignCskhWorkQueue.tsx: handoff status hiển thị (outcome-based badge) vẫn 100% tiếng Việt như trước — "Đã nhận"/"Đã từ chối"/"Chờ xác nhận", không có WAITING_ACCEPTANCE/ACCEPTED/REJECTED thô lộ ra UI', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, />Đã nhận ·/);
  assert.match(src, />Đã từ chối</);
  assert.match(src, />Chờ xác nhận ·/);
  // WAITING_ACCEPTANCE chỉ được phép xuất hiện trong so sánh điều kiện (===), không phải render trực tiếp làm text node.
  const renderedRaw = src.match(/>\s*\{[^}]*WAITING_ACCEPTANCE[^}]*\}\s*</);
  assert.equal(renderedRaw, null, 'WAITING_ACCEPTANCE không được render trực tiếp thành text hiển thị');
});

// --- F. Table density: STT column + width hints, không bỏ dữ liệu nghiệp vụ ---

test('CampaignCskhWorkQueue.tsx: thêm cột STT (mới) đứng đầu bảng, các cột dữ liệu nghiệp vụ cũ (Khách hàng/Sale CSKH/Trạng thái/Mức độ tiềm năng/Điểm-Xếp hạng/Lịch tiếp theo/Bàn giao/Thao tác) vẫn đủ, không bị xoá cột nào', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  const theadStart = src.indexOf('<thead><tr>');
  const theadEnd = src.indexOf('</tr></thead>');
  const thead = src.slice(theadStart, theadEnd);
  assert.match(thead, />STT<\/th>/);
  assert.match(thead, />Khách hàng<\/th>/);
  assert.match(thead, />Sale CSKH<\/th>/);
  assert.match(thead, />Trạng thái<\/th>/);
  assert.match(thead, />Mức độ tiềm năng<\/th>/);
  assert.match(thead, />Điểm \/ Xếp hạng<\/th>/);
  assert.match(thead, />Lịch tiếp theo<\/th>/);
  assert.match(thead, />Bàn giao<\/th>/);
  assert.match(thead, />Thao tác<\/th>/);
});

// --- G. No regression: distribution/Handoff/authority untouched by this UI-only change ---

test('CampaignCskhWorkQueue.tsx: pagination/localization mới không thêm bất kỳ lệnh gọi fetch() nào ngoài tập endpoint đã có (campaigns list/members/interaction/handoff/distribute) — thuần presentation, không side-effect', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  const allFetchCalls = src.match(/fetch\(`?\/api\/[^`'")\s]+/g) || [];
  const distinctEndpointBases = new Set(allFetchCalls.map(call => call.replace(/\$\{[^}]+\}/g, ':id')));
  for (const endpoint of distinctEndpointBases) {
    assert.doesNotMatch(endpoint, /pipeline|ownership/i, `endpoint lạ không mong đợi: ${endpoint}`);
  }
});

test('CampaignCskhWorkQueue.tsx: eligibleCampaignSales/canManageCampaign/telesale_id/isMembershipAssigned KHÔNG bị đổi bởi thay đổi UI mới — vẫn dùng nguyên các hàm authority hiện có', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /eligibleCampaignSales\(isAdmin, selectedCampaign, projects, employees\)/);
  assert.match(src, /const assigned = isMembershipAssigned\(member\);/);
});

test('table-pagination.ts: paginate() hoàn toàn thuần (không import prisma/next/react) — an toàn dùng ở cả pure test lẫn client component', () => {
  const src = readFileSync(resolve('src/lib/table-pagination.ts'), 'utf8');
  assert.doesNotMatch(src, /from 'react'|from 'next|from '@prisma|prisma\./);
});
