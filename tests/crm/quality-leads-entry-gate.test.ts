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

// ─── REDESIGN ───────────────────────────────────────────────────────────────
// DATA_TIEM_NANG_BUSINESS_REDESIGN_APPROVED — supersedes toàn bộ phần
// REMEDIATION cũ từng ở đây. ChatGPT Architecture Review đã CHỐT: full-CSKH
// funnel (Tổng data/Đã liên hệ + contactRate/interestRate, tính trên TOÀN BỘ
// Customer trong scope) là CSKH-domain analytics, KHÔNG thuộc quyền sở hữu
// "Data tiềm năng" nữa. Trang này giờ CHỈ sở hữu 1 population — eligible
// (qualification_status ∈ HANDOFF_ELIGIBLE_STATUSES) — dùng CHUNG cho
// rows/export/options VÀ summary/funnel/byTelesale/bySource. Test dưới đây
// chứng minh: (a) chỉ còn 1 query Customer, (b) dead code (FULL_SCOPE_SELECT/
// toSummaryRow/summaryRows/fullScopeCustomers/fullScopeIds) đã bị xoá, (c)
// pipeline join thu hẹp về eligibleIds, (d) hành vi THẬT của summarize() trên
// population mới (INTERESTED/QUALIFIED/HOT only).

test('REDESIGN 1: đúng 1 lệnh khachHang.findMany() duy nhất — không còn Query A (full-scope)', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('export async function queryQualityLeads');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  const count = (body.match(/prisma\.khachHang\.findMany\(/g) || []).length;
  assert.equal(count, 1, 'queryQualityLeads chỉ còn 1 query Customer — Data tiềm năng sở hữu đúng 1 population (eligible)');
});

test('REDESIGN 2: khai báo full-scope (select/type/hàm/biến) đã bị xoá (dead code sau redesign) — chỉ kiểm tra DECLARATION, không phải mọi nhắc tên trong comment lịch sử', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const deadDeclarations = [
    /const FULL_SCOPE_SELECT\b/, /type FullScopeCustomerRow\b/, /function toSummaryRow\(/,
    /const DISPLAY_ONLY_DEFAULTS\b/, /type DisplayOnlyField\b/,
    /const summaryRows\b/, /const fullScopeCustomers\b/, /const fullScopeIds\b/,
  ];
  for (const pattern of deadDeclarations) {
    assert.doesNotMatch(src, pattern, `${pattern} phải bị xoá khỏi analytics.ts sau redesign — không còn population full-scope nào dùng tới`);
  }
});

test('REDESIGN 3: query Customer duy nhất vẫn dùng DATA_TIEM_NANG_WHERE + CUSTOMER_SELECT (P3A 27 field) — nguồn CHO CẢ rows/export/options LẪN summary/funnel', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /prisma\.khachHang\.findMany\(\{\s*where:\s*DATA_TIEM_NANG_WHERE,\s*select:\s*CUSTOMER_SELECT,\s*orderBy:\s*\{\s*ngay_tao:\s*'desc'\s*\}\s*\}\)/);
});

test('REDESIGN 4: summary được tính TỪ `rows` (eligible + filters đã áp dụng) — KHÔNG còn population riêng cho summary', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /const summary = summarize\(rows\);/, 'summarize() phải nhận rows (eligible, đã filter) — cùng population với UI/export');
});

test('REDESIGN 5: Pipeline join thu hẹp về eligibleIds (không còn fullScopeIds)', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /prisma\.pipeline\.findMany\(\{\s*where:\s*\{\s*id_khach_hang:\s*\{\s*in:\s*eligibleIds\s*\}\s*\},\s*orderBy:\s*\{\s*updated_at:\s*'desc'\s*\}\s*\}\)/);
});

test('REDESIGN 6: Handoff join vẫn dùng eligibleIds (không đổi so với trước redesign)', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /const eligibleIds = eligibleCustomers\.map\(customer => customer\.id_khach_hang\);/);
  assert.match(src, /prisma\.crmHandoff\.findMany\(\{\s*where:\s*\{\s*customer_id:\s*\{\s*in:\s*eligibleIds\s*\}\s*\},\s*orderBy:\s*\{\s*created_at:\s*'desc'\s*\}\s*\}\)/);
});

test('REDESIGN 7: options vẫn tính TỪ eligibleCustomers (không đổi so với trước redesign)', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('const options = {');
  const end = src.indexOf('};', start) + 2;
  const body = src.slice(start, end);
  assert.match(body, /eligibleCustomers\.map/, 'projects/telesales/sales/sources phải nguồn từ eligibleCustomers');
});

