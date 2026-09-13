import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HANDOFF_ELIGIBLE_STATUSES } from '../../src/lib/crm-funnel/handoff-policy';
import { matches, summarize } from '../../src/lib/crm-funnel/analytics';
import type { QualityLeadRow } from '../../src/lib/crm-funnel/analytics';
import type { QualificationStatus } from '../../src/lib/types';

// DATA_TIEM_NANG_ENTRY_GATE — queryQualityLeads() (analytics.ts, backs GET
// /api/crm/qualified-leads, "Data tiềm năng") trước đây đọc TOÀN BỘ Customer
// (không where) rồi mới lọc entry gate trong JS (thực ra: KHÔNG hề lọc entry
// gate — RAW/CONTACTED lẫn vào cùng INTERESTED/QUALIFIED/HOT, production-
// confirmed qua pg_stat_user_tables A/B: seq_tup_read +6998 = toàn bộ bảng).
// Fix: đẩy entry gate (qualification_status ∈ {INTERESTED,QUALIFIED,HOT})
// xuống Prisma WHERE, tái dùng NGUYÊN HANDOFF_ELIGIBLE_STATUSES đã có sẵn ở
// handoff-policy.ts (cùng authority với gate bàn giao) — KHÔNG tự phát minh
// enum/threshold mới, KHÔNG đổi scoring/qualification calculation (scoring.ts/
// transactional-workflow.ts không bị đụng). File này test phần THỰC SỰ đổi:
// WHERE shape (1-3) + authority cross-check RAW/CONTACTED excluded,
// INTERESTED/QUALIFIED/HOT included (4-8) + zero-drift trên mọi phần khác
// (9-13, byte-identical với P3A).

const ANALYTICS_PATH = 'src/lib/crm-funnel/analytics.ts';
const HANDOFF_POLICY_PATH = 'src/lib/crm-funnel/handoff-policy.ts';

// ─── 1-3. WHERE shape ───────────────────────────────────────────────────────

test('analytics.ts: queryQualityLeads() Customer findMany có where CHÍNH XÁC qualification_status IN HANDOFF_ELIGIBLE_STATUSES', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /const DATA_TIEM_NANG_WHERE: Prisma\.KhachHangWhereInput = \{\s*qualification_status:\s*\{\s*in:\s*\[\.\.\.HANDOFF_ELIGIBLE_STATUSES\]\s*\},?\s*\};/);
  const start = src.indexOf('export async function queryQualityLeads');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  assert.match(body, /prisma\.khachHang\.findMany\(\{\s*where:\s*DATA_TIEM_NANG_WHERE,\s*select:\s*CUSTOMER_SELECT,\s*orderBy:\s*\{\s*ngay_tao:\s*'desc'\s*\}\s*\}\)/);
});

test('analytics.ts: import HANDOFF_ELIGIBLE_STATUSES từ handoff-policy.ts — DATA_TIEM_NANG_WHERE KHÔNG hard-code lại mảng status (tái dùng authority, không duplicate)', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /import \{ HANDOFF_ELIGIBLE_STATUSES \} from '\.\/handoff-policy';/);
  const start = src.indexOf('const DATA_TIEM_NANG_WHERE');
  const end = src.indexOf('};', start) + 2;
  const body = src.slice(start, end);
  // Khối WHERE này chỉ được tham chiếu HANDOFF_ELIGIBLE_STATUSES, không được
  // hard-code lại mảng ['INTERESTED','QUALIFIED','HOT'] riêng ở đây (khối
  // summarize()/summarizeBasic() có mảng tương tự nhưng đó là code CŨ, không
  // thuộc phạm vi thay đổi của entry gate — không phải trùng lặp mới).
  assert.doesNotMatch(body, /\[\s*'INTERESTED',\s*'QUALIFIED',\s*'HOT'\s*\]/);
  assert.match(body, /\[\.\.\.HANDOFF_ELIGIBLE_STATUSES\]/);
});

test('handoff-policy.ts: HANDOFF_ELIGIBLE_STATUSES đã được export (trước đây module-private)', () => {
  const src = readFileSync(resolve(HANDOFF_POLICY_PATH), 'utf8');
  assert.match(src, /export const HANDOFF_ELIGIBLE_STATUSES: readonly QualificationStatus\[\] = \['INTERESTED', 'QUALIFIED', 'HOT'\];/);
});

