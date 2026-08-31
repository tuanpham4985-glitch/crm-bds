// ============================================================
// CRM BĐS — TypeScript Types
// ============================================================

// === DANH MỤC ===
export interface DanhMuc {
  giai_doan_pipeline: string[];
  trang_thai_kh: string[];
  trang_thai_cong_viec: string[];
  nguon: string[];
  employee_types: string[];
  trang_thai_nhan_vien: string[];
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
  link_tai_lieu?: string;
  chu_dau_tu?: string;
  link_du_an?: string;
  stacking_config?: string; // JSON: [{name, url}]
  truong_nhom?: string;     // Trưởng nhóm / GDDA phụ trách dự án
  ds_sale?: string;         // JSON: string[] — danh sách tên sale trong team
}

// === NHÂN VIÊN ===
export interface NhanVien {
  id_nhan_vien: string;
  ho_ten: string;
  so_dien_thoai: string;
  email: string;
  vai_tro: string; // 'Sale' | 'Admin' (index 15)
  employee_type: string; // index 4 (Position)
  gioi_tinh?: string;
  khu_vuc?: string;
  phong_KD?: string;
  ql_truc_tiep?: string;    // Quản lý trực tiếp (ho_ten)
  so_cccd?: string;
  ngay_cap?: string;
  noi_cap?: string;
  HKTT?: string;
  ngay_sinh?: string;
  ma_so_thue?: string;
  so_nguoi_phu_thuoc?: number;
  trang_thai: string;
  ngay_tao: string;
  avatar_url?: string;
  mat_khau?: string;
  so_tk_ngan_hang?: string;
  ten_ngan_hang_thu_huong?: string;
}

// === HỢP ĐỒNG ===
export interface HopDong {
  id: string;
  id_nhan_vien: string;
  ten_nhan_vien?: string;
  so_hop_dong: string;
  phong_KD?: string;
  employee_type?: string; // index 13/4 (Position)

  // Core business fields (EN standard)
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
  du_an?: string;
  // Phân khách: theo dõi 3 lần chăm sóc
  sale_lan_1?: string;
  ghi_chu_lan_1?: string;
  sale_lan_2?: string;
  ghi_chu_lan_2?: string;
  sale_lan_3?: string;
  ghi_chu_lan_3?: string;
  // Vận hành Telesale / CSKH
  telesale_phu_trach?: string;
  sale_nhan_khach?: string;
  trang_thai_cham_soc?: TrangThaiChamSoc;
  muc_do_quan_tam?: MucDoQuanTam;
  ngay_lien_he_cuoi?: string;
  ngay_lien_he_tiep?: string;
  so_lan_lien_he?: number;
  /** JSON CrmChamSocEntry[] — lịch sử không giới hạn, append-only qua API chuyên dụng */
  lich_su_cham_soc?: string;
  trang_thai_ban_giao?: TrangThaiBanGiao;
  ban_giao_luc?: string;
  sale_xac_nhan_luc?: string;
  /** JSON CrmBanGiaoEntry[] — nhật ký bàn giao/nhận/từ chối */
  lich_su_ban_giao?: string;
  // Qualified Lead Funnel — authoritative fields, score is server-computed.
  san_pham_quan_tam?: string;
  ngan_sach_min?: number;
  ngan_sach_max?: number;
  muc_dich?: MucDichLead;
  thoi_gian_du_kien?: ThoiGianDuKien;
  phuong_an_tai_chinh?: string;
  khu_vuc_yeu_cau?: string;
  hanh_dong_tiep_theo?: string;
  qualification_status?: QualificationStatus;
  lead_quality_score?: number;
  lead_quality_rank?: LeadQualityRank;
  lead_score_breakdown?: string;
  lead_score_history?: string;
  ngay_quan_tam?: string;
  qualified_at?: string;
  hot_at?: string;
  row_version?: number;
  /** Chỉ set khi khách được TẠO MỚI bởi một Import Batch — không set khi được nhận diện là duplicate của khách đã có. */
  import_batch_id?: string;
}

