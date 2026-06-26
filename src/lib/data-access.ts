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
import {
  getEmployeeRepository,
  getCustomerRepository,
  getPipelineRepository,
  getProjectRepository,
  getCrmTaskRepository,
  getContractRepository,
  getAttendanceOutsideRepository,
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

// CRM — misc
export const getTonCoc                 = GS.getTonCoc;
export const getTinhTrangGiaoDich      = GS.getTinhTrangGiaoDich;
export const getTongHopGiaoDich        = GS.getTongHopGiaoDich;

// Payroll (Phase 3 — chưa migrate)
export const getBangLuong              = GS.getBangLuong;
export const updateBangLuong           = GS.updateBangLuong;
export const deleteBangLuong           = GS.deleteBangLuong;
export const getPayrollRecords         = GS.getPayrollRecords;
export const getPayrollItems           = GS.getPayrollItems;

// Finance / misc
export const getTaiChinhHistory        = GS.getTaiChinhHistory;
export const saveTaiChinhHistory       = GS.saveTaiChinhHistory;
export const getDanhMuc                = GS.getDanhMuc;
export const getNhiemVu                = GS.getNhiemVu;
export const getDataNhanSuForReport    = GS.getDataNhanSuForReport;

// ── HRM ──────────────────────────────────────────────────────

export function getNhanVien(): Promise<NhanVien[]> {
  if (!isPostgresEnabled('hrm')) return GS.getNhanVien();
  return withPgFallback('hrm', 'getNhanVien',
    () => getEmployeeRepository().findAll(),
    () => GS.getNhanVien(),
  );
}

export function findNhanVienByEmail(email: string): Promise<NhanVien | null> {
  if (!isPostgresEnabled('hrm')) return GS.findNhanVienByEmail(email);
  return withPgFallback('hrm', 'findNhanVienByEmail',
    () => getEmployeeRepository().findByEmail(email),
    () => GS.findNhanVienByEmail(email),
  );
}

export function addNhanVien(data: NhanVien): Promise<void> {
  if (!isPostgresEnabled('hrm')) return GS.addNhanVien(data);
  return withPgFallback('hrm', 'addNhanVien',
    () => getEmployeeRepository().create(data),
    () => GS.addNhanVien(data),
  );
}

export function updateNhanVien(data: NhanVien): Promise<boolean> {
  if (!isPostgresEnabled('hrm')) return GS.updateNhanVien(data);
  return withPgFallback('hrm', 'updateNhanVien',
    () => getEmployeeRepository().update(data),
    () => GS.updateNhanVien(data),
  );
}

export function deleteNhanVien(id: string): Promise<boolean> {
  if (!isPostgresEnabled('hrm')) return GS.deleteNhanVien(id);
  return withPgFallback('hrm', 'deleteNhanVien',
    () => getEmployeeRepository().delete(id),
    () => GS.deleteNhanVien(id),
  );
}

// ── CRM: KhachHang ───────────────────────────────────────────

export function getKhachHang(): Promise<KhachHang[]> {
  if (!isPostgresEnabled('crm')) return GS.getKhachHang();
  return withPgFallback('crm', 'getKhachHang',
    () => getCustomerRepository().findAll(),
    () => GS.getKhachHang(),
  );
}

export function addKhachHang(data: KhachHang): Promise<void> {
  if (!isPostgresEnabled('crm')) return GS.addKhachHang(data);
  return withPgFallback('crm', 'addKhachHang',
    () => getCustomerRepository().create(data),
    () => GS.addKhachHang(data),
  );
}

export function addKhachHangBatch(data: KhachHang[]): Promise<void> {
  if (!isPostgresEnabled('crm')) return GS.addKhachHangBatch(data);
  return withPgFallback('crm', 'addKhachHangBatch',
    () => getCustomerRepository().createBatch(data),
    () => GS.addKhachHangBatch(data),
  );
}

export function updateKhachHang(data: KhachHang): Promise<boolean> {
  if (!isPostgresEnabled('crm')) return GS.updateKhachHang(data);
  return withPgFallback('crm', 'updateKhachHang',
    () => getCustomerRepository().update(data),
    () => GS.updateKhachHang(data),
  );
}

export function deleteKhachHang(id: string): Promise<boolean> {
  if (!isPostgresEnabled('crm')) return GS.deleteKhachHang(id);
  return withPgFallback('crm', 'deleteKhachHang',
    () => getCustomerRepository().delete(id),
    () => GS.deleteKhachHang(id),
  );
}

// ── CRM: Pipeline ─────────────────────────────────────────────

export function getPipeline(): Promise<Pipeline[]> {
  if (!isPostgresEnabled('crm')) return GS.getPipeline();
  return withPgFallback('crm', 'getPipeline',
    () => getPipelineRepository().findAll(),
    () => GS.getPipeline(),
  );
}

export function addPipeline(data: Pipeline): Promise<void> {
  if (!isPostgresEnabled('crm')) return GS.addPipeline(data);
  return withPgFallback('crm', 'addPipeline',
    () => getPipelineRepository().create(data),
    () => GS.addPipeline(data),
  );
}

export function updatePipeline(data: Pipeline): Promise<{ updated: boolean; oldGiaiDoan: string }> {
  if (!isPostgresEnabled('crm')) return GS.updatePipeline(data);
  return withPgFallback('crm', 'updatePipeline',
    () => getPipelineRepository().update(data),
    () => GS.updatePipeline(data),
  );
}

export function deletePipeline(id: string): Promise<boolean> {
  if (!isPostgresEnabled('crm')) return GS.deletePipeline(id);
  return withPgFallback('crm', 'deletePipeline',
    () => getPipelineRepository().delete(id),
    () => GS.deletePipeline(id),
  );
}

// ── CRM: CongViec ────────────────────────────────────────────

export function getCongViec(): Promise<CongViec[]> {
  if (!isPostgresEnabled('crm')) return GS.getCongViec();
  return withPgFallback('crm', 'getCongViec',
    () => getCrmTaskRepository().findAll(),
    () => GS.getCongViec(),
  );
}

export function addCongViec(data: CongViec): Promise<void> {
  if (!isPostgresEnabled('crm')) return GS.addCongViec(data);
  return withPgFallback('crm', 'addCongViec',
    () => getCrmTaskRepository().create(data),
    () => GS.addCongViec(data),
  );
}

export function updateCongViec(data: CongViec): Promise<boolean> {
  if (!isPostgresEnabled('crm')) return GS.updateCongViec(data);
  return withPgFallback('crm', 'updateCongViec',
    () => getCrmTaskRepository().update(data),
    () => GS.updateCongViec(data),
  );
}

export function deleteCongViec(id: string): Promise<boolean> {
  if (!isPostgresEnabled('crm')) return GS.deleteCongViec(id);
  return withPgFallback('crm', 'deleteCongViec',
    () => getCrmTaskRepository().delete(id),
    () => GS.deleteCongViec(id),
  );
}

// ── CRM: DuAn ────────────────────────────────────────────────

export function getDuAn(): Promise<DuAn[]> {
  if (!isPostgresEnabled('crm')) return GS.getDuAn();
  return withPgFallback('crm', 'getDuAn',
    () => getProjectRepository().findAll(),
    () => GS.getDuAn(),
  );
}

export function addDuAn(data: DuAn): Promise<void> {
  if (!isPostgresEnabled('crm')) return GS.addDuAn(data);
  return withPgFallback('crm', 'addDuAn',
    () => getProjectRepository().create(data),
    () => GS.addDuAn(data),
  );
}

export function updateDuAn(data: DuAn): Promise<boolean> {
  if (!isPostgresEnabled('crm')) return GS.updateDuAn(data);
  return withPgFallback('crm', 'updateDuAn',
    () => getProjectRepository().update(data),
    () => GS.updateDuAn(data),
  );
}

export function deleteDuAn(id: string): Promise<boolean> {
  if (!isPostgresEnabled('crm')) return GS.deleteDuAn(id);
  return withPgFallback('crm', 'deleteDuAn',
    () => getProjectRepository().delete(id),
    () => GS.deleteDuAn(id),
  );
}

// ── Contracts: HopDong ────────────────────────────────────────

export function getHopDong(): Promise<HopDong[]> {
  if (!isPostgresEnabled('contracts')) return GS.getHopDong();
  return withPgFallback('contracts', 'getHopDong',
    () => getContractRepository().findAll(),
    () => GS.getHopDong(),
  );
}

export function addHopDong(data: HopDong): Promise<void> {
  if (!isPostgresEnabled('contracts')) return GS.addHopDong(data);
  return withPgFallback('contracts', 'addHopDong',
    () => getContractRepository().create(data),
    () => GS.addHopDong(data),
  );
}

export function updateHopDong(data: HopDong): Promise<boolean> {
  if (!isPostgresEnabled('contracts')) return GS.updateHopDong(data);
  return withPgFallback('contracts', 'updateHopDong',
    () => getContractRepository().update(data),
    () => GS.updateHopDong(data),
  );
}

export function deleteHopDong(id: string): Promise<boolean> {
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
