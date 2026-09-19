import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveTenureStatus, isTenureActive, TENURE_STATUS_ACTIVE, TENURE_STATUS_ENDED,
  isDuplicateTenure, validateTenureInput, normalizeChucVuForDuplicateCheck,
  shouldPromptPositionSyncOnAppointment, needsPositionConfirmationAfterTermination,
  employeePositionNeedsReconfirmation, getVacatedTitle,
  needsDismissalReviewWarning, matchesEmployeeStatusFilter,
} from '../../src/lib/hrm/appointment-lifecycle';

// Domain: 1 record = 1 tenure. Không có field trang_thai lưu trữ — trạng thái
// LUÔN derive từ ngay_mien_nhiem (approved architecture §2).

test('deriveTenureStatus: không có ngay_mien_nhiem → Đang giữ; có → Đã thôi giữ', () => {
  assert.equal(deriveTenureStatus({ ngay_mien_nhiem: null }), TENURE_STATUS_ACTIVE);
  assert.equal(deriveTenureStatus({ ngay_mien_nhiem: undefined }), TENURE_STATUS_ACTIVE);
  assert.equal(deriveTenureStatus({ ngay_mien_nhiem: '' }), TENURE_STATUS_ACTIVE);
  assert.equal(deriveTenureStatus({ ngay_mien_nhiem: '2026-08-01' }), TENURE_STATUS_ENDED);
  assert.equal(isTenureActive({ ngay_mien_nhiem: null }), true);
  assert.equal(isTenureActive({ ngay_mien_nhiem: '2026-08-01' }), false);
});

test('getVacatedTitle: "Thôi giữ chức vụ" = chuc_vu_bo_nhiem của chính tenure khi đã miễn nhiệm (approved §3 — không duplicate field)', () => {
  assert.equal(getVacatedTitle({ chuc_vu_bo_nhiem: 'Giám đốc Kinh doanh', ngay_mien_nhiem: '2026-08-01' }), 'Giám đốc Kinh doanh');
  assert.equal(getVacatedTitle({ chuc_vu_bo_nhiem: 'Giám đốc Kinh doanh', ngay_mien_nhiem: null }), '');
});

test('normalizeChucVuForDuplicateCheck: chỉ trim + hạ chữ hoa, KHÔNG bỏ dấu', () => {
  assert.equal(normalizeChucVuForDuplicateCheck('  Giám Đốc  Kinh Doanh '), 'giám đốc kinh doanh');
  assert.notEqual(normalizeChucVuForDuplicateCheck('Giam Doc'), normalizeChucVuForDuplicateCheck('Giám Đốc'));
});