// === IMPORT BATCH ===
export interface CrmImportBatch {
  id: string;
  filename: string;
  imported_by_id: string;
  imported_by_name: string;
  imported_at: string;
  total_rows: number;
  created_count: number;
  duplicate_count: number;
  invalid_count: number;
  status: string;
  /** CUSTOMER DATASET — null nếu batch chưa gán Dataset (legacy, hoặc PG CRM tắt lúc import). */
  dataset_id?: string | null;
  dataset?: { id: string; name: string } | null;
}

// === CUSTOMER DATASET ===
export interface CrmDataset {
  id: string;
  name: string;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
}

// Campaign Foundation (M1A) — Campaign là lớp trung gian giữa Customer và
// Telesale (không phải bản sao customer). Xem CampaignMembership trong schema
// cho field chăm sóc/qualification theo từng campaign (M1B sẽ dùng tới).
export interface Campaign {
  id: string;
  name: string;
  id_du_an?: string | null;
  ten_du_an?: string | null;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignSummary {
  total: number;
  unassigned: number;
  assigned: number;
  byTelesale: { telesale_id: string; telesale_name: string; count: number }[];
}

// CampaignMembership (M1B.1) — authoritative CSKH/qualification record for a
// customer within ONE Campaign. KHÔNG mirror ngược lại KhachHang — khách
// không có membership nào tiếp tục dùng field cùng tên trên KhachHang.
export interface CampaignMembership {
  id: string;
  customer_id: string;
  campaign_id: string;
  telesale_id?: string | null;
  telesale_name?: string | null;
  assignment_status: string;
  assigned_at?: string | null;
  assigned_by_id?: string | null;
  assigned_by_name?: string | null;

  trang_thai_cham_soc?: TrangThaiChamSoc | null;
  muc_do_quan_tam?: MucDoQuanTam | null;
  so_lan_lien_he: number;
  lich_su_cham_soc?: string | null;
  ngay_lien_he_cuoi?: string | null;
  ngay_lien_he_tiep?: string | null;
  qualification_status: QualificationStatus;
  lead_quality_score: number;
  lead_quality_rank: LeadQualityRank;
  lead_score_breakdown?: string | null;
  lead_score_history?: string | null;
  outcome?: string | null;
  handoff_id?: string | null;

  san_pham_quan_tam?: string | null;
  nhu_cau?: string | null;
  ngan_sach_min?: number | null;
  ngan_sach_max?: number | null;
  muc_dich?: MucDichLead | null;
  thoi_gian_du_kien?: ThoiGianDuKien | null;
  phuong_an_tai_chinh?: string | null;
  khu_vuc_yeu_cau?: string | null;
  hanh_dong_tiep_theo?: string | null;

