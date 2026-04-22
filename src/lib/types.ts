// ============================================================
// CRM BĐS — TypeScript Types
// ============================================================

// === DANH MỤC ===
export interface DanhMuc {
  giai_doan_pipeline: string[];
  trang_thai_kh: string[];
  trang_thai_cong_viec: string[];
  nguon: string[];
  chuc_danh: string[];
  khu_vuc: string[];
  gioi_tinh: string[];
  phong_KD: string[];
}

// === DỰ ÁN ===
export interface DuAn {
  id_du_an: string;
  ma_du_an: string;
  ten_du_an: string;
  hien_thi: number; // 0 or 1
  hoa_hong_mac_dinh: number;
  label: string;
}

// === NHÂN VIÊN ===
export interface NhanVien {
  id_nhan_vien: string;
  ho_ten: string;
  so_dien_thoai: string;
  email: string;
  vai_tro: string; // 'Sale' | 'Admin' (index 15)
  chuc_danh: string; // index 4
  gioi_tinh?: string;
  khu_vuc?: string;
  phong_KD?: string;
  so_cccd?: string;
  ngay_cap?: string;
  noi_cap?: string;
  HKTT?: string;
  ngay_sinh?: string;
  ma_so_thue?: string;
  trang_thai: string;
  ngay_tao: string;
  avatar_url?: string;
  mat_khau?: string;
}

// === HỢP ĐỒNG ===
export interface HopDong {
  id: string;
  id_nhan_vien: string;
  so_hop_dong: string;
  phong_KD?: string;
  chuc_danh?: string;

  // Core business fields (EN standard)
  employee_type?: 'PROBATION' | 'OFFICIAL';
  department: 'KD' | 'BO';
  contract_type: string;

  // Template engine
  template_file: string;

  ngay_bat_dau: string;
  ngay_ket_thuc: string;

  luong_co_ban: number;

  ghi_chu: string;
  created_at: string;
}

// === KHÁCH HÀNG ===
export interface KhachHang {
  id_khach_hang: string;
  ngay_tao: string;
  ten_KH: string;
  so_dien_thoai: string;
  email: string;
  nguon: string;
  nhu_cau: string;
  ghi_chu: string;
  sale_phu_trach: string;
  label_khach: string;
}

// === PIPELINE ===
export interface Pipeline {
  id_pipeline: string;
  id_khach_hang: string;
  giai_doan: string;
  gia_tri_thuc_te: number;
  sale_phu_trach: string;
  id_du_an: string;
  ten_du_an: string;
  hoa_hong: number;
  tien_hoa_hong: number;
  ngay_cap_nhat: string;
  thang: string;
}

// === CÔNG VIỆC ===
export interface CongViec {
  id_cong_viec: string;
  ngay_tao: string;
  ghi_chu: string;
  id_pipeline: string;
  trang_thai: string;
  ngay_hen: string;
  sale_phu_trach: string;
  ket_qua: string;
}

// === LOG HỆ THỐNG ===
export interface LogHeThong {
  id_log: string;
  hanh_dong: string;
  doi_tuong: string;
  id_lien_quan: string;
  nguoi_thuc_hien: string;
  thoi_gian: string;
}

// === DASHBOARD ===
export interface DashboardKPI {
  tong_deal: number;
  dang_xu_ly: number;
  da_ky: number;
  doanh_thu: number;
  hoa_hong: number;
  // Comparison
  tong_deal_prev?: number;
  dang_xu_ly_prev?: number;
  da_ky_prev?: number;
  doanh_thu_prev?: number;
  hoa_hong_prev?: number;
}

export interface DoanhThuTheoSale {
  nhan_vien: string;
  doanh_thu: number;
  hoa_hong: number;
  so_deal: number;
  avatar_url?: string;
}

export interface DoanhThuTheoDuAn {
  du_an: string;
  doanh_thu: number;
  hoa_hong: number;
  so_deal: number;
}

export interface DoanhThuTheoThang {
  thang: string;
  doanh_thu: number;
  doanh_thu_prev?: number;
}

export interface NguonKhachHang {
  nguon: string;
  so_luong: number;
}

export interface DashboardData {
  kpi: DashboardKPI;
  doanh_thu_theo_sale: DoanhThuTheoSale[];
  doanh_thu_theo_du_an: DoanhThuTheoDuAn[];
  doanh_thu_theo_thang: DoanhThuTheoThang[];
  nguon_khach_hang: NguonKhachHang[];
}

// === FILTERS ===
export interface FilterParams {
  search?: string;
  nguon?: string;
  giai_doan?: string;
  trang_thai?: string;
  sale?: string;
  du_an?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  period?: 'week' | 'month' | 'quarter' | 'year';
  compare?: 'prev' | 'yoy'; // kỳ trước or cùng kỳ năm trước
}

// === AUTH ===
export interface User {
  id_nhan_vien: string;
  ho_ten: string;
  email: string;
  vai_tro: string;
}

export interface LoginCredentials {
  email: string;
  mat_khau: string;
}

// === API Response ===
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  total?: number;
  page?: number;
  limit?: number;
}

// === BẢNG LƯƠNG (Payroll) ===
export interface BangLuong {
  id: string;
  id_nhan_vien: string;
  thang: number;
  nam: number;
  luong_co_ban: number;
  doanh_thu: number;
  hoa_hong: number;
  thuong: number;
  phat: number;
  tong_luong: number;
  trang_thai: 'draft' | 'confirmed' | 'paid';
  created_at: string;
}
