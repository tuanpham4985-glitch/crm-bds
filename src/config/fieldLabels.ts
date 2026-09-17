// ============================================================
// Field Labels — UI Layer (Vietnamese display labels)
// Maps English core keys → Vietnamese UI labels
// ============================================================

export const FIELD_LABELS: Record<string, string> = {
  // Contract fields
  contract_employee_type: 'Kiểu nhân viên',
  department: 'Khối làm việc',
  contract_type: 'Loại hợp đồng',
  template_file: 'Mẫu hợp đồng',
  phong_KD: 'Phòng KD',
  khu_vuc: 'Khu vực',
  gioi_tinh: 'Giới tính',
  employee_type: 'Chức danh',

  // Common fields
  id: 'Mã',
  id_nhan_vien: 'Mã nhân viên',
  so_hop_dong: 'Số hợp đồng',
  ngay_bat_dau: 'Ngày bắt đầu',
  ngay_ket_thuc: 'Ngày kết thúc',
  luong_co_ban: 'Lương cơ bản',
  ghi_chu: 'Ghi chú',
  created_at: 'Ngày tạo',

  // Bổ nhiệm / Miễn nhiệm chức vụ
  chuc_vu_bo_nhiem: 'Chức vụ bổ nhiệm',
  ngay_bo_nhiem: 'Ngày bổ nhiệm',
  so_quyet_dinh_bo_nhiem: 'Số QĐ bổ nhiệm',
  nguoi_ky_bo_nhiem: 'Người ký (bổ nhiệm)',
  ngay_mien_nhiem: 'Ngày miễn nhiệm',
  so_quyet_dinh_mien_nhiem: 'Số QĐ miễn nhiệm',
  nguoi_ky_mien_nhiem: 'Người ký (miễn nhiệm)',
  phong_ban: 'Phòng ban/KD',
  du_an: 'Dự án',

  // Employee fields
  ho_ten: 'Họ tên',
  so_dien_thoai: 'Số điện thoại',
  email: 'Email',
  vai_tro: 'Vai trò',
  trang_thai: 'Trạng thái',
};

/** Get Vietnamese label for an English field key */
export function getFieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
}

/** Department display labels */
export const DEPARTMENT_LABELS: Record<string, string> = {
  KD: 'Khối KD (Kinh doanh)',
  BO: 'Khối BO (Back Office)',
};
