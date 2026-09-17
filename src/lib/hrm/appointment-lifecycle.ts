// Bổ nhiệm / Miễn nhiệm chức vụ — pure domain logic (KHÔNG import prisma/fs/
// next), test được trực tiếp không cần DB thật (xem tests/crm/
// bo-nhiem-chuc-vu-lifecycle.test.ts). API route (src/app/api/bo-nhiem-chuc-vu)
// và UI (src/app/nhan-vien/bo-nhiem-chuc-vu/page.tsx) đều gọi các hàm ở đây,
// KHÔNG duplicate logic.
import type { BoNhiemChucVu, NhanVien } from '../types';

export const TENURE_STATUS_ACTIVE = 'Đang giữ chức vụ';
export const TENURE_STATUS_ENDED = 'Đã thôi giữ chức vụ';

/** Không có field trang_thai lưu trữ — "đang giữ"/"đã thôi giữ" LUÔN derive từ
 * ngay_mien_nhiem (approved architecture, HRM_APPOINTMENT_LIFECYCLE §2). */
export function deriveTenureStatus(tenure: Pick<BoNhiemChucVu, 'ngay_mien_nhiem'>): typeof TENURE_STATUS_ACTIVE | typeof TENURE_STATUS_ENDED {
  return tenure.ngay_mien_nhiem ? TENURE_STATUS_ENDED : TENURE_STATUS_ACTIVE;
}

export function isTenureActive(tenure: Pick<BoNhiemChucVu, 'ngay_mien_nhiem'>): boolean {
  return !tenure.ngay_mien_nhiem;
}

/** Chuẩn hoá tên chức vụ cho việc so khớp exact-duplicate — bỏ khoảng trắng
 * thừa + hạ chữ hoa/thường, KHÔNG bỏ dấu (khác chức vụ khác dấu là khác chức
 * vụ thật, ví dụ không có 2 chức danh tiếng Việt nào chỉ khác nhau ở dấu mà
 * lại là cùng 1 chức vụ). Chỉ dùng nội bộ cho duplicate-check, KHÔNG dùng để
 * hiển thị/lưu. */
