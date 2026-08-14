// ============================================================
// CRM BĐS — Data Access Facade
//
// Import point duy nhất cho mọi API route.
// Routes to PostgreSQL khi module flag được bật,
// fallback về Google Sheets khi flag tắt.
//
// API routes: thay '@/lib/google-sheets' → '@/lib/data-access'
// ============================================================

import { unstable_cache, revalidateTag } from 'next/cache';
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

// ── Vercel Data Cache wrappers (survive cold starts) ─────────
// unstable_cache stores results in Vercel's shared Data Cache,
// not in process memory — so they outlive container restarts.
const _pgNhanVien  = unstable_cache(() => getEmployeeRepository().findAll(),  ['nv'],  { revalidate: 60,  tags: ['nv']  });
const _pgKhachHang = unstable_cache(() => getCustomerRepository().findAll(),  ['kh'],  { revalidate: 30,  tags: ['kh']  });
const _pgPipeline  = unstable_cache(() => getPipelineRepository().findAll(),  ['pl'],  { revalidate: 30,  tags: ['pl']  });
const _pgCongViec  = unstable_cache(() => getCrmTaskRepository().findAll(),   ['cv'],  { revalidate: 30,  tags: ['cv']  });
const _pgHopDong   = unstable_cache(() => getContractRepository().findAll(),  ['hd'],  { revalidate: 60,  tags: ['hd']  });
const _pgDuAn      = unstable_cache(() => getProjectRepository().findAll(),   ['da'],  { revalidate: 120, tags: ['da']  });

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
  return _pgNhanVien().catch(e => {
    console.error('[PG:hrm:getNhanVien] error, falling back to GS:', e instanceof Error ? e.message : e);
    return GS.getNhanVien();
  });
}

/**
 * Tra cứu nhân viên theo email — dùng cho ĐĂNG NHẬP.
 *
 * PostgreSQL chỉ là bản sao, được cron /api/cron/sync-sheets nạp lại mỗi ngày
 * 01:00 UTC; Google Sheets mới là nguồn sự thật. Nhân viên vừa thêm vào sheet
 * chưa kịp có trong PG → PG trả về null (KHÔNG ném lỗi) → withPgFallback không
 * kích hoạt → người đó không đăng nhập được cho tới lần cron kế tiếp.
 *
 * Vì vậy ở đây coi "không tìm thấy" cũng là lý do phải hỏi lại Google Sheets.
 */
export async function findNhanVienByEmail(email: string): Promise<NhanVien | null> {
  if (!isPostgresEnabled('hrm')) return GS.findNhanVienByEmail(email);

  const fromPg = await withPgFallback('hrm', 'findNhanVienByEmail',
    () => getEmployeeRepository().findByEmail(email),
    () => GS.findNhanVienByEmail(email),
  );
  if (fromPg) return fromPg;

  // PG chạy bình thường nhưng không có người này → có thể là nhân viên mới.
  const fromSheet = await GS.findNhanVienByEmail(email).catch(e => {
    console.error('[hrm:findNhanVienByEmail] GS fallback lỗi:', e instanceof Error ? e.message : e);
    return null;
  });
  if (fromSheet) {
    console.warn(
      `[hrm:findNhanVienByEmail] "${email}" có trong NHAN_VIEN nhưng chưa có trong PostgreSQL — ` +
      'dùng dữ liệu từ Google Sheets. Chạy /api/cron/sync-sheets để nạp lại bản sao.',
    );
  }
  return fromSheet;
}

export async function addNhanVien(data: NhanVien): Promise<void> {
  revalidateTag('nv', {}); invalidate('gs:nv');
  if (!isPostgresEnabled('hrm')) return GS.addNhanVien(data);

  // Google Sheets là NGUỒN SỰ THẬT — đăng nhập (findEmployeeForAuth) đọc thẳng
  // từ sheet. Nếu chỉ tạo trong PostgreSQL, nhân viên mới KHÔNG đăng nhập được
  // vì login không thấy họ trong sheet. Ghi sheet trước (bắt buộc), rồi thêm vào
  // bản sao PG để màn hình đọc-nhanh hiện ngay. ID do route sinh sẵn ("NV…") nên
  // hai kho dùng chung một id_nhan_vien — không lệch.
  await GS.addNhanVien(data);

  await getEmployeeRepository().create(data).catch(e => {
    // Sheet đã có bản ghi (nguồn sự thật); PG là bản sao, cron sync sẽ nạp bù.
    console.error('[hrm:addNhanVien] tạo bản sao PostgreSQL lỗi (cron sync sẽ bù):', e instanceof Error ? e.message : e);
  });
}