  row_version: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignMembershipWithCustomer extends CampaignMembership {
  customer: { ten_KH: string; so_dien_thoai: string; email: string } | null;
  /** M1B.2 — read-only join của CrmHandoff khi membership.handoff_id đã set. */
  handoff?: { id: string; status: string; sale_name: string | null } | null;
}

export type MucDichLead = 'Để ở' | 'Đầu tư' | 'Cho thuê' | 'Khác';
export type ThoiGianDuKien = 'Trong 1 tháng' | '1-3 tháng' | '3-6 tháng' | '6-12 tháng' | 'Trên 12 tháng' | 'Chưa xác định';
export type QualificationStatus = 'RAW' | 'CONTACTED' | 'INTERESTED' | 'QUALIFIED' | 'HOT' | 'UNQUALIFIED';
export type LeadQualityRank = 'HOT' | 'QUALIFIED' | 'WARM' | 'UNQUALIFIED';

export interface LeadScoreBreakdownItem {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  reason: string;
}

export interface LeadScoreResult {
  score: number;
  rank: LeadQualityRank;
  qualificationStatus: QualificationStatus;
  breakdown: LeadScoreBreakdownItem[];
}

export interface LeadScoreHistoryEntry {
  idempotency_key?: string;
  at: string;
  actor_id: string;
  actor_name: string;
  old_score: number;
  new_score: number;
  old_rank: LeadQualityRank;
  new_rank: LeadQualityRank;
  breakdown: LeadScoreBreakdownItem[];
}

export interface QualifiedLeadFilters {
  project?: string;
  telesale?: string;
  sale?: string;
  source?: string;
  from?: string;
  to?: string;
  scoreMin?: number;
  scoreMax?: number;
  rank?: LeadQualityRank;
  interest?: MucDoQuanTam;
  budgetMin?: number;
  budgetMax?: number;
  purpose?: MucDichLead;
  timeframe?: ThoiGianDuKien;
  handoffStatus?: TrangThaiBanGiao;
  pipelineStatus?: string;
  search?: string;
}

export type TrangThaiChamSoc =
  | 'Chưa gọi'
  | 'Không nghe máy'
  | 'Gọi lại'
  | 'Đã liên hệ'
  | 'Quan tâm'
  | 'Không phù hợp'
  | 'Sai số';

export type MucDoQuanTam = 'Chưa xác định' | 'Thấp' | 'Trung bình' | 'Cao' | 'Rất cao';

export type TrangThaiBanGiao =
  | 'Chưa bàn giao'
  | 'Chờ xác nhận'
  | 'Đã nhận'
  | 'Từ chối'
  | 'Thiếu người nhận';

export interface CrmChamSocEntry {
  id: string;
  thoi_gian: string;
  nguoi_thuc_hien: string;
  id_nguoi_thuc_hien: string;
  ket_qua: TrangThaiChamSoc;
  muc_do_quan_tam: MucDoQuanTam;
  ghi_chu: string;
  ngay_lien_he_tiep?: string;
}

export interface CrmBanGiaoEntry {
  id: string;
  thoi_gian: string;
  hanh_dong: 'Bàn giao' | 'Xác nhận' | 'Từ chối';
  nguoi_thuc_hien: string;
  telesale: string;
  sale_nhan: string;
  ghi_chu?: string;
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
  ngay_coc?: string;
  thang: string;