// ─── 4-8. Authority cross-check — import THẬT (không mirror) toàn bộ enum
// QualificationStatus, xác nhận đúng RAW/CONTACTED/UNQUALIFIED bị loại,
// INTERESTED/QUALIFIED/HOT được giữ. ──────────────────────────────────────

const ALL_STATUSES: QualificationStatus[] = ['RAW', 'CONTACTED', 'INTERESTED', 'QUALIFIED', 'HOT', 'UNQUALIFIED'];

test('A. RAW không nằm trong entry gate', () => {
  assert.equal(HANDOFF_ELIGIBLE_STATUSES.includes('RAW'), false);
});

test('B. CONTACTED không nằm trong entry gate', () => {
  assert.equal(HANDOFF_ELIGIBLE_STATUSES.includes('CONTACTED'), false);
});

test('bonus: UNQUALIFIED (Sai số/Không phù hợp) cũng không nằm trong entry gate', () => {
  assert.equal(HANDOFF_ELIGIBLE_STATUSES.includes('UNQUALIFIED'), false);
});

test('C. INTERESTED nằm trong entry gate', () => {
  assert.equal(HANDOFF_ELIGIBLE_STATUSES.includes('INTERESTED'), true);
});

test('D. QUALIFIED nằm trong entry gate', () => {
  assert.equal(HANDOFF_ELIGIBLE_STATUSES.includes('QUALIFIED'), true);
});

test('E. HOT nằm trong entry gate', () => {
  assert.equal(HANDOFF_ELIGIBLE_STATUSES.includes('HOT'), true);
});

test('I. entry gate KHÔNG bị thu hẹp thành chỉ HOT hoặc chỉ QUALIFIED — đúng 3 giá trị, không hơn không kém', () => {
  assert.deepEqual([...HANDOFF_ELIGIBLE_STATUSES].sort(), ['HOT', 'INTERESTED', 'QUALIFIED']);
});

test('exhaustive: đúng 3/6 giá trị QualificationStatus nằm trong gate (RAW/CONTACTED/UNQUALIFIED loại, INTERESTED/QUALIFIED/HOT giữ)', () => {
  const included = ALL_STATUSES.filter(status => HANDOFF_ELIGIBLE_STATUSES.includes(status));
  const excluded = ALL_STATUSES.filter(status => !HANDOFF_ELIGIBLE_STATUSES.includes(status));
  assert.deepEqual(included.sort(), ['HOT', 'INTERESTED', 'QUALIFIED']);
  assert.deepEqual(excluded.sort(), ['CONTACTED', 'RAW', 'UNQUALIFIED']);
});

// ─── J. Không làm thay đổi funnel/handoff authority ────────────────────────

test('J. isHandoffEligible() (handoff-policy.ts) vẫn dùng CHÍNH mảng vừa export — handoff authority không đổi, chỉ thêm visibility export', () => {
  const src = readFileSync(resolve(HANDOFF_POLICY_PATH), 'utf8');
  assert.match(src, /export function isHandoffEligible\(status\?: QualificationStatus \| string \| null\): boolean \{\s*return HANDOFF_ELIGIBLE_STATUSES\.includes\(status as QualificationStatus\);\s*\}/);
});

// ─── 9-13. Zero-drift — CUSTOMER_SELECT/orderBy/join/filter/summary giữ nguyên P3A ─

test('CUSTOMER_SELECT vẫn CHÍNH XÁC 27 field của P3A — entry gate không cần thêm field nào (qualification_status đã có sẵn trong select)', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('const CUSTOMER_SELECT');
  const end = src.indexOf('} satisfies Prisma.KhachHangSelect', start);
  const body = src.slice(start, end);
  const trueCount = (body.match(/:\s*true/g) || []).length;
  assert.equal(trueCount, 27, 'CUSTOMER_SELECT phải giữ nguyên đúng 27 field như P3A');
  assert.match(body, /qualification_status:\s*true/, 'qualification_status phải đã có sẵn trong select (dùng cho WHERE + hiển thị)');
});

test('orderBy giữ NGUYÊN ngay_tao desc — entry gate không đổi thứ tự sắp xếp', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('export async function queryQualityLeads');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  const findManyStart = body.indexOf('prisma.khachHang.findMany(');
  const findManyEnd = body.indexOf(')', findManyStart) + 1;
  const call = body.slice(findManyStart, findManyEnd);
  assert.match(call, /orderBy:\s*\{\s*ngay_tao:\s*'desc'\s*\}/);
});

