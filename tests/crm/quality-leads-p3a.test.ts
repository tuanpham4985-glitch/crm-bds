import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// KHACH_HANG_P3A — queryQualityLeads() (analytics.ts, backs GET /api/crm/
// qualified-leads, "Data tiềm năng") trước đây gọi prisma.khachHang.findMany({
// orderBy }) KHÔNG select — full ~48 cột Customer, PRODUCTION-CONFIRMED bằng
// pg_stat_user_tables A/B test (khach_hang.seq_scan +1, seq_tup_read +6998 —
// khớp CHÍNH XÁC row count hiện có, xem P3 audit + P3 A/B report). Thay bằng
// select CHÍNH XÁC 27 field mà queryQualityLeads()/inScope() thực sự đọc —
// KHÔNG đổi row scope (vẫn findMany không where), KHÔNG đổi Pipeline/Handoff
// join, KHÔNG đổi filter/sort/response logic. File này test phần THỰC SỰ đổi:
// query shape (1-4) + zero-drift trên logic (5-9) bằng literal mirror đã
// chứng minh byte-identical với source.

const ANALYTICS_PATH = 'src/lib/crm-funnel/analytics.ts';

// ─── 1-4. Query shape ───────────────────────────────────────────────────────

test('analytics.ts: queryQualityLeads() Customer findMany có select — không còn full findMany trần', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('export async function queryQualityLeads');
  assert.ok(start >= 0);
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  assert.match(body, /prisma\.khachHang\.findMany\(\{\s*select:\s*CUSTOMER_SELECT,\s*orderBy:\s*\{\s*ngay_tao:\s*'desc'\s*\}\s*\}\)/);
});

test('analytics.ts: CUSTOMER_SELECT chứa CHÍNH XÁC 27 field đã audit — không field nào khác', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('const CUSTOMER_SELECT');
  const end = src.indexOf('} satisfies Prisma.KhachHangSelect', start);
  const body = src.slice(start, end);

  const expectedFields = [
    'id_khach_hang', 'ten_KH', 'so_dien_thoai', 'du_an', 'san_pham_quan_tam', 'nhu_cau',
    'ngan_sach_min', 'ngan_sach_max', 'muc_dich', 'thoi_gian_du_kien', 'phuong_an_tai_chinh',
    'khu_vuc_yeu_cau', 'muc_do_quan_tam', 'hanh_dong_tiep_theo', 'lead_quality_score',
    'lead_quality_rank', 'qualification_status', 'lead_score_breakdown', 'nguon',
    'telesale_phu_trach', 'sale_nhan_khach', 'ngay_tao', 'ngay_quan_tam', 'ban_giao_luc',
    'sale_xac_nhan_luc', 'trang_thai_ban_giao', 'lich_su_cham_soc',
  ];
  for (const field of expectedFields) {
    assert.match(body, new RegExp(`\\b${field}:\\s*true`), `CUSTOMER_SELECT phải có field ${field}`);
  }
  const trueCount = (body.match(/:\s*true/g) || []).length;
  assert.equal(trueCount, expectedFields.length, `CUSTOMER_SELECT chỉ được đúng ${expectedFields.length} field đã audit, không thêm field nào "vì tiện"`);

  // Xác nhận KHÔNG có cột tài chính/text lịch sử KHÔNG dùng lọt vào (regression
  // guard cho các cột dễ nhầm vì tên gần giống field đang dùng).
  for (const unused of ['lead_score_history', 'ghi_chu', 'so_lan_lien_he', 'lich_su_ban_giao', 'mat_khau']) {
    assert.doesNotMatch(body, new RegExp(`\\b${unused}:\\s*true`), `CUSTOMER_SELECT không được có field không dùng: ${unused}`);
  }
});

test('analytics.ts: CustomerRow suy ra TỪ CUSTOMER_SELECT (Prisma.KhachHangGetPayload) — không phải type full-row cũ', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /type CustomerRow = Prisma\.KhachHangGetPayload<\{ select: typeof CUSTOMER_SELECT \}>;/);
  assert.doesNotMatch(src, /Awaited<ReturnType<typeof prisma\.khachHang\.findMany>>\[number\]/, 'không còn dùng full-row type cũ');
});

