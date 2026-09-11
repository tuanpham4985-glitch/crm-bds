// GET /api/khach-hang — Postgres WHERE-clause builders cho pagination thật
// (Batch 2). Tách RIÊNG thành hàm thuần (không đụng Prisma client, chỉ trả
// về Prisma.KhachHangWhereInput) để test được trực tiếp không cần DB, đúng
// convention repo hiện có (khach-hang-campaign-status.ts, khach-hang-bulk-filter.ts).
//
// buildKhachHangVisibilityWhere() PHẢI mirror ĐÚNG canViewCustomer +
// isDirectManager + privateGroupVisibleIds (crm-auth.ts / GET /api/khach-hang
// hiện có) — đây là authorization, không phải filter thường: sai ở đây nghĩa
// là lộ hoặc giấu nhầm khách hàng. Nếu sửa 1 bên (route.ts hiện dùng
// canViewCustomer/isDirectManager cho GS path) PHẢI soát lại bên kia.
//
// buildKhachHangFilterWhere() mirror ĐÚNG search/nguon/sale/du_an/from/to đã
// có trong route.ts (và khach-hang-bulk-filter.ts cho riêng search/from/to,
// dùng bởi "Chọn tất cả N khách hàng phù hợp bộ lọc" — xem comment ở đó).

import type { Prisma } from '../generated/prisma/client';
import type { CrmSessionUser } from './crm-auth';
import type { DuAn, NhanVien, KhachHang } from './types';
import type { CustomerAssignmentFields, CustomerDashboardFields } from './repository';

// NEON_TRANSFER_AUDIT P0 — narrow-projection mappers dùng bởi GS fallback
// path của getKhachHangCrmAccessFields()/getKhachHangDashboardFields()
// (data-access.ts): khi Postgres tắt hoặc lỗi, rút gọn KhachHang đầy đủ (đã
// có sẵn từ getKhachHang(), cached) xuống đúng field consumer cần — thay vì
// gọi lại full findAll(). Đặt ở đây (thuần, không đụng Prisma/next runtime)
// để test trực tiếp được, không cần load data-access.ts (đụng Prisma client
// generated → lỗi môi trường compile-verify đã biết, không liên quan code).
export function toAssignmentFields(kh: KhachHang): CustomerAssignmentFields {
  return {
    telesale_phu_trach: kh.telesale_phu_trach,
    sale_nhan_khach: kh.sale_nhan_khach,
    sale_phu_trach: kh.sale_phu_trach,
    du_an: kh.du_an,
    trang_thai_ban_giao: kh.trang_thai_ban_giao,
  };
}

export function toDashboardFields(kh: KhachHang): CustomerDashboardFields {
  return { nguon: kh.nguon, sale_phu_trach: kh.sale_phu_trach, ngay_tao: kh.ngay_tao };
}

export interface KhachHangListFilters {
  id?: string;
  search?: string;
  nguon?: string;
  sale?: string;
  du_an?: string;
  from?: string;
  to?: string;
}

/**
 * Visibility WHERE — mirror canViewCustomer(user, customer, projects) ||
 * isDirectManager(user, customer, employees) || privateGroupVisibleIds.has(id)
 * (crm-auth.ts + route.ts hiện có). isAdmin -> {} (không giới hạn, giống
 * canViewCustomer trả true ngay cho Admin). projects/employees chỉ dùng để
 * lọc RA 2 tập tên nhỏ (managedProjectNames/directReportNames) — 2 bảng này
 * nhỏ, đã fetch sẵn (getDuAn/getNhanVien, KHÔNG đổi ở Batch 2), KHÔNG phải
 * nguồn O(total customers).
 */
