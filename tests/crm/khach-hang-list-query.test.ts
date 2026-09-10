import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildKhachHangVisibilityWhere, buildKhachHangFilterWhere, buildKhachHangBaseWhere,
} from '../../src/lib/khach-hang-list-query';
import type { CrmSessionUser } from '../../src/lib/crm-auth';
import type { DuAn, NhanVien } from '../../src/lib/types';

// Batch 2 Part A — WHERE-clause builders phải mirror ĐÚNG canViewCustomer +
// isDirectManager + privateGroupVisibleIds (crm-auth.ts / GET /api/khach-hang
// nhánh Google Sheets, KHÔNG đổi ở Batch 2) — test này khoá lại authorization
// SQL sinh ra khớp CHÍNH XÁC với authority JS gốc, không suy đoán.

function user(ho_ten: string, overrides: Partial<CrmSessionUser> = {}): CrmSessionUser {
  return { id_nhan_vien: 'NV1', ho_ten, email: '', vai_tro: 'Sale', ...overrides };
}

const admin = user('Admin User', { vai_tro: 'Admin' });
const sale = user('Nguyễn Văn A');

const projects: DuAn[] = [
  { id_du_an: 'DA1', ten_du_an: 'Dự án X', truong_nhom: 'Nguyễn Văn A' } as DuAn,
  { id_du_an: 'DA2', ten_du_an: 'Dự án Y', truong_nhom: 'Người khác' } as DuAn,
];
const employees: NhanVien[] = [
  { id_nhan_vien: 'NV2', ho_ten: 'Trần Thị B', ql_truc_tiep: 'Nguyễn Văn A' } as NhanVien,
  { id_nhan_vien: 'NV3', ho_ten: 'Lê Văn C', ql_truc_tiep: 'Người khác' } as NhanVien,
];

// ─── Visibility (authorization) ────────────────────────────────────────────

test('buildKhachHangVisibilityWhere: Admin -> {} (không giới hạn) — mirror isCrmAdmin(user) trả true ngay trong canViewCustomer', () => {
  const where = buildKhachHangVisibilityWhere(admin, true, projects, employees, new Set());
  assert.deepEqual(where, {});
});

test('buildKhachHangVisibilityWhere: non-admin -> OR gồm đúng 3 field trực tiếp (telesale_phu_trach/sale_nhan_khach/sale_phu_trach = user.ho_ten) — mirror canViewCustomer', () => {
  const where = buildKhachHangVisibilityWhere(sale, false, [], [], new Set());
  assert.deepEqual(where, {
    OR: [
      { telesale_phu_trach: 'Nguyễn Văn A' },
      { sale_nhan_khach: 'Nguyễn Văn A' },
      { sale_phu_trach: 'Nguyễn Văn A' },
    ],
  });
});

test('buildKhachHangVisibilityWhere: có project truong_nhom = user -> thêm OR du_an IN [tên các project đó] — mirror isProjectManager', () => {
  const where = buildKhachHangVisibilityWhere(sale, false, projects, [], new Set());
  assert.deepEqual(where, {
    OR: [
      { telesale_phu_trach: 'Nguyễn Văn A' },
      { sale_nhan_khach: 'Nguyễn Văn A' },
      { sale_phu_trach: 'Nguyễn Văn A' },
      { du_an: { in: ['Dự án X'] } },
    ],
  });
});

test('buildKhachHangVisibilityWhere: có nhân viên report trực tiếp (ql_truc_tiep = user) -> thêm OR telesale_phu_trach IN [tên các nhân viên đó] — mirror isDirectManager', () => {
  const where = buildKhachHangVisibilityWhere(sale, false, [], employees, new Set());
  assert.deepEqual(where, {
    OR: [
      { telesale_phu_trach: 'Nguyễn Văn A' },
      { sale_nhan_khach: 'Nguyễn Văn A' },
      { sale_phu_trach: 'Nguyễn Văn A' },
      { telesale_phu_trach: { in: ['Trần Thị B'] } },
    ],
  });
});

