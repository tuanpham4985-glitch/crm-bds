// Bổ nhiệm / Miễn nhiệm — orchestrates Sheet → Postgres sync (I/O layer).
// Đọc Sheet (getAppointmentsFromHrFile) + đọc Postgres hiện có (listTenures,
// getNhanVien) → tính plan THUẦN (planAppointmentSheetSync, appointment-sheet-sync.ts)
// → nếu KHÔNG dryRun, apply plan qua repository hiện có (createTenure/updateTenure).
// KHÔNG bao giờ ghi ngược lại Sheet, KHÔNG bao giờ đụng NhanVien.employee_type
// (approved architecture §2/§8) — xác nhận bằng cách chỉ import getNhanVien
// (READ) từ data-access, không import bất kỳ hàm update nhân viên nào.
import { getAppointmentsFromHrFile } from '../google-sheets';
import { getNhanVien } from '../data-access';
import { listTenures, createTenure, updateTenure } from './appointment-tenure-repository';
import {
  planAppointmentSheetSync, HR_SHEET_SYNC_CREATED_BY_ID, HR_SHEET_SYNC_CREATED_BY_NAME,
  type AppointmentSyncSkip, type AppointmentSyncError,
} from './appointment-sheet-sync';

export interface AppointmentSyncSummary {
  dryRun: boolean;
  totalBusinessRows: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: AppointmentSyncSkip[];
  errors: AppointmentSyncError[];
}

export async function runAppointmentSheetSync(opts: { dryRun: boolean }): Promise<AppointmentSyncSummary> {
  const [rawRecords, existingTenures, employees] = await Promise.all([
    getAppointmentsFromHrFile(),
    listTenures(),
    getNhanVien(),
  ]);

  const plan = planAppointmentSheetSync(rawRecords, existingTenures, employees);

  if (opts.dryRun) {
    return {
      dryRun: true,
      totalBusinessRows: plan.totalBusinessRows,
      created: plan.toCreate.length,
      updated: plan.toUpdate.length,
      unchanged: plan.unchanged.length,
      skipped: plan.skipped,
      errors: plan.errors,
    };
  }

  let created = 0;
  let updated = 0;
  const applyErrors: AppointmentSyncError[] = [...plan.errors];

  for (const c of plan.toCreate) {
    try {
      await createTenure({
        ...c.data,
        created_by_id: HR_SHEET_SYNC_CREATED_BY_ID,
        created_by_name: HR_SHEET_SYNC_CREATED_BY_NAME,
      });
      created++;
    } catch (e) {
      console.error('[AppointmentSheetSync] create failed', c.row, e instanceof Error ? e.message : e);
      applyErrors.push({ row: c.row, ma_nv: c.data.id_nhan_vien, ho_ten: c.data.ten_nhan_vien || '', reason: 'Lỗi hệ thống khi tạo bản ghi — thử đồng bộ lại sau' });
    }
  }

  for (const u of plan.toUpdate) {
    try {
      const ok = await updateTenure(u.id, u.patch);
      if (ok) updated++;
      else applyErrors.push({ row: u.row, ma_nv: '', ho_ten: '', reason: `Không tìm thấy bản ghi ${u.id} để cập nhật (có thể đã bị xóa)` });
    } catch (e) {
      console.error('[AppointmentSheetSync] update failed', u.row, e instanceof Error ? e.message : e);
      applyErrors.push({ row: u.row, ma_nv: '', ho_ten: '', reason: 'Lỗi hệ thống khi cập nhật bản ghi — thử đồng bộ lại sau' });
    }
  }

  return {
    dryRun: false,
    totalBusinessRows: plan.totalBusinessRows,
    created,
    updated,
    unchanged: plan.unchanged.length,
    skipped: plan.skipped,
    errors: applyErrors,
  };
}