export function buildKhachHangVisibilityWhere(
  user: CrmSessionUser,
  isAdmin: boolean,
  projects: readonly DuAn[],
  employees: readonly NhanVien[],
  privateGroupVisibleIds: ReadonlySet<string>,
): Prisma.KhachHangWhereInput {
  if (isAdmin) return {};

  const managedProjectNames = projects
    .filter(project => project.truong_nhom === user.ho_ten)
    .map(project => project.ten_du_an);
  const directReportNames = employees
    .filter(employee => employee.ql_truc_tiep === user.ho_ten)
    .map(employee => employee.ho_ten);

  // customer.telesale_phu_trach === user.ho_ten || customer.sale_nhan_khach
  // === user.ho_ten || customer.sale_phu_trach === user.ho_ten (canViewCustomer,
  // bỏ isProjectManager/Admin — 2 nhánh đó xử lý riêng ở dưới).
  const or: Prisma.KhachHangWhereInput[] = [
    { telesale_phu_trach: user.ho_ten },
    { sale_nhan_khach: user.ho_ten },
    { sale_phu_trach: user.ho_ten },
  ];
  // isProjectManager: customer.du_an thuộc 1 project mà user là truong_nhom.
  if (managedProjectNames.length > 0) or.push({ du_an: { in: managedProjectNames } });
  // isDirectManager: customer.telesale_phu_trach là 1 nhân viên report trực
  // tiếp cho user (employee.ql_truc_tiep === user.ho_ten).
  if (directReportNames.length > 0) or.push({ telesale_phu_trach: { in: directReportNames } });
  // privateGroupVisibleIds — đường xem bổ sung (Nhóm riêng), KHÔNG thay thế
  // authority trên, chỉ CỘNG THÊM (xem route.ts + private-group-auth.ts).
  if (privateGroupVisibleIds.size > 0) or.push({ id_khach_hang: { in: [...privateGroupVisibleIds] } });

  return { OR: or };
}

/**
 * Filter WHERE — mirror ĐÚNG id/search/nguon/sale/du_an/from/to hiện có
 * trong route.ts (JS .filter() cũ). search: substring, không phân biệt hoa
 * thường trên ten_KH/so_dien_thoai/email (contains + mode:'insensitive' ==
 * .toLowerCase().includes() cũ). sale==='__none__': sale_phu_trach rỗng
 * (cột NOT NULL trong Postgres — "chưa gán" luôn là chuỗi rỗng, không phải
 * null, xem prisma/schema.prisma). from/to: so sánh CHUỖI trên ngay_tao (cột
 * String, ISO 8601 — mọi khách hàng được tạo qua new Date().toISOString()
 * nên so sánh chuỗi cho ĐÚNG thứ tự thời gian, xem ghi chú trong route.ts).
 */
export function buildKhachHangFilterWhere(filters: KhachHangListFilters): Prisma.KhachHangWhereInput {
  const where: Prisma.KhachHangWhereInput = {};

  if (filters.id) where.id_khach_hang = filters.id;

  if (filters.search) {
    const q = filters.search;
    where.OR = [
      { ten_KH: { contains: q, mode: 'insensitive' } },
      { so_dien_thoai: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (filters.nguon) where.nguon = filters.nguon;

  if (filters.sale === '__none__') where.sale_phu_trach = '';
  else if (filters.sale) where.sale_phu_trach = filters.sale;

  if (filters.du_an) where.du_an = filters.du_an;

  if (filters.from || filters.to) {
    const ngayTaoRange: Prisma.StringFilter = {};
    if (filters.from) ngayTaoRange.gte = filters.from;
    if (filters.to) ngayTaoRange.lte = `${filters.to}T23:59:59`;
    where.ngay_tao = ngayTaoRange;
  }

  return where;
}

/** AND của visibility + filter — dùng cho "total" (base scope, KHÔNG gồm
 * campaignStatus/datasetId, xem route.ts cho ý nghĩa "total" đã khoá). */
export function buildKhachHangBaseWhere(
  user: CrmSessionUser,
  isAdmin: boolean,
  projects: readonly DuAn[],
  employees: readonly NhanVien[],
  privateGroupVisibleIds: ReadonlySet<string>,
  filters: KhachHangListFilters,
): Prisma.KhachHangWhereInput {
  return {
    AND: [
      buildKhachHangVisibilityWhere(user, isAdmin, projects, employees, privateGroupVisibleIds),
      buildKhachHangFilterWhere(filters),
    ],
  };
}