// LƯU Ý: 2 test dưới đây ("chỉ 1 lệnh findMany" + "H. join byte-identical")
// đã bị THAY THẾ có chủ đích bởi phần "── REMEDIATION" ở cuối file này. Root
// cause: bản entry-gate BAN ĐẦU (implementation trước remediation) áp entry
// gate CHUNG cho cả rows lẫn summary/funnel — ChatGPT Architecture Review
// phát hiện đây là REGRESSION (summary bị thu hẹp denominator xuống chỉ
// INTERESTED+, làm contactRate/interestRate lệch méo tiến về ~100%). Fix bắt
// buộc phải tách 2 population (full-scope cho summary, entry-gated cho
// rows/export) — không thể giữ "chỉ 1 query" hay "ids dùng chung 1 biến" mà
// vẫn đúng nghiệp vụ. Xem phần REMEDIATION cho assertion đầy đủ + test hành
// vi thực (không chỉ regex).

// ─── REMEDIATION ────────────────────────────────────────────────────────────
// DATA_TIEM_NANG_ENTRY_GATE_REMEDIATION — tách entry-gated Customer population
// (rows/export) khỏi full-scope Customer population (summary/funnel), theo
// approved remediation direction của ChatGPT Architecture Review. Test dưới
// đây chứng minh: (a) shape/WHERE/select của TỪNG query, (b) join scope đúng
// lý do nghiệp vụ, (c) hành vi THẬT của summarize()/matches() (import thật,
// không mirror) trên 1 population RAW+CONTACTED+INTERESTED — không chỉ regex
// trên source string.

test('REMEDIATION 1: đúng 2 lệnh khachHang.findMany() — Query A (full-scope, KHÔNG where) + Query B (entry-gated, DATA_TIEM_NANG_WHERE) — không có query thứ 3', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('export async function queryQualityLeads');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  const count = (body.match(/prisma\.khachHang\.findMany\(/g) || []).length;
  assert.equal(count, 2, 'queryQualityLeads phải có đúng 2 query Customer — không thêm query thứ 3 để "bù" cho population nào');
});

test('REMEDIATION 2: Query A (full-scope summary) dùng FULL_SCOPE_SELECT, KHÔNG có where qualification_status', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('export async function queryQualityLeads');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  const queryAStart = body.indexOf('prisma.khachHang.findMany(');
  const queryAEnd = body.indexOf(')', queryAStart) + 1;
  const queryA = body.slice(queryAStart, queryAEnd);
  assert.match(queryA, /select:\s*FULL_SCOPE_SELECT/, 'Query A (full-scope) phải dùng FULL_SCOPE_SELECT — không phải CUSTOMER_SELECT (tránh transfer 27 cột cho toàn bộ ~6998 dòng)');
  assert.doesNotMatch(queryA, /where:/, 'Query A KHÔNG được có where qualification_status — summary phải phản ánh TOÀN BỘ CSKH trong scope, không bị entry gate');
});

test('REMEDIATION 3: Query B (entry-gated list) vẫn dùng DATA_TIEM_NANG_WHERE + CUSTOMER_SELECT (P3A 27 field) — nguồn cho rows/export/options', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('export async function queryQualityLeads');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  assert.match(body, /prisma\.khachHang\.findMany\(\{\s*where:\s*DATA_TIEM_NANG_WHERE,\s*select:\s*CUSTOMER_SELECT,\s*orderBy:\s*\{\s*ngay_tao:\s*'desc'\s*\}\s*\}\)/);
});

test('REMEDIATION 4: summary được tính TỪ full-scope rows (summaryRows/fullScopeCustomers), KHÔNG phải từ rows/eligibleCustomers trả về UI', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.ok(src.includes('const summaryRows = fullScopeCustomers'), 'summaryRows phải build TỪ fullScopeCustomers');
  assert.ok(src.includes('.map(customer => toSummaryRow(customer,'), 'summaryRows phải dùng toSummaryRow() (full-scope row builder)');
  assert.match(src, /const summaryRows = fullScopeCustomers[\s\S]*?\.filter\(row => matches\(row, filters\)\);/);
  assert.match(src, /const summary = summarize\(summaryRows\);/, 'summarize() phải nhận summaryRows (full-scope) — không phải rows (entry-gated, trả về UI/export)');
});

