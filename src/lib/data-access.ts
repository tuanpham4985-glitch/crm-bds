// ============================================================
// CRM BĐS — Data Access Facade
//
// Import point duy nhất cho mọi API route.
// Routes to PostgreSQL khi module flag được bật,
// fallback về Google Sheets khi flag tắt.
//
// API routes: thay '@/lib/google-sheets' → '@/lib/data-access'
// ============================================================

import * as GS from './google-sheets';
import { isPostgresEnabled } from './db/feature-flags';
import { cached, invalidate } from './mem-cache';
import {
  getEmployeeRepository,
  getCustomerRepository,
  getPipelineRepository,
  getProjectRepository,
  getCrmTaskRepository,
  getContractRepository,
  getAttendanceOutsideRepository,
  getPayrollRepository,
} from './repository';
import type {
  NhanVien, KhachHang, Pipeline, DuAn,
  CongViec, HopDong, ChamCongNgoai,
} from './types';

// ── Re-export all types from google-sheets ────────────────────
export type * from './google-sheets';

// ── Auto-fallback helper ──────────────────────────────────────
// Nếu PG throw → log lỗi → tự về GS, user không bị ảnh hưởng.
// Vercel logs sẽ hiện [PG:module:fn] để alert.
async function withPgFallback<T>(
  module: string,
  fn: string,
  pgCall: () => Promise<T>,
  gsCall: () => Promise<T>,
): Promise<T> {
  try {
    return await pgCall();
  } catch (e) {
    console.error(
      `[PG:${module}:${fn}] error, falling back to GS:`,
      e instanceof Error ? e.message : e,
    );
    return gsCall();
  }
}

// ── Pass-through: functions không có trong repository layer ──
// Luôn dùng Google Sheets, không phụ thuộc feature flag

// HRM — complex/special ops
export const syncManagerFromHrFile    = GS.syncManagerFromHrFile;
export const syncEmployeesFromHrFile  = GS.syncEmployeesFromHrFile;
export const backfillNhanVienIds      = GS.backfillNhanVienIds;
export const getManagerForEmployee    = GS.getManagerForEmployee;

// CRM — stacking (chưa có PG model)
export const getStackingSheetList      = GS.getStackingSheetList;
export const getStackingUnits          = GS.getStackingUnits;
export const probeStackingSheet        = GS.probeStackingSheet;
export const getStackingConfigs        = GS.getStackingConfigs;
export const addStackingConfig         = GS.addStackingConfig;
export const updateStackingConfig      = GS.updateStackingConfig;
export const deleteStackingConfig      = GS.deleteStackingConfig;

// CRM — phan-khach (chưa có PG model)
export const probePhanKhachSheet       = GS.probePhanKhachSheet;
export const getPhanKhachConfigs       = GS.getPhanKhachConfigs;
export const importFromPhanKhachConfig = GS.importFromPhanKhachConfig;
export const addPhanKhachConfig        = GS.addPhanKhachConfig;
export const deletePhanKhachConfig     = GS.deletePhanKhachConfig;

// CRM — misc (GS pass-through, cached to reduce API round-trips)
export function getTonCoc() {
  return cached('gs:ton_coc', 2 * 60_000, () => GS.getTonCoc());
}
export function getTinhTrangGiaoDich() {
  return cached('gs:tinh_trang', 2 * 60_000, () => GS.getTinhTrangGiaoDich());
}
export function getTongHopGiaoDich(
  from?: Date,
  to?: Date,
  source: 'signed' | 'deposit' = 'signed',
) {
  const key = `gs:tonghop:${from?.toISOString().slice(0, 10) ?? ''}:${to?.toISOString().slice(0, 10) ?? ''}:${source}`;
  return cached(key, 5 * 60_000, () => GS.getTongHopGiaoDich(from, to, source));
}