  // Các trường bổ sung đồng bộ từ Victory
  ma_can?: string;
  loai_can?: string;
  gdda?: string;
  gdkd?: string;
  phong_kd?: string;
  ty_le_tra_sale?: number;
  ty_le_kh?: number;
  ty_le_gdda?: number;
  ty_le_gdkd?: number;
  ty_le_mkt?: number;
  phi_tra_sale?: number;
  phi_tra_kh?: number;
  phi_tra_gdda?: number;
  phi_tra_gdkd?: number;
  phi_tra_mkt?: number;
  phi_admin?: number;
  loi_nhuan?: number;
  thuong_nong?: number;
  tkkd?: string;
  phi_tkkd?: number;
  ho_ten_kh?: string;
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
  kh_chua_assign: number;
  // Comparison
  tong_deal_prev?: number;
  dang_xu_ly_prev?: number;
  da_ky_prev?: number;
  doanh_thu_prev?: number;
  hoa_hong_prev?: number;
}

export interface PipelineFunnelItem {
  giai_doan: string;
  count: number;
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

export interface SinhNhatNhanVien {
  id_nhan_vien: string;
  ho_ten: string;
  ngay_sinh: string;   // raw date string (DD/MM/YYYY)
  ngay: number;        // day of month
  thang: number;       // month (1-12)
  tuoi: number;        // age this year
  avatar_url?: string;
  employee_type?: string;
  phong_KD?: string;
  la_hom_nay: boolean; // true if birthday is today
}

export interface CrmModuleStat {
  label: string;
  count: number;
  color?: string;
}

export interface CrmTotals {
  kh_total: number;
  kh_moi_thang: number;
  kh_by_nguon: CrmModuleStat[];
  pipeline_total: number;
  pipeline_active: number;
  pipeline_by_stage: CrmModuleStat[];
  cv_total: number;
  cv_by_status: CrmModuleStat[];
}

// === TỔNG HỢP GIAO DỊCH (external sheet) ===
export interface TongHopCompareItem {
  loai: string;
  so_can: number;
  doanh_so: number;
}

export interface TongHopPhongKD {
  ten: string;
  so_can: number;
  doanh_so: number;
}

export interface TongHopDuAn {
  ten: string;
  so_can: number;
  doanh_so: number;
}

export interface TongHopStats {
  tong_doanh_so: number;
  tong_so_can: number;
  gia_tri_tb_can: number;
  loai_hinh: TongHopCompareItem[];   // Cao tầng vs Thấp tầng
  loai_nguon: TongHopCompareItem[];  // Nội bộ vs Đối tác
  top_phong_kd: TongHopPhongKD[];    // Top 5 phòng KD
  khu_vuc: TongHopCompareItem[];     // Hà Nội vs TP.HCM
  top_du_an: TongHopDuAn[];          // Top dự án theo doanh số
}

export interface NhanSuBienDongItem {
  thang: string;
  tong_chinh_thuc: number;
  bien_dong: number;
  nv_vao?: number;
}

export interface DashboardData {
  kpi: DashboardKPI;
  doanh_thu_theo_sale: DoanhThuTheoSale[];
  doanh_thu_theo_du_an: DoanhThuTheoDuAn[];
  doanh_thu_theo_thang: DoanhThuTheoThang[];
  nguon_khach_hang: NguonKhachHang[];
  sinh_nhat_thang_nay: SinhNhatNhanVien[];
  pipeline_funnel: PipelineFunnelItem[];
  crm_totals?: CrmTotals;
  tonghop?: TongHopStats;
  nhan_su_bien_dong?: NhanSuBienDongItem[];
  report_mode?: 'standard' | 'race' | 'default';
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
  employee_type?: string;
}

export interface LoginCredentials {
  email: string;
  mat_khau: string;
}

// === STACKING ===
export interface StackingConfig {
  id: string;
  ten_hien_thi: string;   // display name, e.g. "Masteri Park Place"
  sheet_id: string;        // Google Sheets file ID
  project_code?: string;   // optional filter prefix, e.g. "MPP" — empty = auto-detect all
  trang_thai: 'active' | 'inactive';
  ngay_tao: string;
  /** 'grid' (mặc định, chung cư — lưới tầng/tòa) | 'list' (biệt thự/liền kề —
   * bảng phẳng, cột động theo header row thật của Sheet, không có khái niệm tầng). */
  loai?: 'grid' | 'list';
  /** Tên tab chứa bảng hàng thật — bắt buộc khi loai === 'list' (1 file có thể
   * có nhiều tab khác không phải bảng hàng, VD "Giỏ Bank", "Danh sách cọc"). */
  sheet_tab?: string;
  /** Danh sách tên cột (đúng text header thật của Sheet) muốn hiển thị, ĐÚNG
   * thứ tự — chỉ áp dụng khi loai === 'list'. Rỗng/undefined = hiện TẤT CẢ cột
   * (backward compat cho config tạo trước khi có tính năng chọn cột). */
  visible_columns?: string[];
}

/** Chế độ 'list' (StackingConfig.loai === 'list') — 1 dòng = 1 căn, cột động
 * theo header row thật của Sheet (không ép về schema StackingUnit cố định). */
export interface StackingListRow {
  maCan: string;
  values: Record<string, string | number | null>;
  /** header cột -> URL, CHỈ khi cell đó thật sự có hyperlink trong Sheet gốc
   * (VD cột "LINK PTG" trỏ tới Phiếu tính giá trên Drive). */
  hyperlinks?: Record<string, string>;
  /** Màu nền dòng lấy TỪ CHÍNH Sheet gốc (đại diện qua cell "Mã căn"), dạng
   * "#rrggbb" — CHỈ để hiển thị lại đúng màu Sale đã đánh dấu thủ công trong
   * Sheet, KHÔNG phải authority trạng thái (trangThai bên dưới mới là authority
   * thật, lấy từ CRM Pipeline). undefined nếu ô không có màu nền/màu trắng mặc định. */
  rowColor?: string;
  trangThai: 'con_hang' | 'dang_xem' | 'da_ban';
}

export interface PhanKhachConfig {
  id: string;
  ten_hien_thi: string;  // display name for the source sheet
  sheet_id: string;       // Google Sheets file ID (extracted from URL)
  trang_thai: 'active' | 'inactive';
  ngay_tao: string;
}

export interface StackingSheetMeta {
  project: string;   // "MPP" | "MCC" | "MCCN"
  tower: string;     // "A1", "B2", ...
  sheetName: string; // "MPP A1"
}

export interface StackingUnit {
  maCan: string;
  tower: string;
  tang: string;         // floor code, e.g. "03", "03A"
  canSo: string;        // unit code, e.g. "15", "12A"
  loaiCan: string;      // "1BR", "1BR+", "2BR", "2BR+", "3BR", "Studio"
  dtTim: number;        // gross area m²
  dtThongThuy: number;  // net area m²
  huong: string;
  view: string;
  giaKS: number;        // GIÁ KHẢO SÁT CHƯA VAT & KPBT (VND)
  ttsTamTinh?: number;      // TTS Tạm tính (VND)
  ttChuanTamTinh?: number;  // TT CHUẨN Tạm tính (VND)
  vayNhTamTinh?: number;    // Vay NH Tạm tính (VND)
  linkPTG?: string;          // Link Phiếu tính giá
  trangThai: 'con_hang' | 'dang_xem' | 'da_ban';
  /** Màu nền từ Google Sheets:
   *  'xanh' = độc quyền của công ty  (green cell)
   *  'vang'  = căn của công ty khác — cần Admin kiểm tra  (yellow cell)
   *  null   = bình thường
   */
  mauO?: 'xanh' | 'vang' | null;
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
  so_ngay_cong_chuan: number;
  so_ngay_lam_viec_thuc_te: number;
  so_ngay_nghi_khong_luong: number;
  so_gio_ot: number;
  salary_by_day: number;
  ot_pay: number;
  bao_hiem: number; // bh_employee
  bh_company: number;
  thue: number;
  tong_luong: number;
  luong_dong_bh?: number;
  thu_nhap_chiu_thue?: number;
  tong_chi_phi?: number;
  gross?: number;
  isProbation?: boolean;
  isCollaborator?: boolean;
  isIntern?: boolean;
  so_nguoi_phu_thuoc?: number;
  trang_thai: 'draft' | 'pending_approval' | 'approved' | 'paid' | 'locked';
  created_at: string;
}

// Trạng thái bảng lương (5 bước)
export type PayrollStatus =
  | 'draft'              // Nháp
  | 'pending_approval'   // Chờ duyệt
  | 'approved'           // Đã duyệt
  | 'paid'               // Đã thanh toán
  | 'locked';            // Đã khóa (read-only)

// === LƯƠNG ĐỘNG (SALARY COMPONENTS) ===
export interface PayrollRecord {
  id: string;
  id_nhan_vien: string;
  thang: number;
  nam: number;
  gross: number;
  total_deduction: number;
  net: number;
  luong_dong_bh: number;       // Lương đóng BH (capped)
  thu_nhap_chiu_thue: number;  // Thu nhập chịu thuế TNCN
  tong_chi_phi: number;        // Tổng chi phí nhân sự (gross + BH CTY)
  trang_thai: PayrollStatus;
  locked_at?: string;          // ISO timestamp khi khóa
  created_at: string;
}

export interface PayrollItemRecord {
  id: string;
  payroll_id: string;
  loai_khoan: string;          // e.g. "Lương thực tế", "Hoa hồng BĐS", "Phụ cấp trách nhiệm"
  nhom: 'thu_nhap' | 'khau_tru' | 'chi_phi_cty';  // chi_phi_cty = BHXH/BHYT/BHTN công ty
  so_tien: number;
  ghi_chu: string;
  tinh_bhxh: boolean;  // Cộng vào lương đóng BHXH
  tinh_thue: boolean;  // Tính vào thu nhập chịu thuế TNCN
}

export interface PayrollAdjustment {
  id: string;
  id_nhan_vien: string;
  thang: number;
  nam: number;
  type: 'bonus' | 'fine' | 'work_adjustment' | 'other';
  amount: number;
  reason: string;
}

export interface SavePayrollResult {
  success: boolean;
  saved: number;
  skipped: number;
  errors: string[];
}

// === CHẤM CÔNG NGOÀI ===
export interface ChamCongNgoai {
  id: string;
  id_nhan_vien: string;
  ho_ten?: string;
  ngay: string;              // YYYY-MM-DD
  gio_bat_dau: string;       // HH:MM
  gio_ket_thuc: string;      // HH:MM
  du_an_khach_hang: string;
  dia_diem: string;
  ghi_chu?: string;
  hinh_anh?: string;         // base64 JPEG thumbnail
  vi_tri_gps?: string;       // "lat,lng (±Xm)"
  ql_truc_tiep?: string;     // Tên quản lý trực tiếp (lưu tại thời điểm tạo đơn)
  trang_thai: 'cho_duyet' | 'da_duyet' | 'tu_choi';
  nguoi_duyet?: string;
  ghi_chu_duyet?: string;
  created_at: string;
}

export interface SalaryImportRow {
  id_nhan_vien: string;
  ho_ten: string;
  thuc_linh: number;
  loai: 'KD' | 'BO';
  // I. Thông tin nhân sự
  chuc_vu?: string;
  phong_ban?: string;
  ct_tv?: string;           // Chính thức / Thử việc
  // II. Công tháng
  cong_thuc_te?: number;
  cong_tinh_luong?: number;
  cong_tv?: number;
  cong_ct?: number;
  luong_tv?: number;
  luong_ct?: number;
  // III. Thu nhập
  luong_vi_tri?: number;
  lcb_theo_ngay_cong?: number;
  // IV. KPI
  kpi_quy_mo?: number;              // KPI quy mô & duy trì hoạt động (GĐDA)
  kpi_hieu_qua_van_hanh?: number;   // KPI hiệu quả vận hành dự án (GĐDA)
  kpi_chat_luong_quan_ly?: number;  // KPI chất lượng quản lý vận hành (GĐDA)
  kpi_doanh_thu_gdkd?: number;      // KPI doanh thu (GĐKD/TPKD)
  kpi_doanh_thu_nvkd?: number;      // KPI doanh thu (NVKD)
  kpi_plus?: number;                // KPI Plus - hiệu quả làm việc (NVKD)
  dieu_chinh_ky_truoc?: number;
  tong_thu_nhap?: number;
  // V. Khấu trừ
  luong_dong_bhxh?: number;
  bhxh_nld?: number;                // BHXH NLĐ đóng (10.5%)
  giam_tru_ban_than?: number;
  so_nguoi_giam_tru?: number;
  so_tien_giam_tru?: number;
  thu_nhap_tinh_thue?: number;
  thue_tncn?: number;
  so_phut_di_muon?: number;
  tien_di_muon?: number;
  tru_khac?: number;
  tam_ung_luong?: number;
  tong_khau_tru?: number;
  // BO-specific fields
  luong_cong?: number;              // Lương Công (BO: AG=32)
  luong_ltg?: number;               // Lương LTG (BO: AH=33)
  tong_phu_cap_thuc_nhan?: number;  // Tổng phụ cấp thực nhận (BO: AT=45)
  phu_cap_tien_an_bo?: number;      // Phụ cấp tiền ăn miễn thuế (BO: AU=46)
  thuong_tkkd?: number;             // Thưởng TKKD theo giao dịch (BO: AX=49)
  thuong_thang_13?: number;         // Thưởng tháng 13 (BO: AY=50)
  tien_ung_phat?: number;           // Tiền đã ứng/phạt/thu tiền DL (BO: BI=60)
  tru_di_muon_bo?: number;          // Trừ đi muộn về sớm (BO: BJ=61)
}