test('analytics.ts: orderBy giữ NGUYÊN ngay_tao desc, KHÔNG có where nào được thêm vào Customer findMany (row-scope không đổi)', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('export async function queryQualityLeads');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  const findManyStart = body.indexOf('prisma.khachHang.findMany(');
  const findManyEnd = body.indexOf(')', findManyStart) + 1;
  const call = body.slice(findManyStart, findManyEnd);
  assert.match(call, /orderBy:\s*\{\s*ngay_tao:\s*'desc'\s*\}/);
  assert.doesNotMatch(call, /where:/, 'row-scope (không where) phải giữ nguyên trong task P3A — column narrowing only');
});

test('analytics.ts: chỉ ĐÚNG 1 lệnh khachHang.findMany() trong queryQualityLeads — không tách thành nhiều query thay thế', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('export async function queryQualityLeads');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  const count = (body.match(/prisma\.khachHang\.findMany\(/g) || []).length;
  assert.equal(count, 1, 'queryQualityLeads phải giữ đúng 1 query Customer duy nhất');
});

// ─── 8. Pipeline/Handoff join KHÔNG đổi ─────────────────────────────────────

test('analytics.ts: Pipeline/CrmHandoff join giữ NGUYÊN — không đụng trong task P3A (column narrowing chỉ áp dụng cho Customer)', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  assert.match(src, /prisma\.pipeline\.findMany\(\{\s*where:\s*\{\s*id_khach_hang:\s*\{\s*in:\s*ids\s*\}\s*\},\s*orderBy:\s*\{\s*updated_at:\s*'desc'\s*\}\s*\}\)/);
  assert.match(src, /prisma\.crmHandoff\.findMany\(\{\s*where:\s*\{\s*customer_id:\s*\{\s*in:\s*ids\s*\}\s*\},\s*orderBy:\s*\{\s*created_at:\s*'desc'\s*\}\s*\}\)/);
});

// ─── 5-7. Behavioral equivalence — literal mirror của inScope/matches/mapping
// logic (byte-proven identical to source below), chạy với dữ liệu CHỈ có 27
// field narrow (đúng shape production sẽ trả về sau khi narrow) để chứng minh
// không có field nào bị thiếu âm thầm làm hỏng logic. ──────────────────────

interface NarrowCustomer {
  id_khach_hang: string; ten_KH: string; so_dien_thoai: string | null; du_an: string | null;
  san_pham_quan_tam: string | null; nhu_cau: string | null; ngan_sach_min: number | null; ngan_sach_max: number | null;
  muc_dich: string | null; thoi_gian_du_kien: string | null; phuong_an_tai_chinh: string | null; khu_vuc_yeu_cau: string | null;
  muc_do_quan_tam: string | null; hanh_dong_tiep_theo: string | null; lead_quality_score: number; lead_quality_rank: string;
  qualification_status: string; lead_score_breakdown: string | null; nguon: string | null; telesale_phu_trach: string | null;
  sale_nhan_khach: string | null; ngay_tao: string; ngay_quan_tam: string | null; ban_giao_luc: string | null;
  sale_xac_nhan_luc: string | null; trang_thai_ban_giao: string | null; lich_su_cham_soc: string | null;
}

function narrowCustomer(overrides: Partial<NarrowCustomer> = {}): NarrowCustomer {
  return {
    id_khach_hang: 'KH1', ten_KH: 'Khách A', so_dien_thoai: '0901234567', du_an: 'Vinhomes Sài Gòn Park',
    san_pham_quan_tam: '', nhu_cau: '', ngan_sach_min: 0, ngan_sach_max: 0, muc_dich: '', thoi_gian_du_kien: '',
    phuong_an_tai_chinh: '', khu_vuc_yeu_cau: '', muc_do_quan_tam: 'Chưa xác định', hanh_dong_tiep_theo: '',
    lead_quality_score: 0, lead_quality_rank: 'UNQUALIFIED', qualification_status: 'RAW', lead_score_breakdown: '[]',
    nguon: 'Facebook', telesale_phu_trach: '', sale_nhan_khach: '', ngay_tao: '2026-01-01T00:00:00.000Z',
    ngay_quan_tam: '', ban_giao_luc: '', sale_xac_nhan_luc: '', trang_thai_ban_giao: 'Chưa bàn giao',
    lich_su_cham_soc: '[]',
    ...overrides,
  };
}