// Finance / misc (GS pass-through, cached)
export function getTaiChinhHistory() {
  return cached('gs:tai_chinh', 2 * 60_000, () => GS.getTaiChinhHistory());
}
export function saveTaiChinhHistory(
  ...args: Parameters<typeof GS.saveTaiChinhHistory>
): ReturnType<typeof GS.saveTaiChinhHistory> {
  invalidate('gs:tai_chinh');
  return GS.saveTaiChinhHistory(...args);
}
export function getDanhMuc() {
  return cached('gs:danh_muc', 10 * 60_000, () => GS.getDanhMuc());
}
export function getNhiemVu() {
  return cached('gs:nhiem_vu', 10 * 60_000, () => GS.getNhiemVu());
}
export function getDataNhanSuForReport() {
  return cached('gs:nhan_su', 5 * 60_000, () => GS.getDataNhanSuForReport());
}

// ── HRM ──────────────────────────────────────────────────────

export function getNhanVien(): Promise<NhanVien[]> {
  if (!isPostgresEnabled('hrm')) return cached('gs:nv', 60_000, () => GS.getNhanVien());
  return cached('pg:nv', 60_000, () => withPgFallback('hrm', 'getNhanVien',
    () => getEmployeeRepository().findAll(),
    () => GS.getNhanVien(),
  ));
}

export function findNhanVienByEmail(email: string): Promise<NhanVien | null> {
  if (!isPostgresEnabled('hrm')) return GS.findNhanVienByEmail(email);
  return withPgFallback('hrm', 'findNhanVienByEmail',
    () => getEmployeeRepository().findByEmail(email),
    () => GS.findNhanVienByEmail(email),
  );
}

export function addNhanVien(data: NhanVien): Promise<void> {
  invalidate('pg:nv'); invalidate('gs:nv');
  if (!isPostgresEnabled('hrm')) return GS.addNhanVien(data);
  return withPgFallback('hrm', 'addNhanVien',
    () => getEmployeeRepository().create(data),
    () => GS.addNhanVien(data),
  );
}

export function updateNhanVien(data: NhanVien): Promise<boolean> {
  invalidate('pg:nv'); invalidate('gs:nv');
  if (!isPostgresEnabled('hrm')) return GS.updateNhanVien(data);
  return withPgFallback('hrm', 'updateNhanVien',
    () => getEmployeeRepository().update(data),
    () => GS.updateNhanVien(data),
  );
}

export function deleteNhanVien(id: string): Promise<boolean> {
  invalidate('pg:nv'); invalidate('gs:nv');
  if (!isPostgresEnabled('hrm')) return GS.deleteNhanVien(id);
  return withPgFallback('hrm', 'deleteNhanVien',
    () => getEmployeeRepository().delete(id),
    () => GS.deleteNhanVien(id),
  );
}

// ── CRM: KhachHang ───────────────────────────────────────────

export function getKhachHang(): Promise<KhachHang[]> {
  if (!isPostgresEnabled('crm')) return cached('gs:kh', 30_000, () => GS.getKhachHang());
  return cached('pg:kh', 30_000, () => withPgFallback('crm', 'getKhachHang',
    () => getCustomerRepository().findAll(),
    () => GS.getKhachHang(),
  ));
}

export function addKhachHang(data: KhachHang): Promise<void> {
  invalidate('pg:kh'); invalidate('gs:kh');
  if (!isPostgresEnabled('crm')) return GS.addKhachHang(data);
  return withPgFallback('crm', 'addKhachHang',
    () => getCustomerRepository().create(data),
    () => GS.addKhachHang(data),
  );
}

export function addKhachHangBatch(data: KhachHang[]): Promise<void> {
  invalidate('pg:kh'); invalidate('gs:kh');
  if (!isPostgresEnabled('crm')) return GS.addKhachHangBatch(data);
  return withPgFallback('crm', 'addKhachHangBatch',
    () => getCustomerRepository().createBatch(data),
    () => GS.addKhachHangBatch(data),
  );
}