export async function updateNhanVien(data: NhanVien): Promise<boolean> {
  revalidateTag('nv', {}); invalidate('gs:nv');
  if (!isPostgresEnabled('hrm')) return GS.updateNhanVien(data);

  // Google Sheets là NGUỒN SỰ THẬT cho nhân sự — đăng nhập đọc thẳng từ sheet
  // (findEmployeeForAuth), và cron sync hằng ngày ghi đè PG bằng dữ liệu sheet.
  // Nếu chỉ ghi PostgreSQL thì mật khẩu mới không bao giờ tới sheet → login vẫn
  // dùng mật khẩu cũ, rồi lần sync kế tiếp còn xoá luôn thay đổi ở PG.
  // => Ghi sheet trước, sau đó cập nhật bản sao PG (best-effort) để màn hình
  //    đọc-nhanh không hiện dữ liệu cũ.
  const sheetOk = await GS.updateNhanVien(data).catch(e => {
    console.error('[hrm:updateNhanVien] ghi Google Sheets lỗi:', e instanceof Error ? e.message : e);
    return false;
  });

  // Nhân viên tạo trong app (mã "NV<timestamp>") chỉ tồn tại ở PG, không có dòng
  // trong sheet → sheetOk=false nhưng vẫn phải cập nhật PG.
  const pgOk = await getEmployeeRepository().update(data).catch(e => {
    console.error('[hrm:updateNhanVien] cập nhật PostgreSQL lỗi:', e instanceof Error ? e.message : e);
    return false;
  });

  return sheetOk || pgOk;
}

export async function deleteNhanVien(id: string): Promise<boolean> {
  revalidateTag('nv', {}); invalidate('gs:nv');
  if (!isPostgresEnabled('hrm')) return GS.deleteNhanVien(id);

  // Phải xoá khỏi Google Sheets (nguồn sự thật) — nếu chỉ xoá ở PostgreSQL thì:
  //  • nhân viên tạo-trong-app vẫn còn dòng trong sheet → VẪN ĐĂNG NHẬP ĐƯỢC;
  //  • và cron sync hằng ngày sẽ nạp họ trở lại PG.
  const sheetOk = await GS.deleteNhanVien(id).catch(e => {
    console.error('[hrm:deleteNhanVien] xoá Google Sheets lỗi:', e instanceof Error ? e.message : e);
    return false;
  });

  const pgOk = await getEmployeeRepository().delete(id).catch(e => {
    console.error('[hrm:deleteNhanVien] xoá PostgreSQL lỗi:', e instanceof Error ? e.message : e);
    return false;
  });

  return sheetOk || pgOk;
}

// ── CRM: KhachHang ───────────────────────────────────────────

export function getKhachHang(): Promise<KhachHang[]> {
  if (!isPostgresEnabled('crm')) return cached('gs:kh', 30_000, () => GS.getKhachHang());
  return _pgKhachHang().catch(e => {
    console.error('[PG:crm:getKhachHang] error, falling back to GS:', e instanceof Error ? e.message : e);
    return GS.getKhachHang();
  });
}

export function addKhachHang(data: KhachHang): Promise<void> {
  revalidateTag('kh', {}); invalidate('gs:kh');
  if (!isPostgresEnabled('crm')) return GS.addKhachHang(data);
  return withPgFallback('crm', 'addKhachHang',
    () => getCustomerRepository().create(data),
    () => GS.addKhachHang(data),
  );
}

export function addKhachHangBatch(data: KhachHang[]): Promise<void> {
  revalidateTag('kh', {}); invalidate('gs:kh');
  if (!isPostgresEnabled('crm')) return GS.addKhachHangBatch(data);
  return withPgFallback('crm', 'addKhachHangBatch',
    () => getCustomerRepository().createBatch(data),
    () => GS.addKhachHangBatch(data),
  );
}

export function updateKhachHang(data: KhachHang): Promise<boolean> {
  revalidateTag('kh', {}); invalidate('gs:kh');
  if (!isPostgresEnabled('crm')) return GS.updateKhachHang(data);
  return withPgFallback('crm', 'updateKhachHang',
    () => getCustomerRepository().update(data),
    () => GS.updateKhachHang(data),
  );
}

