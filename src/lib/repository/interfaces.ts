// ============================================================
// CRM BĐS — Repository Interfaces (CRM modules)
//
// Signatures mirror the existing google-sheets.ts functions
// so GS adapters are thin wrappers with zero transformation.
// PG adapters implement the same contract using Prisma.
// ============================================================

import type {
  NhanVien, KhachHang, Pipeline, DuAn,
  CongViec, HopDong, ChamCongNgoai,
  BangLuong, PayrollRecord, PayrollItemRecord, PayrollAdjustment,
} from '../types';

// ─── EMPLOYEE (HRM) ──────────────────────────────────────────

export interface IEmployeeRepository {
  findAll(): Promise<NhanVien[]>;
  findById(id: string): Promise<NhanVien | null>;
  findByEmail(email: string): Promise<NhanVien | null>;
  create(data: NhanVien): Promise<void>;
  update(data: NhanVien): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// ─── CUSTOMER (CRM) ──────────────────────────────────────────

// Narrow field projections — NEON_TRANSFER_AUDIT P0: crm-access và dashboard
// trước đây gọi findAll() (mọi cột, gồm nhiều cột lịch sử/JSON không giới
// hạn độ dài) chỉ để đọc 3-5 field scalar nhỏ. 2 kiểu dưới đây giới hạn
// đúng field từng consumer thực sự dùng (trace trực tiếp từ source, xem
// crm-access/route.ts và dashboard/route.ts) — KHÔNG đổi field shape/kiểu
// so với KhachHang gốc (dùng Pick<> để tự động khớp).
export type CustomerAssignmentFields = Pick<KhachHang,
  'telesale_phu_trach' | 'sale_nhan_khach' | 'sale_phu_trach' | 'du_an' | 'trang_thai_ban_giao'>;

export type CustomerDashboardFields = Pick<KhachHang, 'nguon' | 'sale_phu_trach' | 'ngay_tao'>;

// IMPORT_DUPLICATE_CHECK_P0 — Import Excel duplicate-check (import-excel/
// route.ts) chỉ đọc so_dien_thoai (phoneKey dedup) + id_khach_hang (map
// phoneKey -> customer id cho nhánh "already_exists" ghi Dataset membership)
// từ TOÀN BỘ customer hiện có — trace trực tiếp từ source (đã audit: 2 field
// này là DUY NHẤT được đọc từ biến `existing`, không field nào khác).
export type CustomerDedupFields = Pick<KhachHang, 'id_khach_hang' | 'so_dien_thoai'>;

export interface ICustomerRepository {
  findAll(): Promise<KhachHang[]>;
  findById(id: string): Promise<KhachHang | null>;
  create(data: KhachHang): Promise<void>;
  createBatch(data: KhachHang[]): Promise<void>;
  update(data: KhachHang): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  countByHandoffStatus(status: string): Promise<number>;
  findAssignmentFields(): Promise<CustomerAssignmentFields[]>;
  findDashboardFields(): Promise<CustomerDashboardFields[]>;
  findDedupFields(): Promise<CustomerDedupFields[]>;
}

// ─── PIPELINE (CRM) ──────────────────────────────────────────

export interface IPipelineRepository {
  findAll(): Promise<Pipeline[]>;
  findById(id: string): Promise<Pipeline | null>;
  create(data: Pipeline): Promise<void>;
  update(data: Pipeline): Promise<{ updated: boolean; oldGiaiDoan: string }>;
  delete(id: string): Promise<boolean>;
}

// ─── PROJECT / DỰ ÁN ─────────────────────────────────────────

export interface IProjectRepository {
  findAll(): Promise<DuAn[]>;
  findById(id: string): Promise<DuAn | null>;
  create(data: DuAn): Promise<void>;
  update(data: DuAn): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// ─── CRM TASK / CÔNG VIỆC (not TM) ───────────────────────────

export interface ICrmTaskRepository {
  findAll(): Promise<CongViec[]>;
  findById(id: string): Promise<CongViec | null>;
  create(data: CongViec): Promise<void>;
  update(data: CongViec): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// ─── CONTRACT / HỢP ĐỒNG ─────────────────────────────────────

export interface IContractRepository {
  findAll(): Promise<HopDong[]>;
  findById(id: string): Promise<HopDong | null>;
  findByEmployee(employeeId: string): Promise<HopDong[]>;
  create(data: HopDong): Promise<void>;
  update(data: HopDong): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// ─── ATTENDANCE OUTSIDE / CHẤM CÔNG NGOÀI ────────────────────
// Matches getChamCongNgoai(idNhanVien?, qlTrucTiep?) signature

export interface IAttendanceOutsideRepository {
  findAll(employeeId?: string, qlTrucTiep?: string): Promise<ChamCongNgoai[]>;
  findById(id: string): Promise<ChamCongNgoai | null>;
  // qlTrucTiep + excludeEmployeeId: hỗ trợ đúng use-case "Quản lý xem đơn
  // nhóm mình chờ duyệt, KHÔNG tính đơn của chính mình" của
  // /api/cham-cong-ngoai/pending-count (NEON_TRANSFER_AUDIT P0) mà không
  // cần load full rows (kể cả field ảnh hinh_anh) chỉ để .filter().length.
  countPending(employeeId?: string, qlTrucTiep?: string, excludeEmployeeId?: string): Promise<number>;
  create(
    data: Omit<ChamCongNgoai, 'id' | 'created_at' | 'trang_thai' | 'nguoi_duyet' | 'ghi_chu_duyet'>
  ): Promise<ChamCongNgoai>;
  // Only 'da_duyet' | 'tu_choi' — business rule: can't re-set to 'cho_duyet'
  updateStatus(
    id: string,
    status: 'da_duyet' | 'tu_choi',
    approver: string,
    note?: string,
    requiredQL?: string
  ): Promise<boolean | 'forbidden'>;
  delete(id: string, employeeId: string): Promise<boolean>;
  // Admin/HR delete: bỏ ràng buộc chủ đơn + trạng thái (dùng dọn đơn test)
  deleteAny(id: string): Promise<boolean>;
}

// ─── PAYROLL ─────────────────────────────────────────────────
// saveBatch matches savePayrollBatch(entries) in google-sheets.ts

export type PayrollBatchEntry = {
  payroll: Omit<PayrollRecord, 'id' | 'created_at'>;
  items: Omit<PayrollItemRecord, 'id' | 'payroll_id'>[];
};

export type BangLuongUpdateFields = Partial<
  Pick<BangLuong, 'trang_thai' | 'thuong' | 'phat' | 'tong_luong' | 'so_ngay_nghi_khong_luong' | 'so_gio_ot'>
> & { locked_at?: string };

export interface IPayrollRepository {
  getBangLuong(): Promise<BangLuong[]>;
  addBangLuong(bl: Omit<BangLuong, 'id' | 'created_at'>): Promise<string>;
  getPayrollRecords(thang: number, nam: number): Promise<PayrollRecord[]>;
  getPayrollItems(payrollIds: string[]): Promise<PayrollItemRecord[]>;
  getPayrollAdjustments(thang: number, nam: number): Promise<PayrollAdjustment[]>;
  saveBatch(entries: PayrollBatchEntry[]): Promise<{ savedIds: string[]; errors: string[] }>;
  updateBangLuong(id: string, updates: BangLuongUpdateFields): Promise<boolean>;
  deleteBangLuong(id: string): Promise<boolean>;
}

// ─── UNIT OF WORK — tập hợp tất cả CRM repositories ─────────

export interface ICrmRepositories {
  employees:          IEmployeeRepository;
  customers:          ICustomerRepository;
  pipelines:          IPipelineRepository;
  projects:           IProjectRepository;
  crmTasks:           ICrmTaskRepository;
  contracts:          IContractRepository;
  attendanceOutside:  IAttendanceOutsideRepository;
  payroll:            IPayrollRepository;
}