export function updateKhachHang(data: KhachHang): Promise<boolean> {
  invalidate('pg:kh'); invalidate('gs:kh');
  if (!isPostgresEnabled('crm')) return GS.updateKhachHang(data);
  return withPgFallback('crm', 'updateKhachHang',
    () => getCustomerRepository().update(data),
    () => GS.updateKhachHang(data),
  );
}

export function deleteKhachHang(id: string): Promise<boolean> {
  invalidate('pg:kh'); invalidate('gs:kh');
  if (!isPostgresEnabled('crm')) return GS.deleteKhachHang(id);
  return withPgFallback('crm', 'deleteKhachHang',
    () => getCustomerRepository().delete(id),
    () => GS.deleteKhachHang(id),
  );
}

// ── CRM: Pipeline ─────────────────────────────────────────────

export function getPipeline(): Promise<Pipeline[]> {
  if (!isPostgresEnabled('crm')) return cached('gs:pl', 30_000, () => GS.getPipeline());
  return cached('pg:pl', 30_000, () => withPgFallback('crm', 'getPipeline',
    () => getPipelineRepository().findAll(),
    () => GS.getPipeline(),
  ));
}

export function addPipeline(data: Pipeline): Promise<void> {
  invalidate('pg:pl'); invalidate('gs:pl');
  if (!isPostgresEnabled('crm')) return GS.addPipeline(data);
  return withPgFallback('crm', 'addPipeline',
    () => getPipelineRepository().create(data),
    () => GS.addPipeline(data),
  );
}

export function updatePipeline(data: Pipeline): Promise<{ updated: boolean; oldGiaiDoan: string }> {
  invalidate('pg:pl'); invalidate('gs:pl');
  if (!isPostgresEnabled('crm')) return GS.updatePipeline(data);
  return withPgFallback('crm', 'updatePipeline',
    () => getPipelineRepository().update(data),
    () => GS.updatePipeline(data),
  );
}

export function deletePipeline(id: string): Promise<boolean> {
  invalidate('pg:pl'); invalidate('gs:pl');
  if (!isPostgresEnabled('crm')) return GS.deletePipeline(id);
  return withPgFallback('crm', 'deletePipeline',
    () => getPipelineRepository().delete(id),
    () => GS.deletePipeline(id),
  );
}

// ── CRM: CongViec ────────────────────────────────────────────

export function getCongViec(): Promise<CongViec[]> {
  if (!isPostgresEnabled('crm')) return cached('gs:cv', 30_000, () => GS.getCongViec());
  return cached('pg:cv', 30_000, () => withPgFallback('crm', 'getCongViec',
    () => getCrmTaskRepository().findAll(),
    () => GS.getCongViec(),
  ));
}

export function addCongViec(data: CongViec): Promise<void> {
  invalidate('pg:cv'); invalidate('gs:cv');
  if (!isPostgresEnabled('crm')) return GS.addCongViec(data);
  return withPgFallback('crm', 'addCongViec',
    () => getCrmTaskRepository().create(data),
    () => GS.addCongViec(data),
  );
}

export function updateCongViec(data: CongViec): Promise<boolean> {
  invalidate('pg:cv'); invalidate('gs:cv');
  if (!isPostgresEnabled('crm')) return GS.updateCongViec(data);
  return withPgFallback('crm', 'updateCongViec',
    () => getCrmTaskRepository().update(data),
    () => GS.updateCongViec(data),
  );
}

export function deleteCongViec(id: string): Promise<boolean> {
  invalidate('pg:cv'); invalidate('gs:cv');
  if (!isPostgresEnabled('crm')) return GS.deleteCongViec(id);
  return withPgFallback('crm', 'deleteCongViec',
    () => getCrmTaskRepository().delete(id),
    () => GS.deleteCongViec(id),
  );
}

// ── CRM: DuAn ────────────────────────────────────────────────

export function getDuAn(): Promise<DuAn[]> {
  if (!isPostgresEnabled('crm')) return cached('gs:da', 120_000, () => GS.getDuAn());
  return cached('pg:da', 120_000, () => withPgFallback('crm', 'getDuAn',
    () => getProjectRepository().findAll(),
    () => GS.getDuAn(),
  ));
}