test('buildKhachHangVisibilityWhere: privateGroupVisibleIds không rỗng -> thêm OR id_khach_hang IN [...ids] — mirror privateGroupVisibleIds.has(id) trong route.ts', () => {
  const where = buildKhachHangVisibilityWhere(sale, false, [], [], new Set(['KH1', 'KH2']));
  assert.deepEqual(where, {
    OR: [
      { telesale_phu_trach: 'Nguyễn Văn A' },
      { sale_nhan_khach: 'Nguyễn Văn A' },
      { sale_phu_trach: 'Nguyễn Văn A' },
      { id_khach_hang: { in: ['KH1', 'KH2'] } },
    ],
  });
});

test('buildKhachHangVisibilityWhere: cả 4 nguồn visibility cùng có mặt -> OR gồm đủ cả 6 điều kiện, không thiếu không thừa', () => {
  const where = buildKhachHangVisibilityWhere(sale, false, projects, employees, new Set(['KH9']));
  assert.deepEqual(where, {
    OR: [
      { telesale_phu_trach: 'Nguyễn Văn A' },
      { sale_nhan_khach: 'Nguyễn Văn A' },
      { sale_phu_trach: 'Nguyễn Văn A' },
      { du_an: { in: ['Dự án X'] } },
      { telesale_phu_trach: { in: ['Trần Thị B'] } },
      { id_khach_hang: { in: ['KH9'] } },
    ],
  });
});

test('buildKhachHangVisibilityWhere: không có project/employee/private-group liên quan -> OR CHỈ gồm 3 field trực tiếp, KHÔNG thêm mệnh đề IN rỗng thừa (in: [] khớp 0 dòng, không phải "bỏ qua")', () => {
  const where = buildKhachHangVisibilityWhere(sale, false, projects, employees, new Set());
  const otherSale = user('Không liên quan gì');
  const whereOther = buildKhachHangVisibilityWhere(otherSale, false, projects, employees, new Set());
  assert.deepEqual(whereOther, {
    OR: [
      { telesale_phu_trach: 'Không liên quan gì' },
      { sale_nhan_khach: 'Không liên quan gì' },
      { sale_phu_trach: 'Không liên quan gì' },
    ],
  });
  assert.notDeepEqual(where, whereOther); // sanity: 2 user khác nhau ra where khác nhau
});

// ─── Filters ────────────────────────────────────────────────────────────────

test('buildKhachHangFilterWhere: rỗng -> {} (không filter nào áp dụng, khớp mọi khách hàng đã qua visibility)', () => {
  assert.deepEqual(buildKhachHangFilterWhere({}), {});
});

test('buildKhachHangFilterWhere: id -> id_khach_hang = id (exact)', () => {
  assert.deepEqual(buildKhachHangFilterWhere({ id: 'KH123' }), { id_khach_hang: 'KH123' });
});

test('buildKhachHangFilterWhere: search -> OR contains+insensitive trên ten_KH/so_dien_thoai/email — mirror .toLowerCase().includes() cũ (substring, không phân biệt hoa thường)', () => {
  assert.deepEqual(buildKhachHangFilterWhere({ search: 'Nguyễn' }), {
    OR: [
      { ten_KH: { contains: 'Nguyễn', mode: 'insensitive' } },
      { so_dien_thoai: { contains: 'Nguyễn', mode: 'insensitive' } },
      { email: { contains: 'Nguyễn', mode: 'insensitive' } },
    ],
  });
});

test('buildKhachHangFilterWhere: nguon -> nguon = X (exact)', () => {
  assert.deepEqual(buildKhachHangFilterWhere({ nguon: 'Facebook' }), { nguon: 'Facebook' });
});

test('buildKhachHangFilterWhere: sale="__none__" -> sale_phu_trach = "" (cột NOT NULL — "chưa gán" là chuỗi rỗng, không phải null) — mirror !kh.sale_phu_trach cũ', () => {
  assert.deepEqual(buildKhachHangFilterWhere({ sale: '__none__' }), { sale_phu_trach: '' });
});