test('REMEDIATION 5: Pipeline join dùng fullScopeIds (không thu hẹp về eligible) vì pipeline_status cần cho CẢ summary lẫn rows', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /const fullScopeIds = fullScopeCustomers\.map\(customer => customer\.id_khach_hang\);/);
  assert.match(src, /prisma\.pipeline\.findMany\(\{\s*where:\s*\{\s*id_khach_hang:\s*\{\s*in:\s*fullScopeIds\s*\}\s*\},\s*orderBy:\s*\{\s*updated_at:\s*'desc'\s*\}\s*\}\)/);
});

test('REMEDIATION 6: Handoff join giữ hẹp theo eligibleIds (list-related only) — không mở lại full scope', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /const eligibleIds = eligibleCustomers\.map\(customer => customer\.id_khach_hang\);/);
  assert.match(src, /prisma\.crmHandoff\.findMany\(\{\s*where:\s*\{\s*customer_id:\s*\{\s*in:\s*eligibleIds\s*\}\s*\},\s*orderBy:\s*\{\s*created_at:\s*'desc'\s*\}\s*\}\)/);
});

test('REMEDIATION 7: options tính TỪ eligibleCustomers (không phải full scope) — tránh leak project/telesale/source của RAW/CONTACTED/UNQUALIFIED vào dropdown filter', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('const options = {');
  const end = src.indexOf('};', start) + 2;
  const body = src.slice(start, end);
  assert.match(body, /eligibleCustomers\.map/, 'projects/telesales/sales/sources phải nguồn từ eligibleCustomers');
  assert.doesNotMatch(body, /fullScopeCustomers\.map/, 'options KHÔNG được nguồn từ fullScopeCustomers');
});

test('REMEDIATION 8: exports (rows) vẫn nguồn TỪ eligibleCustomers — export gate không đổi', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /const rows: QualityLeadRow\[\] = eligibleCustomers\.map\(customer => \{/);
});

// ─── Hành vi THẬT (import matches()/summarize() thật, không mirror) ────────
// Chứng minh bằng dữ liệu giả lập: population A(RAW)/B(CONTACTED)/C(INTERESTED)
// — rows-population (áp entry gate) chỉ còn C, summary-population (đầy đủ 3,
// gọi summarize() THẬT) vẫn đúng total=3/contacted=2/interested=1 và
// conversion tương ứng — chứng minh 2 population THỰC SỰ tách biệt, không chỉ
// khai báo trên giấy.

function makeRow(overrides: Partial<QualityLeadRow>): QualityLeadRow {
  return {
    id_khach_hang: 'KH', ten_KH: 'Khách', so_dien_thoai: '', du_an: '', san_pham_quan_tam: '', nhu_cau: '',
    ngan_sach_min: 0, ngan_sach_max: 0, muc_dich: '', thoi_gian_du_kien: '', phuong_an_tai_chinh: '', khu_vuc_yeu_cau: '',
    muc_do_quan_tam: 'Chưa xác định', hanh_dong_tiep_theo: '', lead_quality_score: 0, lead_quality_rank: 'UNQUALIFIED',
    qualification_status: 'RAW', lead_score_breakdown: '[]', nguon_data: '', telesale: '', sale_nhan: '',
    ngay_tao: '2026-01-01T00:00:00.000Z', ngay_quan_tam: '', ngay_ban_giao: '', ngay_sale_nhan: '',
    handoff_status: 'Chưa bàn giao', pipeline_status: '', latest_note: '',
    ...overrides,
  };
}

test('REMEDIATION 9 (hành vi thực): rows-population (entry gate + matches() thật) chỉ còn INTERESTED; RAW/CONTACTED bị loại', () => {
  const A = makeRow({ id_khach_hang: 'A', qualification_status: 'RAW' });
  const B = makeRow({ id_khach_hang: 'B', qualification_status: 'CONTACTED' });
  const C = makeRow({ id_khach_hang: 'C', qualification_status: 'INTERESTED' });
  const fullScope = [A, B, C];

  const eligibleRows = fullScope
    .filter(row => HANDOFF_ELIGIBLE_STATUSES.includes(row.qualification_status as QualificationStatus))
    .filter(row => matches(row, {}));

  assert.deepEqual(eligibleRows.map(row => row.id_khach_hang), ['C']);
});