export function addDuAn(data: DuAn): Promise<void> {
  invalidate('pg:da'); invalidate('gs:da');
  if (!isPostgresEnabled('crm')) return GS.addDuAn(data);
  return withPgFallback('crm', 'addDuAn',
    () => getProjectRepository().create(data),
    () => GS.addDuAn(data),
  );
}

export function updateDuAn(data: DuAn): Promise<boolean> {
  invalidate('pg:da'); invalidate('gs:da');
  if (!isPostgresEnabled('crm')) return GS.updateDuAn(data);
  return withPgFallback('crm', 'updateDuAn',
    () => getProjectRepository().update(data),
    () => GS.updateDuAn(data),
  );
}

export function deleteDuAn(id: string): Promise<boolean> {
  invalidate('pg:da'); invalidate('gs:da');
  if (!isPostgresEnabled('crm')) return GS.deleteDuAn(id);
  return withPgFallback('crm', 'deleteDuAn',
    () => getProjectRepository().delete(id),
    () => GS.deleteDuAn(id),
  );
}

// ── Contracts: HopDong ────────────────────────────────────────

export function getHopDong(): Promise<HopDong[]> {
  if (!isPostgresEnabled('contracts')) return cached('gs:hd', 60_000, () => GS.getHopDong());
  return cached('pg:hd', 60_000, () => withPgFallback('contracts', 'getHopDong',
    () => getContractRepository().findAll(),
    () => GS.getHopDong(),
  ));
}

export function addHopDong(data: HopDong): Promise<void> {
  invalidate('pg:hd'); invalidate('gs:hd');
  if (!isPostgresEnabled('contracts')) return GS.addHopDong(data);
  return withPgFallback('contracts', 'addHopDong',
    () => getContractRepository().create(data),
    () => GS.addHopDong(data),
  );
}

export function updateHopDong(data: HopDong): Promise<boolean> {
  invalidate('pg:hd'); invalidate('gs:hd');
  if (!isPostgresEnabled('contracts')) return GS.updateHopDong(data);
  return withPgFallback('contracts', 'updateHopDong',
    () => getContractRepository().update(data),
    () => GS.updateHopDong(data),
  );
}

export function deleteHopDong(id: string): Promise<boolean> {
  invalidate('pg:hd'); invalidate('gs:hd');
  if (!isPostgresEnabled('contracts')) return GS.deleteHopDong(id);
  return withPgFallback('contracts', 'deleteHopDong',
    () => getContractRepository().delete(id),
    () => GS.deleteHopDong(id),
  );
}

// ── Attendance: ChamCongNgoai ─────────────────────────────────

export function getChamCongNgoai(
  idNhanVien?: string,
  qlTrucTiep?: string,
): Promise<ChamCongNgoai[]> {
  if (!isPostgresEnabled('attendance')) return GS.getChamCongNgoai(idNhanVien, qlTrucTiep);
  return withPgFallback('attendance', 'getChamCongNgoai',
    () => getAttendanceOutsideRepository().findAll(idNhanVien, qlTrucTiep),
    () => GS.getChamCongNgoai(idNhanVien, qlTrucTiep),
  );
}

export function addChamCongNgoai(
  data: Omit<ChamCongNgoai, 'id' | 'created_at' | 'trang_thai' | 'nguoi_duyet' | 'ghi_chu_duyet'>,
): Promise<ChamCongNgoai> {
  if (!isPostgresEnabled('attendance')) return GS.addChamCongNgoai(data);
  return withPgFallback('attendance', 'addChamCongNgoai',
    () => getAttendanceOutsideRepository().create(data),
    () => GS.addChamCongNgoai(data),
  );
}

