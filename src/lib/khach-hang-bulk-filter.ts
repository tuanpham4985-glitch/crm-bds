// Pure predicate dùng cho "Chọn tất cả N khách hàng phù hợp bộ lọc" (bulk add
// vào Campaign từ /khach-hang) — server phải tự resolve id theo ĐÚNG bộ lọc
// Admin đang xem, không nhận danh sách id/object từ client cho trường hợp này.
//
// Cố ý mirror ĐÚNG semantics search/from/to của GET /api/khach-hang
// (src/app/api/khach-hang/route.ts) — KHÔNG import lại route đó (route là
// server component gắn với request/response, không phải hàm thuần tái dùng
// được) nên trùng lặp có chủ đích ở đây. Nếu sửa filter semantics ở 1 nơi,
// PHẢI soát lại nơi còn lại để 2 nơi không lệch nhau (test parity ở
// tests/crm/campaign-bulk-membership.test.ts khoá việc này).
export interface CustomerBulkFilter {
  search?: string;
  from?: string;
  to?: string;
  /** CUSTOMER DATASET — KHÔNG dùng trong matchesCustomerBulkFilter (pure, chỉ
   * search/from/to đúng contract cũ). Áp dụng RIÊNG ở call site (campaign.ts
   * resolveCustomerIdsByFilter/resolveCustomerIdsByRange) qua filterByDataset
   * (dataset.ts) vì cần query DB — giữ hàm này thuần/đồng bộ. */
  datasetId?: string;
}

export function matchesCustomerBulkFilter(
  customer: { ten_KH: string; so_dien_thoai?: string | null; email?: string | null; ngay_tao: string },
  filter: CustomerBulkFilter,
): boolean {
  if (filter.search) {
    const q = filter.search.toLowerCase();
    const matches = customer.ten_KH.toLowerCase().includes(q)
      || (customer.so_dien_thoai || '').includes(q)
      || (customer.email || '').toLowerCase().includes(q);
    if (!matches) return false;
  }
  if (filter.from && new Date(customer.ngay_tao) < new Date(filter.from)) return false;
  if (filter.to && new Date(customer.ngay_tao) > new Date(`${filter.to}T23:59:59`)) return false;
  return true;
}