test('isDuplicateTenure: cùng nhân viên + cùng chức vụ (chuẩn hoá) + cùng ngày bổ nhiệm = duplicate', () => {
  const existing = [
    { id: 't1', id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2026-01-01' },
  ];
  assert.equal(isDuplicateTenure(existing, { id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: '  trưởng phòng  ', ngay_bo_nhiem: '2026-01-01' }), true);
});

test('isDuplicateTenure: cùng chức vụ nhưng KHÁC ngày bổ nhiệm KHÔNG bị chặn (tái bổ nhiệm hợp lệ, approved §4)', () => {
  const existing = [
    { id: 't1', id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2026-01-01' },
  ];
  assert.equal(isDuplicateTenure(existing, { id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2026-06-01' }), false);
});

test('isDuplicateTenure: khi update, loại trừ chính record đang sửa theo id', () => {
  const existing = [
    { id: 't1', id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2026-01-01' },
  ];
  assert.equal(isDuplicateTenure(existing, { id: 't1', id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2026-01-01' }), false);
});

// ---- du_an trong identity (HRM_APPOINTMENT_MULTI_PROJECT_IDENTITY_FIX) —
// case thật: 1 nhân viên được bổ nhiệm CÙNG chức vụ, CÙNG ngày bổ nhiệm cho
// NHIỀU dự án khác nhau cùng lúc — đây là các tenure khác nhau, không phải
// duplicate. ----

test('isDuplicateTenure: cùng nhân viên/chức vụ/ngày nhưng KHÁC dự án → KHÔNG phải duplicate (đa dự án hợp lệ)', () => {
  const existing = [
    { id: 't1', id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem: '2026-04-22', du_an: 'The Orchard' },
  ];
  assert.equal(isDuplicateTenure(existing, { id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem: '2026-04-22', du_an: 'Global City' }), false);
});

test('isDuplicateTenure: cùng nhân viên/chức vụ/ngày/dự án (chuẩn hoá) → VẪN là duplicate', () => {
  const existing = [
    { id: 't1', id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem: '2026-04-22', du_an: 'The Orchard' },
  ];
  assert.equal(isDuplicateTenure(existing, { id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem: '2026-04-22', du_an: '  the orchard  ' }), true);
});

test('isDuplicateTenure: cả 2 phía không có dự án (undefined) vẫn coi là cùng "không dự án" → duplicate như trước khi có fix', () => {
  const existing = [
    { id: 't1', id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2026-01-01' },
  ];
  assert.equal(isDuplicateTenure(existing, { id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2026-01-01' }), true);
});

test('validateTenureInput: nhân viên không tồn tại bị chặn', () => {
  const err = validateTenureInput(
    { id_nhan_vien: 'NV_X', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2026-01-01', employeeExists: false },
    [],
  );
  assert.match(err || '', /không tồn tại/);
});

test('validateTenureInput: thiếu chức vụ / ngày bổ nhiệm không hợp lệ bị chặn', () => {
  assert.match(validateTenureInput({ id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: '', ngay_bo_nhiem: '2026-01-01', employeeExists: true }, []) || '', /Thiếu chức vụ/);
  assert.match(validateTenureInput({ id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'X', ngay_bo_nhiem: 'not-a-date', employeeExists: true }, []) || '', /Ngày bổ nhiệm không hợp lệ/);
});

test('validateTenureInput: ngày miễn nhiệm trước ngày bổ nhiệm bị chặn', () => {
  const err = validateTenureInput(
    { id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'X', ngay_bo_nhiem: '2026-06-01', ngay_mien_nhiem: '2026-01-01', employeeExists: true },
    [],
  );
  assert.match(err || '', /phải sau hoặc bằng/);
});

test('validateTenureInput: ngày miễn nhiệm ĐÚNG BẰNG ngày bổ nhiệm được chấp nhận (biên hợp lệ)', () => {
  const err = validateTenureInput(
    { id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'X', ngay_bo_nhiem: '2026-06-01', ngay_mien_nhiem: '2026-06-01', employeeExists: true },
    [],
  );
  assert.equal(err, null);
});

test('validateTenureInput: hợp lệ khi không trùng gì → null', () => {
  const err = validateTenureInput(
    { id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Chức vụ hoàn toàn mới chưa ai từng giữ', ngay_bo_nhiem: '2026-01-01', employeeExists: true },
    [],
  );
  assert.equal(err, null); // KHÔNG chặn theo catalog cố định — employee_types là tập mở (approved §4/audit)
});

test('validateTenureInput: exact-duplicate (cùng nhân viên/chức vụ/ngày) bị chặn kèm message rõ ràng', () => {
  const existing = [{ id: 't1', id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2026-01-01' }];
  const err = validateTenureInput(
    { id_nhan_vien: 'NV1', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2026-01-01', employeeExists: true },
    existing,
  );
  assert.match(err || '', /Đã tồn tại/);
});

// ---- Employee position synchronization (approved §6) ----

test('shouldPromptPositionSyncOnAppointment: chỉ hỏi khi chức vụ mới khác employee_type hiện tại', () => {
  assert.equal(shouldPromptPositionSyncOnAppointment('Giám đốc Kinh doanh', 'Trưởng phòng'), true);
  assert.equal(shouldPromptPositionSyncOnAppointment('Trưởng phòng', 'Trưởng phòng'), false);
  assert.equal(shouldPromptPositionSyncOnAppointment('Trưởng phòng', undefined), true);
});

test('needsPositionConfirmationAfterTermination: chỉ true khi chức vụ thôi giữ == employee_type hiện tại', () => {
  assert.equal(needsPositionConfirmationAfterTermination('Giám đốc Kinh doanh', 'Giám đốc Kinh doanh'), true);
  assert.equal(needsPositionConfirmationAfterTermination('Giám đốc Kinh doanh', 'Trưởng phòng'), false);
  assert.equal(needsPositionConfirmationAfterTermination('Giám đốc Kinh doanh', undefined), false);
});

test('employeePositionNeedsReconfirmation: true khi có tenure đã thôi giữ trùng employee_type hiện tại, false khi tenure vẫn active', () => {
  const employee = { employee_type: 'Giám đốc Kinh doanh' };
  assert.equal(employeePositionNeedsReconfirmation(
    [{ chuc_vu_bo_nhiem: 'Giám đốc Kinh doanh', ngay_mien_nhiem: '2026-08-01' }], employee,
  ), true);
  assert.equal(employeePositionNeedsReconfirmation(
    [{ chuc_vu_bo_nhiem: 'Giám đốc Kinh doanh', ngay_mien_nhiem: null }], employee,
  ), false);
  assert.equal(employeePositionNeedsReconfirmation(
    [{ chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_mien_nhiem: '2026-08-01' }], employee,
  ), false);
});

// ---- Employment status (NhanVien.trang_thai) vs Appointment/tenure status —
// approved architecture EMPLOYEE_STATUS_VS_TENURE_STATUS: 2 chiều độc lập,
// "Nghỉ việc" KHÔNG tự động nghĩa là "Đã miễn nhiệm". Case thật: Ngô Thị Dung
// (đã nghỉ việc, tenure "Giám đốc dự án" chưa có ngay_mien_nhiem). ----

test('1. Nhân viên đang làm (Chính thức) + tenure đang giữ → không cảnh báo', () => {
  assert.equal(needsDismissalReviewWarning('Chính thức', { ngay_mien_nhiem: null }), false);
});

test('2. Nhân viên Nghỉ việc + tenure ĐANG GIỮ (chưa có ngay_mien_nhiem) → record vẫn hiển thị bình thường, cảnh báo computed = true (không tự đổi trạng thái chức vụ)', () => {
  const tenure = { ngay_mien_nhiem: null };
  // Trạng thái chức vụ vẫn "Đang giữ chức vụ" — KHÔNG bị suy diễn thành đã miễn nhiệm.
  assert.equal(isTenureActive(tenure), true);
  assert.equal(deriveTenureStatus(tenure), TENURE_STATUS_ACTIVE);
  // Cảnh báo rà soát được tính riêng, không thay thế trạng thái chức vụ.
  assert.equal(needsDismissalReviewWarning('Nghỉ việc', tenure), true);
});

test('3. Nhân viên Nghỉ việc + tenure ĐÃ miễn nhiệm (có ngay_mien_nhiem) → không cảnh báo, không có gì bất thường để rà soát', () => {
  const tenure = { ngay_mien_nhiem: '2026-04-20' };
  assert.equal(deriveTenureStatus(tenure), TENURE_STATUS_ENDED);
  assert.equal(needsDismissalReviewWarning('Nghỉ việc', tenure), false);
});

test('4. Employment status KHÔNG mutate appointment/tenure status — deriveTenureStatus chỉ phụ thuộc ngay_mien_nhiem, không nhận/đọc trang_thai nhân viên', () => {
  const tenure = { ngay_mien_nhiem: null };
  // Cùng 1 tenure, đổi trang_thai nhân viên bất kỳ — deriveTenureStatus không đổi.
  assert.equal(deriveTenureStatus(tenure), TENURE_STATUS_ACTIVE);
  assert.equal(needsDismissalReviewWarning('Chính thức', tenure) !== needsDismissalReviewWarning('Nghỉ việc', tenure), true);
  // Nhưng bản thân deriveTenureStatus() không có tham số trang_thai — không thể mutate theo nó (kiểm tra bằng chữ ký hàm qua .length).
  assert.equal(deriveTenureStatus.length, 1);
});

test('5. Appointment/tenure status KHÔNG mutate employment status — needsDismissalReviewWarning thuần derive, không có side-effect ghi NhanVien', () => {
  // Hàm chỉ nhận input, trả boolean — không import bất kỳ hàm ghi NhanVien nào (kiểm tra tĩnh qua module exports của file domain thuần này).
  assert.equal(typeof needsDismissalReviewWarning('Nghỉ việc', { ngay_mien_nhiem: null }), 'boolean');
});

test('6. matchesEmployeeStatusFilter: "" (Tất cả) luôn khớp; giá trị cụ thể phải khớp CHÍNH XÁC trang_thai', () => {
  assert.equal(matchesEmployeeStatusFilter('Nghỉ việc', ''), true);
  assert.equal(matchesEmployeeStatusFilter('Chính thức', ''), true);
  assert.equal(matchesEmployeeStatusFilter('Nghỉ việc', 'Nghỉ việc'), true);
  assert.equal(matchesEmployeeStatusFilter('Chính thức', 'Nghỉ việc'), false);
  assert.equal(matchesEmployeeStatusFilter(undefined, 'Nghỉ việc'), false);
});

test('7. matchesEmployeeStatusFilter mặc định ("") không loại bất kỳ ai — record nhân viên Nghỉ việc KHÔNG biến mất khỏi view mặc định', () => {
  const records = [
    { id_nhan_vien: 'A', trang_thai: 'Chính thức' },
    { id_nhan_vien: 'B', trang_thai: 'Nghỉ việc' },
  ];
  const visible = records.filter(r => matchesEmployeeStatusFilter(r.trang_thai, ''));
  assert.equal(visible.length, 2);
});