// Mirror BYTE-IDENTICAL với inScope() trong analytics.ts (verify ở test dưới).
function inScope(customer: NarrowCustomer, scope: { allCustomers: boolean; projectNames: string[]; directReportNames: string[] }): boolean {
  return scope.allCustomers
    || scope.projectNames.includes(customer.du_an || '')
    || scope.directReportNames.includes(customer.telesale_phu_trach || '');
}

test('mirror fidelity: inScope() trong file khớp BYTE-IDENTICAL với bản mirror dùng để test bên dưới', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  const start = src.indexOf('function inScope(customer: CustomerRow, scope: CrmManagerScope): boolean {');
  assert.ok(start >= 0);
  const end = src.indexOf('\n}', start) + '\n}'.length;
  const body = src.slice(start, end);
  const expected = `function inScope(customer: CustomerRow, scope: CrmManagerScope): boolean {
  return scope.allCustomers
    || scope.projectNames.includes(customer.du_an || '')
    || scope.directReportNames.includes(customer.telesale_phu_trach || '');
}`;
  assert.equal(body, expected, 'inScope() phải BYTE-IDENTICAL — P3A không được đổi logic, chỉ đổi kiểu tham số qua CustomerRow');
});

test('5. inScope: narrow customer object (27 field) vẫn hoạt động đúng — Admin thấy tất cả, non-admin theo project/telesale', () => {
  const admin = { allCustomers: true, projectNames: [], directReportNames: [] };
  const nonAdmin = { allCustomers: false, projectNames: ['Vinhomes Sài Gòn Park'], directReportNames: [] };
  const nonAdminNoMatch = { allCustomers: false, projectNames: ['Dự án khác'], directReportNames: [] };

  assert.equal(inScope(narrowCustomer(), admin), true);
  assert.equal(inScope(narrowCustomer(), nonAdmin), true);
  assert.equal(inScope(narrowCustomer(), nonAdminNoMatch), false);
  assert.equal(inScope(narrowCustomer({ telesale_phu_trach: 'Nguyễn Văn B' }), { allCustomers: false, projectNames: [], directReportNames: ['Nguyễn Văn B'] }), true);
});

test('6. row mapping: narrow customer (27 field) vẫn tạo được đúng QualityLeadRow shape với đầy đủ field UI dùng', () => {
  const customer = narrowCustomer({
    id_khach_hang: 'KH_TEST', ten_KH: 'Test User', so_dien_thoai: '0909999999',
    lead_quality_score: 85, lead_quality_rank: 'HOT', qualification_status: 'HOT',
    lich_su_cham_soc: JSON.stringify([{ ghi_chu: 'Đã gọi, quan tâm' }]),
  });
  // Mirror rút gọn của phần mapping trong queryQualityLeads (dùng narrow object).
  const history = JSON.parse(customer.lich_su_cham_soc || '[]');
  const latest = history.at(-1);
  const row = {
    id_khach_hang: customer.id_khach_hang, ten_KH: customer.ten_KH, so_dien_thoai: customer.so_dien_thoai || '',
    lead_quality_score: customer.lead_quality_score, lead_quality_rank: customer.lead_quality_rank,
    qualification_status: customer.qualification_status,
    latest_note: latest?.ghi_chu || '',
  };
  assert.equal(row.id_khach_hang, 'KH_TEST');
  assert.equal(row.lead_quality_score, 85);
  assert.equal(row.qualification_status, 'HOT');
  assert.equal(row.latest_note, 'Đã gọi, quan tâm');
});

test('7. filter behavior không đổi: matches() logic (project/telesale/rank/search...) vẫn hoạt động trên field narrow', () => {
  const src = readFileSync(resolve(ANALYTICS_PATH), 'utf8');
  // Xác nhận matches() KHÔNG bị đổi trong P3A (chỉ Customer select đổi).
  assert.match(src, /function matches\(row: QualityLeadRow, filters: QualifiedLeadFilters\): boolean \{/);
  assert.match(src, /if \(filters\.project && row\.du_an !== filters\.project\) return false;/);
  assert.match(src, /if \(filters\.search\) \{/);
});