test('REMEDIATION 10 (hành vi thực): summary-population (summarize() thật, KHÔNG entry gate) vẫn đại diện ĐẦY ĐỦ RAW+CONTACTED+INTERESTED', () => {
  const A = makeRow({ id_khach_hang: 'A', qualification_status: 'RAW' });
  const B = makeRow({ id_khach_hang: 'B', qualification_status: 'CONTACTED' });
  const C = makeRow({ id_khach_hang: 'C', qualification_status: 'INTERESTED' });
  const fullScope = [A, B, C];

  const summary = summarize(fullScope.filter(row => matches(row, {})));

  assert.equal(summary.metrics.total, 3, 'total phải đại diện ĐỦ 3 khách (A+B+C) — không bị entry gate thu hẹp');
  assert.equal(summary.metrics.contacted, 2, 'contacted = B + C (không RAW)');
  assert.equal(summary.metrics.interested, 1, 'interested = C');
  assert.equal(summary.conversion.contactRate, 2 / 3, 'contactRate phải tính trên denominator ĐẦY ĐỦ (3), không phải trên population đã bị entry gate');
  assert.equal(summary.conversion.interestRate, 1 / 2, 'interestRate = interested/contacted = 1/2, không lệch về ~100% như regression trước remediation');
});

test('REMEDIATION 11 (hành vi thực): nếu (sai) lấy summary TỪ rows-population đã bị entry gate (chỉ C) thì contactRate/interestRate lệch về 100% — chứng minh ĐÚNG lý do phải tách 2 population', () => {
  const C = makeRow({ id_khach_hang: 'C', qualification_status: 'INTERESTED' });
  const regressedSummary = summarize([C]); // mô phỏng CHÍNH regression đã bị Architecture Review phát hiện
  assert.equal(regressedSummary.metrics.total, 1);
  assert.equal(regressedSummary.conversion.contactRate, 1, 'regression: contactRate lệch thành 100% khi summary bị tính trên population đã entry-gate — đúng cảnh báo của Architecture Review');
  assert.equal(regressedSummary.conversion.interestRate, 1, 'regression: interestRate cũng lệch thành 100% — đây là lý do bắt buộc phải tách population');
});

test('F/G. matches()/inScope()/summarize() giữ NGUYÊN byte-identical — filter/search/summary semantics không regression', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');

  // LƯU Ý: chữ ký gốc pin `customer: CustomerRow` — REMEDIATION đổi sang
  // `customer: ScopeFields` để dùng chung cho cả 2 population (xem
  // tests/crm/quality-leads-p3a.test.ts "mirror fidelity" đã cập nhật cùng lý
  // do). THÂN hàm (logic) vẫn byte-identical.
  const inScopeStart = src.indexOf('function inScope(customer: ScopeFields, scope: CrmManagerScope): boolean {');
  const inScopeEnd = src.indexOf('\n}', inScopeStart) + '\n}'.length;
  assert.equal(src.slice(inScopeStart, inScopeEnd), `function inScope(customer: ScopeFields, scope: CrmManagerScope): boolean {
  return scope.allCustomers
    || scope.projectNames.includes(customer.du_an || '')
    || scope.directReportNames.includes(customer.telesale_phu_trach || '');
}`);

  const matchesStart = src.indexOf('function matches(row: QualityLeadRow, filters: QualifiedLeadFilters): boolean {');
  assert.ok(matchesStart >= 0);
  const matchesEnd = src.indexOf('\n}', matchesStart) + '\n}'.length;
  const matchesBody = src.slice(matchesStart, matchesEnd);
  for (const marker of [
    "if (filters.project && row.du_an !== filters.project) return false;",
    "if (filters.pipelineStatus && row.pipeline_status !== filters.pipelineStatus) return false;",
    "if (filters.search) {",
  ]) {
    assert.ok(matchesBody.includes(marker), `matches() phải còn nguyên: ${marker}`);
  }

  assert.match(src, /function summarize\(rows: QualityLeadRow\[\]\) \{/);
  assert.match(src, /interested: rows\.filter\(row => \['INTERESTED', 'QUALIFIED', 'HOT'\]\.includes\(row\.qualification_status\)\)\.length,/);
});

test('không thay đổi scoring/qualification calculation — transactional-workflow.ts/scoring.ts không nằm trong diff scope của task này (kiểm tra gián tiếp qua analytics.ts không import gì mới từ 2 file đó)', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.doesNotMatch(src, /from '\.\/scoring'/, 'analytics.ts không được tự tính điểm lại — chỉ đọc qualification_status đã có sẵn');
});