test('buildKhachHangFilterWhere: sale thường -> sale_phu_trach = X (exact)', () => {
  assert.deepEqual(buildKhachHangFilterWhere({ sale: 'Nguyễn Văn A' }), { sale_phu_trach: 'Nguyễn Văn A' });
});

test('buildKhachHangFilterWhere: du_an -> du_an = X (exact)', () => {
  assert.deepEqual(buildKhachHangFilterWhere({ du_an: 'Dự án X' }), { du_an: 'Dự án X' });
});

test('buildKhachHangFilterWhere: from -> ngay_tao.gte = from (chuỗi, so sánh ISO 8601 prefix) — mirror new Date(ngay_tao) >= new Date(from)', () => {
  assert.deepEqual(buildKhachHangFilterWhere({ from: '2026-09-01' }), { ngay_tao: { gte: '2026-09-01' } });
});

test('buildKhachHangFilterWhere: to -> ngay_tao.lte = to + "T23:59:59" — mirror new Date(ngay_tao) <= new Date(to + "T23:59:59") cũ (bao trọn hết ngày "to")', () => {
  assert.deepEqual(buildKhachHangFilterWhere({ to: '2026-09-10' }), { ngay_tao: { lte: '2026-09-10T23:59:59' } });
});

test('buildKhachHangFilterWhere: from + to cùng lúc -> gộp chung 1 field ngay_tao {gte, lte}, không tách 2 field riêng (Prisma where chỉ nhận 1 khoá "ngay_tao")', () => {
  assert.deepEqual(buildKhachHangFilterWhere({ from: '2026-09-01', to: '2026-09-10' }), {
    ngay_tao: { gte: '2026-09-01', lte: '2026-09-10T23:59:59' },
  });
});

test('buildKhachHangFilterWhere: mọi filter cùng lúc -> gộp đủ tất cả field, không mất filter nào', () => {
  const where = buildKhachHangFilterWhere({
    id: 'KH1', search: 'an', nguon: 'Zalo', sale: 'Sale X', du_an: 'DA1',
    from: '2026-01-01', to: '2026-12-31',
  });
  assert.deepEqual(where, {
    id_khach_hang: 'KH1',
    OR: [
      { ten_KH: { contains: 'an', mode: 'insensitive' } },
      { so_dien_thoai: { contains: 'an', mode: 'insensitive' } },
      { email: { contains: 'an', mode: 'insensitive' } },
    ],
    nguon: 'Zalo',
    sale_phu_trach: 'Sale X',
    du_an: 'DA1',
    ngay_tao: { gte: '2026-01-01', lte: '2026-12-31T23:59:59' },
  });
});

// ─── Base (visibility AND filter) ──────────────────────────────────────────

test('buildKhachHangBaseWhere: AND của visibility + filter — Admin + search vẫn giữ filter (visibility rỗng KHÔNG có nghĩa "bỏ AND", chỉ có nghĩa "không giới hạn thêm")', () => {
  const where = buildKhachHangBaseWhere(admin, true, [], [], new Set(), { search: 'an' });
  assert.deepEqual(where, {
    AND: [
      {},
      { OR: [
        { ten_KH: { contains: 'an', mode: 'insensitive' } },
        { so_dien_thoai: { contains: 'an', mode: 'insensitive' } },
        { email: { contains: 'an', mode: 'insensitive' } },
      ] },
    ],
  });
});

test('buildKhachHangBaseWhere: non-admin không filter gì thêm -> AND của [visibility, {}]', () => {
  const where = buildKhachHangBaseWhere(sale, false, [], [], new Set(), {});
  assert.deepEqual(where, {
    AND: [
      { OR: [
        { telesale_phu_trach: 'Nguyễn Văn A' },
        { sale_nhan_khach: 'Nguyễn Văn A' },
        { sale_phu_trach: 'Nguyễn Văn A' },
      ] },
      {},
    ],
  });
});