export function deleteKhachHang(id: string): Promise<boolean> {
  revalidateTag('kh', {}); invalidate('gs:kh');
  if (!isPostgresEnabled('crm')) return GS.deleteKhachHang(id);
  return withPgFallback('crm', 'deleteKhachHang',
    () => getCustomerRepository().delete(id),
    () => GS.deleteKhachHang(id),
  );
}

// ── CRM: Pipeline ─────────────────────────────────────────────

export function getPipeline(): Promise<Pipeline[]> {
  if (!isPostgresEnabled('crm')) return cached('gs:pl', 30_000, () => GS.getPipeline());
  return _pgPipeline().catch(e => {
    console.error('[PG:crm:getPipeline] error, falling back to GS:', e instanceof Error ? e.message : e);
    return GS.getPipeline();
  });
}

export function addPipeline(data: Pipeline): Promise<void> {
  revalidateTag('pl', {}); invalidate('gs:pl');
  if (!isPostgresEnabled('crm')) return GS.addPipeline(data);
  return withPgFallback('crm', 'addPipeline',
    () => getPipelineRepository().create(data),
    () => GS.addPipeline(data),
  );
}

export function updatePipeline(data: Pipeline): Promise<{ updated: boolean; oldGiaiDoan: string }> {
  revalidateTag('pl', {}); invalidate('gs:pl');
  if (!isPostgresEnabled('crm')) return GS.updatePipeline(data);
  return withPgFallback('crm', 'updatePipeline',
    () => getPipelineRepository().update(data),
    () => GS.updatePipeline(data),
  );
}

export function deletePipeline(id: string): Promise<boolean> {
  revalidateTag('pl', {}); invalidate('gs:pl');
  if (!isPostgresEnabled('crm')) return GS.deletePipeline(id);
  return withPgFallback('crm', 'deletePipeline',
    () => getPipelineRepository().delete(id),
    () => GS.deletePipeline(id),
  );
}

// ── CRM: CongViec ────────────────────────────────────────────

export function getCongViec(): Promise<CongViec[]> {
  if (!isPostgresEnabled('crm')) return cached('gs:cv', 30_000, () => GS.getCongViec());
  return _pgCongViec().catch(e => {
    console.error('[PG:crm:getCongViec] error, falling back to GS:', e instanceof Error ? e.message : e);
    return GS.getCongViec();
  });
}

export function addCongViec(data: CongViec): Promise<void> {
  revalidateTag('cv', {}); invalidate('gs:cv');
  if (!isPostgresEnabled('crm')) return GS.addCongViec(data);
  return withPgFallback('crm', 'addCongViec',
    () => getCrmTaskRepository().create(data),
    () => GS.addCongViec(data),
  );
}

export function updateCongViec(data: CongViec): Promise<boolean> {
  revalidateTag('cv', {}); invalidate('gs:cv');
  if (!isPostgresEnabled('crm')) return GS.updateCongViec(data);
  return withPgFallback('crm', 'updateCongViec',
    () => getCrmTaskRepository().update(data),
    () => GS.updateCongViec(data),
  );
}

export function deleteCongViec(id: string): Promise<boolean> {
  revalidateTag('cv', {}); invalidate('gs:cv');
  if (!isPostgresEnabled('crm')) return GS.deleteCongViec(id);
  return withPgFallback('crm', 'deleteCongViec',
    () => getCrmTaskRepository().delete(id),
    () => GS.deleteCongViec(id),
  );
}

// ── CRM: DuAn ────────────────────────────────────────────────

export function getDuAn(): Promise<DuAn[]> {
  if (!isPostgresEnabled('crm')) return cached('gs:da', 120_000, () => GS.getDuAn());
  return _pgDuAn().catch(e => {
    console.error('[PG:crm:getDuAn] error, falling back to GS:', e instanceof Error ? e.message : e);
    return GS.getDuAn();
  });
}

export function addDuAn(data: DuAn): Promise<void> {
  revalidateTag('da', {}); invalidate('gs:da');
  if (!isPostgresEnabled('crm')) return GS.addDuAn(data);
  return withPgFallback('crm', 'addDuAn',
    () => getProjectRepository().create(data),
    () => GS.addDuAn(data),
  );
}

export function updateDuAn(data: DuAn): Promise<boolean> {
  revalidateTag('da', {}); invalidate('gs:da');
  if (!isPostgresEnabled('crm')) return GS.updateDuAn(data);
  return withPgFallback('crm', 'updateDuAn',
    () => getProjectRepository().update(data),
    () => GS.updateDuAn(data),
  );
}

