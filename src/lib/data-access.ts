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
  if (isPostgresEnabled('hrm')) return getEmployeeRepository().findAll();
  return GS.getNhanVien();
}

export function findNhanVienByEmail(email: string): Promise<NhanVien | null> {
  if (isPostgresEnabled('hrm')) return getEmployeeRepository().findByEmail(email);
  return GS.findNhanVienByEmail(email);
}

export function addNhanVien(data: NhanVien): Promise<void> {
  if (isPostgresEnabled('hrm')) return getEmployeeRepository().create(data);
  return GS.addNhanVien(data);
}

export function updateNhanVien(data: NhanVien): Promise<boolean> {
  if (isPostgresEnabled('hrm')) return getEmployeeRepository().update(data);
  return GS.updateNhanVien(data);
}

export function deleteNhanVien(id: string): Promise<boolean> {
  if (isPostgresEnabled('hrm')) return getEmployeeRepository().delete(id);
  return GS.deleteNhanVien(id);
}

// ── CRM: KhachHang ───────────────────────────────────────────

export function getKhachHang(): Promise<KhachHang[]> {
  if (isPostgresEnabled('crm')) return getCustomerRepository().findAll();
  return GS.getKhachHang();
}

export function addKhachHang(data: KhachHang): Promise<void> {
  if (isPostgresEnabled('crm')) return getCustomerRepository().create(data);
  return GS.addKhachHang(data);
}

export function addKhachHangBatch(data: KhachHang[]): Promise<void> {
  if (isPostgresEnabled('crm')) return getCustomerRepository().createBatch(data);
  return GS.addKhachHangBatch(data);
}

export function updateKhachHang(data: KhachHang): Promise<boolean> {
  if (isPostgresEnabled('crm')) return getCustomerRepository().update(data);
  return GS.updateKhachHang(data);
}

export function deleteKhachHang(id: string): Promise<boolean> {
  if (isPostgresEnabled('crm')) return getCustomerRepository().delete(id);
  return GS.deleteKhachHang(id);
}

// ── CRM: Pipeline ─────────────────────────────────────────────

export function getPipeline(): Promise<Pipeline[]> {
  if (isPostgresEnabled('crm')) return getPipelineRepository().findAll();
  return GS.getPipeline();
}

export function addPipeline(data: Pipeline): Promise<void> {
  if (isPostgresEnabled('crm')) return getPipelineRepository().create(data);
  return GS.addPipeline(data);
}

export function updatePipeline(data: Pipeline): Promise<{ updated: boolean; oldGiaiDoan: string }> {
  if (isPostgresEnabled('crm')) return getPipelineRepository().update(data);
  return GS.updatePipeline(data);
}

export function deletePipeline(id: string): Promise<boolean> {
  if (isPostgresEnabled('crm')) return getPipelineRepository().delete(id);
  return GS.deletePipeline(id);
}

// ── CRM: CongViec (activity) ─────────────────────────────────

export function getCongViec(): Promise<CongViec[]> {
  if (isPostgresEnabled('crm')) return getCrmTaskRepository().findAll();
  return GS.getCongViec();
}

export function addCongViec(data: CongViec): Promise<void> {
  if (isPostgresEnabled('crm')) return getCrmTaskRepository().create(data);
  return GS.addCongViec(data);
}

export function updateCongViec(data: CongViec): Promise<boolean> {
  if (isPostgresEnabled('crm')) return getCrmTaskRepository().update(data);
  return GS.updateCongViec(data);
}

export function deleteCongViec(id: string): Promise<boolean> {
  if (isPostgresEnabled('crm')) return getCrmTaskRepository().delete(id);
  return GS.deleteCongViec(id);
}

// ── CRM: DuAn ────────────────────────────────────────────────

export function getDuAn(): Promise<DuAn[]> {
  if (isPostgresEnabled('crm')) return getProjectRepository().findAll();
  return GS.getDuAn();
}

export function addDuAn(data: DuAn): Promise<void> {
  if (isPostgresEnabled('crm')) return getProjectRepository().create(data);
  return GS.addDuAn(data);
}

export function updateDuAn(data: DuAn): Promise<boolean> {
  if (isPostgresEnabled('crm')) return getProjectRepository().update(data);
  return GS.updateDuAn(data);
}

export function deleteDuAn(id: string): Promise<boolean> {
  if (isPostgresEnabled('crm')) return getProjectRepository().delete(id);
  return GS.deleteDuAn(id);
}

// ── Contracts: HopDong ────────────────────────────────────────

export function getHopDong(): Promise<HopDong[]> {
  if (isPostgresEnabled('contracts')) return getContractRepository().findAll();
  return GS.getHopDong();
}

export function addHopDong(data: HopDong): Promise<void> {
  if (isPostgresEnabled('contracts')) return getContractRepository().create(data);
  return GS.addHopDong(data);
}

export function updateHopDong(data: HopDong): Promise<boolean> {
  if (isPostgresEnabled('contracts')) return getContractRepository().update(data);
  return GS.updateHopDong(data);
}

export function deleteHopDong(id: string): Promise<boolean> {
  if (isPostgresEnabled('contracts')) return getContractRepository().delete(id);
  return GS.deleteHopDong(id);
}

// ── Attendance: ChamCongNgoai ─────────────────────────────────

export function getChamCongNgoai(
  idNhanVien?: string,
  qlTrucTiep?: string,
): Promise<ChamCongNgoai[]> {
  if (isPostgresEnabled('attendance'))
    return getAttendanceOutsideRepository().findAll(idNhanVien, qlTrucTiep);
  return GS.getChamCongNgoai(idNhanVien, qlTrucTiep);
}

export function addChamCongNgoai(
  data: Omit<ChamCongNgoai, 'id' | 'created_at' | 'trang_thai' | 'nguoi_duyet' | 'ghi_chu_duyet'>,
): Promise<ChamCongNgoai> {
  if (isPostgresEnabled('attendance'))
    return getAttendanceOutsideRepository().create(data);
  return GS.addChamCongNgoai(data);
}

export function updateChamCongNgoaiStatus(
  id: string,
  status: 'da_duyet' | 'tu_choi',
  approver: string,
  note?: string,
  requiredQL?: string,
): Promise<boolean | 'forbidden'> {
  if (isPostgresEnabled('attendance'))
    return getAttendanceOutsideRepository().updateStatus(id, status, approver, note, requiredQL);
  return GS.updateChamCongNgoaiStatus(id, status, approver, note, requiredQL);
}

export function deleteChamCongNgoai(id: string, employeeId: string): Promise<boolean> {
  if (isPostgresEnabled('attendance'))
    return getAttendanceOutsideRepository().delete(id, employeeId);
  return GS.deleteChamCongNgoai(id, employeeId);
}
