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

export interface ICustomerRepository {
  findAll(): Promise<KhachHang[]>;
  findById(id: string): Promise<KhachHang | null>;
  create(data: KhachHang): Promise<void>;
  createBatch(data: KhachHang[]): Promise<void>;
  update(data: KhachHang): Promise<boolean>;
  delete(id: string): Promise<boolean>;
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
  countPending(employeeId?: string): Promise<number>;
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