export function deleteDuAn(id: string): Promise<boolean> {
  revalidateTag('da', {}); invalidate('gs:da');
  if (!isPostgresEnabled('crm')) return GS.deleteDuAn(id);
  return withPgFallback('crm', 'deleteDuAn',
    () => getProjectRepository().delete(id),
    () => GS.deleteDuAn(id),
  );
}

// ── Contracts: HopDong ────────────────────────────────────────

export function getHopDong(): Promise<HopDong[]> {
  if (!isPostgresEnabled('contracts')) return cached('gs:hd', 60_000, () => GS.getHopDong());
  return _pgHopDong().catch(e => {
    console.error('[PG:contracts:getHopDong] error, falling back to GS:', e instanceof Error ? e.message : e);
    return GS.getHopDong();
  });
}

export function addHopDong(data: HopDong): Promise<void> {
  revalidateTag('hd', {}); invalidate('gs:hd');
  if (!isPostgresEnabled('contracts')) return GS.addHopDong(data);
  return withPgFallback('contracts', 'addHopDong',
    () => getContractRepository().create(data),
    () => GS.addHopDong(data),
  );
}

export function updateHopDong(data: HopDong): Promise<boolean> {
  revalidateTag('hd', {}); invalidate('gs:hd');
  if (!isPostgresEnabled('contracts')) return GS.updateHopDong(data);
  return withPgFallback('contracts', 'updateHopDong',
    () => getContractRepository().update(data),
    () => GS.updateHopDong(data),
  );
}

export function deleteHopDong(id: string): Promise<boolean> {
  revalidateTag('hd', {}); invalidate('gs:hd');
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
    async () => {
      const created = await getAttendanceOutsideRepository().create(data);
      await mirrorChamCongNgoaiToSheet(created, 'addChamCongNgoai');
      return created;
    },
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
    async () => {
      const repo = getAttendanceOutsideRepository();
      const ok = await repo.updateStatus(id, status, approver, note, requiredQL);
      if (ok === true) {
        const updated = await repo.findById(id);
        if (updated) await mirrorChamCongNgoaiToSheet(updated, 'updateChamCongNgoaiStatus');
      }
      return ok;
    },
    () => GS.updateChamCongNgoaiStatus(id, status, approver, note, requiredQL),
  );
}

export function deleteChamCongNgoai(id: string, employeeId: string): Promise<boolean> {
  if (!isPostgresEnabled('attendance')) return GS.deleteChamCongNgoai(id, employeeId);
  return withPgFallback('attendance', 'deleteChamCongNgoai',
    async () => {
      const ok = await getAttendanceOutsideRepository().delete(id, employeeId);
      if (ok) await mirrorDeleteChamCongNgoaiFromSheet(id, 'deleteChamCongNgoai');
      return ok;
    },
    () => GS.deleteChamCongNgoai(id, employeeId),
  );
}

// Admin/HR xóa đơn bất kỳ (bỏ ràng buộc chủ đơn + trạng thái). Ủy quyền ở API route.
export function adminDeleteChamCongNgoai(id: string): Promise<boolean> {
  if (!isPostgresEnabled('attendance')) return GS.deleteChamCongNgoaiById(id);
  return withPgFallback('attendance', 'adminDeleteChamCongNgoai',
    async () => {
      const ok = await getAttendanceOutsideRepository().deleteAny(id);
      if (ok) await mirrorDeleteChamCongNgoaiFromSheet(id, 'adminDeleteChamCongNgoai');
      return ok;
    },
    () => GS.deleteChamCongNgoaiById(id),
  );
}

// Attendance mirror: khi PG bật, vẫn phản chiếu CHAM_CONG_NGOAI về Google Sheet.
async function mirrorChamCongNgoaiToSheet(row: ChamCongNgoai, fn: string): Promise<void> {
  try {
    await GS.upsertChamCongNgoai(row);
  } catch (e) {
    console.error(
      `[GS:attendance:${fn}] mirror failed:`,
      e instanceof Error ? e.message : e,
    );
  }
}

async function mirrorDeleteChamCongNgoaiFromSheet(id: string, fn: string): Promise<void> {
  try {
    await GS.deleteChamCongNgoaiById(id);
  } catch (e) {
    console.error(
      `[GS:attendance:${fn}] mirror delete failed:`,
      e instanceof Error ? e.message : e,
    );
  }
}

// Payroll
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