export function updateChamCongNgoaiStatus(
  id: string,
  status: 'da_duyet' | 'tu_choi',
  approver: string,
  note?: string,
  requiredQL?: string,
): Promise<boolean | 'forbidden'> {
  if (!isPostgresEnabled('attendance'))
    return GS.updateChamCongNgoaiStatus(id, status, approver, note, requiredQL);
  return withPgFallback('attendance', 'updateChamCongNgoaiStatus',
    () => getAttendanceOutsideRepository().updateStatus(id, status, approver, note, requiredQL),
    () => GS.updateChamCongNgoaiStatus(id, status, approver, note, requiredQL),
  );
}

export function deleteChamCongNgoai(id: string, employeeId: string): Promise<boolean> {
  if (!isPostgresEnabled('attendance')) return GS.deleteChamCongNgoai(id, employeeId);
  return withPgFallback('attendance', 'deleteChamCongNgoai',
    () => getAttendanceOutsideRepository().delete(id, employeeId),
    () => GS.deleteChamCongNgoai(id, employeeId),
  );
}

// ── Payroll ───────────────────────────────────────────────────

export function getBangLuong(): Promise<import('./types').BangLuong[]> {
  if (!isPostgresEnabled('payroll')) return GS.getBangLuong();
  return withPgFallback('payroll', 'getBangLuong',
    () => getPayrollRepository().getBangLuong(),
    () => GS.getBangLuong(),
  );
}

export function addBangLuong(
  bl: Omit<import('./types').BangLuong, 'id' | 'created_at'>,
): Promise<string> {
  if (!isPostgresEnabled('payroll')) return GS.addBangLuong(bl);
  return withPgFallback('payroll', 'addBangLuong',
    () => getPayrollRepository().addBangLuong(bl),
    () => GS.addBangLuong(bl),
  );
}

export function updateBangLuong(
  id: string,
  updates: import('./repository/interfaces').BangLuongUpdateFields,
): Promise<boolean> {
  if (!isPostgresEnabled('payroll')) return GS.updateBangLuong(id, updates);
  return withPgFallback('payroll', 'updateBangLuong',
    () => getPayrollRepository().updateBangLuong(id, updates),
    () => GS.updateBangLuong(id, updates),
  );
}

export function deleteBangLuong(id: string): Promise<boolean> {
  if (!isPostgresEnabled('payroll')) return GS.deleteBangLuong(id);
  return withPgFallback('payroll', 'deleteBangLuong',
    () => getPayrollRepository().deleteBangLuong(id),
    () => GS.deleteBangLuong(id),
  );
}

export function getPayrollRecords(
  thang: number,
  nam: number,
): Promise<import('./types').PayrollRecord[]> {
  if (!isPostgresEnabled('payroll')) return GS.getPayrollRecords(thang, nam);
  return withPgFallback('payroll', 'getPayrollRecords',
    () => getPayrollRepository().getPayrollRecords(thang, nam),
    () => GS.getPayrollRecords(thang, nam),
  );
}

export function getPayrollItems(
  payrollIds: string[],
): Promise<import('./types').PayrollItemRecord[]> {
  if (!isPostgresEnabled('payroll')) return GS.getPayrollItems(payrollIds);
  return withPgFallback('payroll', 'getPayrollItems',
    () => getPayrollRepository().getPayrollItems(payrollIds),
    () => GS.getPayrollItems(payrollIds),
  );
}

export function getPayrollAdjustments(
  thang: number,
  nam: number,
): Promise<import('./types').PayrollAdjustment[]> {
  if (!isPostgresEnabled('payroll')) return GS.getPayrollAdjustments(thang, nam);
  return withPgFallback('payroll', 'getPayrollAdjustments',
    () => getPayrollRepository().getPayrollAdjustments(thang, nam),
    () => GS.getPayrollAdjustments(thang, nam),
  );
}

export function savePayrollBatch(
  entries: import('./repository/interfaces').PayrollBatchEntry[],
): Promise<{ savedIds: string[]; errors: string[] }> {
  if (!isPostgresEnabled('payroll')) return GS.savePayrollBatch(entries);
  return withPgFallback('payroll', 'savePayrollBatch',
    () => getPayrollRepository().saveBatch(entries),
    () => GS.savePayrollBatch(entries),
  );
}
