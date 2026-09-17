// Bổ nhiệm / Miễn nhiệm — Sheet → Postgres sync PLANNING (pure, KHÔNG import
// google-sheets.ts/prisma/next) — test bằng fixture, không phụ thuộc Sheet
// thật (approved architecture HRM_APPOINTMENT_SHEET_SYNC §11). Việc đọc Sheet
// thật nằm ở getAppointmentsFromHrFile() (google-sheets.ts); việc ghi Postgres
// thật nằm ở applyAppointmentSheetSyncPlan() (appointment-sheet-sync-service.ts).
// File này CHỈ quyết định "nên làm gì" — không I/O.
import type { BoNhiemChucVu, NhanVien } from '../types';
import type { HrAppointmentRawRecord } from '../google-sheets';
import { normalizeChucVuForDuplicateCheck } from './appointment-lifecycle';

/** Sentinel provenance — record được TẠO bởi sync này có created_by_id đúng
 * giá trị này (không phải id_nhan_vien thật nào, nên không bao giờ trùng vô
 * tình). Dùng để UI hiện badge "Đồng bộ từ HR" — KHÔNG cần thêm cột `source`
 * mới (approved architecture §7 "ưu tiên giải pháp đơn giản nếu xác định được
 * an toàn mà không cần field lưu trữ thêm"). Giới hạn đã biết: nếu 1 tenure do
 * App tạo trước đó SAU NÀY trùng khớp identity với 1 dòng Sheet, sync sẽ cập
 * nhật field Sheet-owned của nó nhưng created_by_id GIỮ NGUYÊN giá trị App cũ
 * (approved §5 "không overwrite creator/audit identity") — badge sẽ không lùi
 * lại hiện cho record đó dù dữ liệu đã do Sheet quản lý tiếp; chấp nhận cho
 * V1 vì đây chỉ là badge hiển thị, không ảnh hưởng đúng/sai của giá trị field. */
export const HR_SHEET_SYNC_CREATED_BY_ID = 'HR_SHEET_SYNC';
export const HR_SHEET_SYNC_CREATED_BY_NAME = 'Đồng bộ HR Sheet';

export function isSheetOwnedTenure(tenure: Pick<BoNhiemChucVu, 'created_by_id'>): boolean {
  return tenure.created_by_id === HR_SHEET_SYNC_CREATED_BY_ID;
}

function padEmployeeId(id: string): string {
  const t = (id || '').trim();
  return /^\d{1,4}$/.test(t) ? t.padStart(4, '0') : t;
}

/** DD/MM/YYYY (và biến thể D/M/YYYY, dấu "-"/".") → "YYYY-MM-DD". Trả null nếu
 * không parse được — KHÔNG đoán mò. Dựng chuỗi ISO trực tiếp từ D/M/Y đã parse,
 * KHÔNG đi qua `new Date(...).toISOString()` (lệch múi giờ, cùng bug đã ghi
 * chú ở getContractDatesFromHrFile trong google-sheets.ts — cố ý duplicate
 * logic đã proven đó thay vì import, theo đúng convention hiện có của mọi
 * module *-from-hr trong repo: mỗi sync tự chứa parser riêng, không centralize). */