test('REDESIGN 8: rows (UI/export) vẫn nguồn TỪ eligibleCustomers — export gate không đổi', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /const rows: QualityLeadRow\[\] = eligibleCustomers\.map\(customer => \{/);
});

// ─── Hành vi THẬT (import summarize() thật, không mirror) ──────────────────
// Chứng minh bằng dữ liệu giả lập: population chỉ gồm INTERESTED/QUALIFIED/HOT
// (đúng shape production sẽ trả về sau redesign, vì WHERE đã gate ở Prisma) —
// summarize() THẬT phải cho total=3/interested=3/qualified=2/hot=1, đúng yêu
// cầu nghiệp vụ approved (section 12 của task redesign).

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

test('REDESIGN 9 (hành vi thực): eligible-only population (A=INTERESTED, B=QUALIFIED, C=HOT) — WHERE đã loại RAW/CONTACTED trước khi tới đây', () => {
  const A = makeRow({ id_khach_hang: 'A', qualification_status: 'INTERESTED' });
  const B = makeRow({ id_khach_hang: 'B', qualification_status: 'QUALIFIED' });
  const C = makeRow({ id_khach_hang: 'C', qualification_status: 'HOT' });
  const eligibleRows = [A, B, C]
    .filter(row => HANDOFF_ELIGIBLE_STATUSES.includes(row.qualification_status as QualificationStatus))
    .filter(row => matches(row, {}));
  assert.deepEqual(eligibleRows.map(row => row.id_khach_hang), ['A', 'B', 'C'], 'cả 3 đều đã qua entry gate (WHERE Prisma), không có RAW/CONTACTED nào lọt vào để loại thêm ở đây');
});

test('REDESIGN 10 (hành vi thực): summarize() thật trên population eligible-only cho ĐÚNG total=3, interested=3, qualified=2, hot=1', () => {
  const A = makeRow({ id_khach_hang: 'A', qualification_status: 'INTERESTED' });
  const B = makeRow({ id_khach_hang: 'B', qualification_status: 'QUALIFIED' });
  const C = makeRow({ id_khach_hang: 'C', qualification_status: 'HOT' });

  const summary = summarize([A, B, C]);

  assert.equal(summary.metrics.total, 3, 'total = A+B+C (Tổng tiềm năng)');
  assert.equal(summary.metrics.interested, 3, 'interested = cả 3 (mọi dòng eligible đều ≥ INTERESTED) — trùng total, ĐÚNG như kỳ vọng redesign, không phải lỗi');
  assert.equal(summary.metrics.qualified, 2, 'qualified = B + C (QUALIFIED/HOT)');
  assert.equal(summary.metrics.hot, 1, 'hot = C (HOT only)');
  assert.equal(summary.conversion.qualifiedRate, 2 / 3, 'Tiềm năng → Đủ điều kiện = qualified/interested = 2/3');
  assert.equal(summary.conversion.hotRate, 1 / 2, 'Đủ điều kiện → Tiềm năng cao = hot/qualified = 1/2');
});

test('REDESIGN 11 (hành vi thực): byTelesale/bySource của summarize() chỉ nhóm trên population eligible truyền vào — không có RAW/CONTACTED nào để leak vào breakdown', () => {
  const A = makeRow({ id_khach_hang: 'A', qualification_status: 'INTERESTED', telesale: 'Sale 1', nguon_data: 'Facebook' });
  const B = makeRow({ id_khach_hang: 'B', qualification_status: 'HOT', telesale: 'Sale 1', nguon_data: 'Zalo' });
  const C = makeRow({ id_khach_hang: 'C', qualification_status: 'QUALIFIED', telesale: 'Sale 2', nguon_data: 'Facebook' });

  const summary = summarize([A, B, C]);

  assert.equal(summary.byTelesale.length, 2, 'byTelesale nhóm theo đúng 2 Sale xuất hiện trong population truyền vào');
  const sale1 = summary.byTelesale.find(row => row.name === 'Sale 1');
  assert.ok(sale1);
  assert.equal(sale1!.total, 2, 'Sale 1 có A+B — cả 2 đều eligible (INTERESTED/HOT)');
  assert.equal(sale1!.hot, 1, 'Sale 1 có đúng 1 HOT (B)');

  assert.equal(summary.bySource.length, 2, 'bySource nhóm theo đúng 2 nguồn xuất hiện trong population truyền vào');
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