export function normalizeChucVuForDuplicateCheck(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseDateSafe(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export interface TenureInputLike {
  id?: string;
  id_nhan_vien: string;
  chuc_vu_bo_nhiem: string;
  ngay_bo_nhiem: string;
  ngay_mien_nhiem?: string | null;
}

/** Exact-duplicate: cùng nhân viên + cùng chức vụ (chuẩn hoá) + cùng ngày bổ
 * nhiệm. KHÔNG chặn "cùng chức vụ, khác ngày" (tái bổ nhiệm hợp lệ theo domain
 * đã duyệt — 1 nhân viên có thể được bổ nhiệm lại cùng 1 chức vụ ở tenure
 * khác). Khi update, loại trừ chính record đang sửa (so theo `id`). */
export function isDuplicateTenure(existing: TenureInputLike[], candidate: TenureInputLike): boolean {
  const candNorm = normalizeChucVuForDuplicateCheck(candidate.chuc_vu_bo_nhiem);
  return existing.some(t => {
    if (candidate.id && t.id === candidate.id) return false;
    return t.id_nhan_vien === candidate.id_nhan_vien
      && normalizeChucVuForDuplicateCheck(t.chuc_vu_bo_nhiem) === candNorm
      && t.ngay_bo_nhiem === candidate.ngay_bo_nhiem;
  });
}

export interface TenureValidationInput extends TenureInputLike {
  employeeExists: boolean;
}

/** Validate tối thiểu theo approved architecture §4 — trả về message lỗi đầu
 * tiên tìm thấy hoặc null nếu hợp lệ. KHÔNG validate chuc_vu_bo_nhiem theo 1
 * catalog cố định: employee_types hiện là tập giá trị MỞ (derive từ dữ liệu
 * NhanVien hiện có, không phải enum — xem HRM audit report §Employee Current
 * Position Authority), chặn cứng sẽ cấm luôn việc bổ nhiệm 1 chức danh HOÀN
 * TOÀN MỚI (VD thăng chức lên 1 chức vụ chưa ai từng giữ) — sai domain thật. */
export function validateTenureInput(
  input: TenureValidationInput,
  existing: TenureInputLike[],
): string | null {
  if (!input.id_nhan_vien) return 'Thiếu nhân viên';
  if (!input.employeeExists) return 'Nhân viên không tồn tại';
  if (!input.chuc_vu_bo_nhiem || !input.chuc_vu_bo_nhiem.trim()) return 'Thiếu chức vụ bổ nhiệm';

  const ngayBN = parseDateSafe(input.ngay_bo_nhiem);
  if (!ngayBN) return 'Ngày bổ nhiệm không hợp lệ';

  if (input.ngay_mien_nhiem) {
    const ngayMN = parseDateSafe(input.ngay_mien_nhiem);
    if (!ngayMN) return 'Ngày miễn nhiệm không hợp lệ';
    if (ngayMN < ngayBN) return 'Ngày miễn nhiệm phải sau hoặc bằng ngày bổ nhiệm';
  }

  if (isDuplicateTenure(existing, input)) {
    return 'Đã tồn tại 1 quyết định bổ nhiệm khác cho nhân viên này với cùng chức vụ và cùng ngày bổ nhiệm';
  }

  return null;
}

/** Sau khi tạo mới 1 tenure còn đang giữ (chưa miễn nhiệm): hỏi user có muốn
 * cập nhật NhanVien.employee_type hay không — CHỈ hỏi khi chức vụ mới thật sự
 * khác employee_type hiện tại (tránh hỏi vô ích khi không có gì đổi). */
export function shouldPromptPositionSyncOnAppointment(chucVuBoNhiem: string, currentEmployeeType: string | undefined | null): boolean {
  return normalizeChucVuForDuplicateCheck(chucVuBoNhiem) !== normalizeChucVuForDuplicateCheck(currentEmployeeType || '');
}

/** Khi 1 tenure vừa được miễn nhiệm (ngay_mien_nhiem mới set): nếu chức vụ
 * thôi giữ ĐÚNG BẰNG employee_type hiện tại, nhân viên coi như đang "mất chức
 * vụ hiện tại" trong hệ thống mà chưa ai xác nhận chức vụ mới — phải hỏi,
 * KHÔNG tự blank/null employee_type (approved architecture §6 "Khi miễn
 * nhiệm"). */
export function needsPositionConfirmationAfterTermination(chucVuBoNhiem: string, currentEmployeeType: string | undefined | null): boolean {
  if (!currentEmployeeType) return false;
  return normalizeChucVuForDuplicateCheck(chucVuBoNhiem) === normalizeChucVuForDuplicateCheck(currentEmployeeType);
}

/** Computed warning cho badge "Chức vụ cần xác nhận" (KHÔNG lưu field riêng —
 * approved architecture §6 "Derived warning phải dựa trên tenure/current
 * employee state, không tạo source of truth thứ hai"). True khi nhân viên có
 * ít nhất 1 tenure đã thôi giữ mà chức vụ thôi giữ đó vẫn trùng employee_type
 * hiện tại — nghĩa là chưa ai xác nhận chức vụ mới sau lần miễn nhiệm đó. */
export function employeePositionNeedsReconfirmation(
  tenuresOfEmployee: Pick<BoNhiemChucVu, 'ngay_mien_nhiem' | 'chuc_vu_bo_nhiem'>[],
  employee: Pick<NhanVien, 'employee_type'>,
): boolean {
  if (!employee.employee_type) return false;
  return tenuresOfEmployee.some(t =>
    !isTenureActive(t) && needsPositionConfirmationAfterTermination(t.chuc_vu_bo_nhiem, employee.employee_type),
  );
}

/** "Thôi giữ chức vụ" hiển thị = chuc_vu_bo_nhiem của chính tenure đó khi đã
 * miễn nhiệm (approved architecture §3 — sheet field "Thôi giữ chức vụ"
 * KHÔNG phải 1 field riêng, KHÔNG duplicate trong DB). */
export function getVacatedTitle(tenure: Pick<BoNhiemChucVu, 'chuc_vu_bo_nhiem' | 'ngay_mien_nhiem'>): string {
  return tenure.ngay_mien_nhiem ? tenure.chuc_vu_bo_nhiem : '';
}