export function parseVietnameseDateToISO(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const pad2 = (n: number) => String(n).padStart(2, '0');

  const alreadyIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (alreadyIso) return `${alreadyIso[1]}-${alreadyIso[2]}-${alreadyIso[3]}`;

  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Ngày thật sự tồn tại (chặn ví dụ 31/02/2026) — dùng UTC constructor thuần
  // để tránh mọi ảnh hưởng múi giờ máy chạy khi kiểm tra round-trip.
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** "VIC 01"/"vic-01"/"VIC01" → "VIC-01". CHỈ nhận diện đúng pattern
 * "VIC" + số (1-2 chữ số) — KHÔNG global-replace space/hyphen cho các phòng
 * ban khác (approved §3 "Do not globally replace arbitrary spaces/hyphens in
 * unrelated department names"). Không khớp pattern → trả nguyên giá trị đã
 * trim, không đoán. */
export function normalizeDepartmentCode(raw: string): string {
  const s = (raw || '').trim();
  const m = s.match(/^VIC[\s-]?(\d{1,2})$/i);
  if (!m) return s;
  return `VIC-${m[1].padStart(2, '0')}`;
}

export interface AppointmentSyncSkip {
  row: number; // STT hoặc thứ tự dòng trong raw records (1-based) cho HR định vị
  ma_nv: string;
  ho_ten: string;
  reason: string;
}

export interface AppointmentSyncError {
  row: number;
  ma_nv: string;
  ho_ten: string;
  reason: string;
}

export interface AppointmentSyncCreate {
  row: number;
  data: {
    id_nhan_vien: string;
    ten_nhan_vien?: string;
    phong_ban?: string;
    du_an?: string;
    chuc_vu_bo_nhiem: string;
    ngay_bo_nhiem: string;
    so_quyet_dinh_bo_nhiem?: string;
    ngay_mien_nhiem?: string | null;
    so_quyet_dinh_mien_nhiem?: string;
  };
  note?: string; // VD lệch phòng ban Sheet vs Employee
}

export interface AppointmentSyncUpdate {
  row: number;
  id: string; // id của BoNhiemChucVu hiện có cần patch
  patch: Record<string, string | null>;
  note?: string;
}

export interface AppointmentSyncUnchanged {
  row: number;
  id: string;
}

export interface AppointmentSyncPlan {
  totalBusinessRows: number; // dòng có ít nhất 1 field nghiệp vụ non-blank (không tính dòng trắng thuần STT)
  toCreate: AppointmentSyncCreate[];
  toUpdate: AppointmentSyncUpdate[];
  unchanged: AppointmentSyncUnchanged[];
  skipped: AppointmentSyncSkip[];
  errors: AppointmentSyncError[];
}

function isBlankTemplateRow(r: HrAppointmentRawRecord): boolean {
  return !r.ma_nv && !r.ho_ten && !r.phong_ban && !r.so_qd_bn && !r.chuc_vu_bo_nhiem
    && !r.ngay_bo_nhiem_raw && !r.so_qd_mn && !r.thoi_giu_chuc_vu && !r.ngay_mien_nhiem_raw && !r.du_an;
}

/** So khớp 2 field business ("Sheet-owned") — trả patch key nếu khác, bỏ qua
 * nếu giống hệt (idempotent: không tạo write thừa khi Sheet không đổi). */
function diffField(existing: string | null | undefined, next: string | null | undefined): boolean {
  return (existing ?? '') !== (next ?? '');
}

export function planAppointmentSheetSync(
  rawRecords: HrAppointmentRawRecord[],
  existingTenures: BoNhiemChucVu[],
  employees: Pick<NhanVien, 'id_nhan_vien' | 'ho_ten' | 'phong_KD'>[],
): AppointmentSyncPlan {
  const empById = new Map(employees.map(e => [padEmployeeId(e.id_nhan_vien), e]));
  const plan: AppointmentSyncPlan = { totalBusinessRows: 0, toCreate: [], toUpdate: [], unchanged: [], skipped: [], errors: [] };

  rawRecords.forEach((raw, idx) => {
    const rowNum = idx + 1;
    if (isBlankTemplateRow(raw)) return; // bỏ qua hoàn toàn, không đếm, không báo cáo (approved §4)

    plan.totalBusinessRows++;

    const maNV = padEmployeeId(raw.ma_nv);
    const hoTen = raw.ho_ten.trim();
    const chucVu = raw.chuc_vu_bo_nhiem.trim();
    const ngayBN = parseVietnameseDateToISO(raw.ngay_bo_nhiem_raw);

    if (!maNV) {
      plan.skipped.push({ row: rowNum, ma_nv: raw.ma_nv, ho_ten: hoTen, reason: 'Thiếu Mã NV' });
      return;
    }
    const employee = empById.get(maNV);
    if (!employee) {
      plan.skipped.push({ row: rowNum, ma_nv: maNV, ho_ten: hoTen, reason: `Không tìm thấy nhân viên với Mã NV "${maNV}"` });
      return;
    }
    if (!chucVu || !ngayBN) {
      // Đúng case "dòng 0052 dở dang" đã xác nhận trên Sheet thật — có nhân
      // viên/phòng ban nhưng thiếu field bổ nhiệm cốt lõi. KHÔNG lỗi, KHÔNG
      // tạo tenure — báo cáo để HR tự sửa (approved §4).
      const missing = [!chucVu && 'Chức vụ bổ nhiệm', !ngayBN && 'Ngày bổ nhiệm'].filter(Boolean).join(', ');
      plan.skipped.push({ row: rowNum, ma_nv: maNV, ho_ten: hoTen || employee.ho_ten, reason: `Thiếu ${missing} — dòng chưa hoàn chỉnh` });
      return;
    }

    // Phòng ban: ưu tiên giá trị canonical của Employee; KHÔNG tự suy diễn 1
    // phòng ban khác nếu Sheet/Employee lệch nhau (approved §3).
    const sheetDept = normalizeDepartmentCode(raw.phong_ban);
    const canonicalDept = employee.phong_KD || sheetDept || undefined;
    let note: string | undefined;
    if (employee.phong_KD && sheetDept && employee.phong_KD !== sheetDept) {
      note = `Phòng ban trên Sheet ("${raw.phong_ban}" → "${sheetDept}") khác với NhanVien.phong_KD ("${employee.phong_KD}") — dùng giá trị Employee`;
    }

    // Termination side — optional. Validate độc lập; lỗi ở đây KHÔNG chặn phần
    // bổ nhiệm (approved §6 "không corrupt tenure hiện có").
    let ngayMN: string | null = null;
    let soQdMn: string | undefined;
    const hasTerminationInput = !!(raw.so_qd_mn || raw.thoi_giu_chuc_vu || raw.ngay_mien_nhiem_raw);
    if (hasTerminationInput) {
      const parsedMN = raw.ngay_mien_nhiem_raw ? parseVietnameseDateToISO(raw.ngay_mien_nhiem_raw) : null;
      if (raw.ngay_mien_nhiem_raw && !parsedMN) {
        plan.errors.push({ row: rowNum, ma_nv: maNV, ho_ten: hoTen, reason: `Ngày miễn nhiệm không hợp lệ: "${raw.ngay_mien_nhiem_raw}" — bỏ qua phần miễn nhiệm của dòng này` });
      } else if (parsedMN && parsedMN < ngayBN) {
        plan.errors.push({ row: rowNum, ma_nv: maNV, ho_ten: hoTen, reason: `Ngày miễn nhiệm (${parsedMN}) trước Ngày bổ nhiệm (${ngayBN}) — bỏ qua phần miễn nhiệm của dòng này` });
      } else if (raw.thoi_giu_chuc_vu && normalizeChucVuForDuplicateCheck(raw.thoi_giu_chuc_vu) !== normalizeChucVuForDuplicateCheck(chucVu)) {
        // V1 semantics: "Thôi giữ chức vụ" PHẢI trùng chuc_vu_bo_nhiem của
        // chính tenure — lệch nghĩa là xung đột thật, KHÔNG tự suy diễn lại
        // (approved §6).
        plan.errors.push({
          row: rowNum, ma_nv: maNV, ho_ten: hoTen,
          reason: `"Thôi giữ chức vụ" ("${raw.thoi_giu_chuc_vu}") khác với "Chức vụ bổ nhiệm" ("${chucVu}") của cùng dòng — xung đột, bỏ qua phần miễn nhiệm của dòng này`,
        });
      } else {
        ngayMN = parsedMN;
        soQdMn = raw.so_qd_mn.trim() || undefined;
      }
    }

    // Idempotency identity: id_nhan_vien + normalized chuc_vu_bo_nhiem + ngay_bo_nhiem
    // (approved architecture, cùng rule isDuplicateTenure() ở appointment-lifecycle.ts).
    const normChucVu = normalizeChucVuForDuplicateCheck(chucVu);
    const existing = existingTenures.find(t =>
      t.id_nhan_vien === maNV
      && normalizeChucVuForDuplicateCheck(t.chuc_vu_bo_nhiem) === normChucVu
      && t.ngay_bo_nhiem === ngayBN,
    );

    const soQdBn = raw.so_qd_bn.trim() || undefined;
    const duAn = raw.du_an.trim() || undefined;

    if (!existing) {
      plan.toCreate.push({
        row: rowNum,
        data: {
          id_nhan_vien: maNV,
          ten_nhan_vien: hoTen || employee.ho_ten,
          phong_ban: canonicalDept,
          du_an: duAn,
          chuc_vu_bo_nhiem: chucVu,
          ngay_bo_nhiem: ngayBN,
          so_quyet_dinh_bo_nhiem: soQdBn,
          ngay_mien_nhiem: ngayMN,
          so_quyet_dinh_mien_nhiem: soQdMn,
        },
        note,
      });
      return;
    }

    // Update CHỈ field Sheet-owned — KHÔNG bao giờ đụng file_quyet_dinh_*,
    // created_by_id/created_by_name, ghi_chu (App-only, approved §5/§7).
    const patch: Record<string, string | null> = {};
    if (diffField(existing.ten_nhan_vien, hoTen || employee.ho_ten)) patch.ten_nhan_vien = hoTen || employee.ho_ten;
    if (diffField(existing.phong_ban, canonicalDept)) patch.phong_ban = canonicalDept ?? null;
    if (diffField(existing.du_an, duAn)) patch.du_an = duAn ?? null;
    if (diffField(existing.so_quyet_dinh_bo_nhiem, soQdBn)) patch.so_quyet_dinh_bo_nhiem = soQdBn ?? null;
    if (hasTerminationInput && ngayMN !== null) {
      if (diffField(existing.ngay_mien_nhiem, ngayMN)) patch.ngay_mien_nhiem = ngayMN;
      if (diffField(existing.so_quyet_dinh_mien_nhiem, soQdMn)) patch.so_quyet_dinh_mien_nhiem = soQdMn ?? null;
    }

    if (Object.keys(patch).length === 0) {
      plan.unchanged.push({ row: rowNum, id: existing.id });
    } else {
      plan.toUpdate.push({ row: rowNum, id: existing.id, patch, note });
    }
  });

  return plan;
}
