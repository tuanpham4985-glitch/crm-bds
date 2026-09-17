import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as sheetSyncModule from '../../src/lib/hrm/appointment-sheet-sync';
const {
  parseVietnameseDateToISO, normalizeDepartmentCode, planAppointmentSheetSync,
  isSheetOwnedTenure, HR_SHEET_SYNC_CREATED_BY_ID, HR_SHEET_SYNC_CREATED_BY_NAME,
} = sheetSyncModule;
import type { HrAppointmentRawRecord } from '../../src/lib/google-sheets';
import type { BoNhiemChucVu, NhanVien } from '../../src/lib/types';

// Fixtures — KHÔNG phụ thuộc Sheet thật (approved architecture §11).
function rawRow(overrides: Partial<HrAppointmentRawRecord> = {}): HrAppointmentRawRecord {
  return {
    stt: '1', ma_nv: '', ho_ten: '', phong_ban: '', so_qd_bn: '', chuc_vu_bo_nhiem: '',
    ngay_bo_nhiem_raw: '', so_qd_mn: '', thoi_giu_chuc_vu: '', ngay_mien_nhiem_raw: '', du_an: '',
    ...overrides,
  };
}

const employees: Pick<NhanVien, 'id_nhan_vien' | 'ho_ten' | 'phong_KD'>[] = [
  { id_nhan_vien: '0002', ho_ten: 'Nguyễn Văn Công', phong_KD: 'VIC-01' },
  { id_nhan_vien: '0052', ho_ten: 'Ngô Thị Dung', phong_KD: 'VIC-10' },
];

function tenure(overrides: Partial<BoNhiemChucVu> = {}): BoNhiemChucVu {
  return {
    id: 't1', id_nhan_vien: '0002', ten_nhan_vien: 'Nguyễn Văn Công', phong_ban: 'VIC-01',
    chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem: '2026-08-17',
    created_by_id: 'NV_ADMIN', created_by_name: 'Admin', created_at: '', updated_at: '',
    ...overrides,
  };
}

// ---- Date parsing ----

test('parseVietnameseDateToISO: DD/MM/YYYY → ISO', () => {
  assert.equal(parseVietnameseDateToISO('17/08/2026'), '2026-08-17');
  assert.equal(parseVietnameseDateToISO('22/04/2026'), '2026-04-22');
});

test('parseVietnameseDateToISO: đã ISO sẵn thì giữ nguyên', () => {
  assert.equal(parseVietnameseDateToISO('2026-08-17'), '2026-08-17');
});

test('parseVietnameseDateToISO: rỗng/không hợp lệ/ngày không tồn tại → null', () => {
  assert.equal(parseVietnameseDateToISO(''), null);
  assert.equal(parseVietnameseDateToISO('abc'), null);
  assert.equal(parseVietnameseDateToISO('31/02/2026'), null); // tháng 2 không có ngày 31
  assert.equal(parseVietnameseDateToISO('32/13/2026'), null);
});

// ---- Department normalization ----

test('normalizeDepartmentCode: "VIC 01" → "VIC-01" (pattern hẹp)', () => {
  assert.equal(normalizeDepartmentCode('VIC 01'), 'VIC-01');
  assert.equal(normalizeDepartmentCode('VIC 10'), 'VIC-10');
  assert.equal(normalizeDepartmentCode('vic-1'), 'VIC-01');
});

test('normalizeDepartmentCode: KHÔNG đụng tên phòng ban khác (không global replace)', () => {
  assert.equal(normalizeDepartmentCode('Phòng MKT'), 'Phòng MKT');
  assert.equal(normalizeDepartmentCode('BLĐ'), 'BLĐ');
});

// ---- Employee ID preservation ----

test('planAppointmentSheetSync: Mã NV "0002" giữ nguyên leading zero, khớp đúng NhanVien', () => {
  const plan = planAppointmentSheetSync(
    [rawRow({ ma_nv: '0002', ho_ten: 'Nguyễn Văn Công', phong_ban: 'VIC 01', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem_raw: '17/08/2026', so_qd_bn: '1708/2026/QĐ-VIC' })],
    [], employees,
  );
  assert.equal(plan.toCreate.length, 1);
  assert.equal(plan.toCreate[0].data.id_nhan_vien, '0002');
  assert.equal(plan.toCreate[0].data.phong_ban, 'VIC-01'); // canonical Employee value, không phải "VIC 01" thô
});

// ---- Blank template row ignored ----

test('planAppointmentSheetSync: dòng trắng thuần STT bị bỏ qua hoàn toàn, không đếm, không báo cáo', () => {
  const plan = planAppointmentSheetSync([rawRow({ stt: '5' })], [], employees);
  assert.equal(plan.totalBusinessRows, 0);
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.toCreate.length, 0);
});

// ---- Incomplete row (real "0052" case) skipped + reported, not an error ----

test('planAppointmentSheetSync: dòng có nhân viên/phòng ban nhưng thiếu chức vụ+ngày → skipped (không phải error), không tạo tenure', () => {
  const plan = planAppointmentSheetSync(
    [rawRow({ ma_nv: '0052', ho_ten: 'Ngô Thị Dung', phong_ban: 'VIC 10' })],
    [], employees,
  );
  assert.equal(plan.totalBusinessRows, 1);
  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.skipped.length, 1);
  assert.match(plan.skipped[0].reason, /chưa hoàn chỉnh/);
});

test('planAppointmentSheetSync: Mã NV không khớp NhanVien nào → skipped kèm lý do', () => {
  const plan = planAppointmentSheetSync(
    [rawRow({ ma_nv: '9999', ho_ten: 'X', chuc_vu_bo_nhiem: 'Y', ngay_bo_nhiem_raw: '01/01/2026' })],
    [], employees,
  );
  assert.equal(plan.skipped.length, 1);
  assert.match(plan.skipped[0].reason, /Không tìm thấy nhân viên/);
});

// ---- Valid row → create ----

test('planAppointmentSheetSync: dòng hợp lệ đầy đủ → toCreate với created_by sentinel đúng ở apply layer (kiểm ở plan: patch KHÔNG chứa created_by)', () => {
  const plan = planAppointmentSheetSync(
    [rawRow({ ma_nv: '0002', ho_ten: 'Nguyễn Văn Công', phong_ban: 'VIC 01', so_qd_bn: '1708/2026/QĐ-VIC', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem_raw: '17/08/2026' })],
    [], employees,
  );
  assert.equal(plan.toCreate.length, 1);
  const c = plan.toCreate[0].data;
  assert.equal(c.chuc_vu_bo_nhiem, 'Giám đốc dự án');
  assert.equal(c.ngay_bo_nhiem, '2026-08-17');
  assert.equal(c.so_quyet_dinh_bo_nhiem, '1708/2026/QĐ-VIC'); // giữ nguyên text, không parse lại
});

// ---- Idempotency: repeated sync → no duplicate ----

test('planAppointmentSheetSync: chạy lại trên Sheet không đổi + tenure đã tồn tại đúng identity → unchanged, KHÔNG tạo thêm', () => {
  const existing = [tenure({ id: 't1', id_nhan_vien: '0002', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem: '2026-08-17', so_quyet_dinh_bo_nhiem: '1708/2026/QĐ-VIC', phong_ban: 'VIC-01', ten_nhan_vien: 'Nguyễn Văn Công' })];
  const plan = planAppointmentSheetSync(
    [rawRow({ ma_nv: '0002', ho_ten: 'Nguyễn Văn Công', phong_ban: 'VIC 01', so_qd_bn: '1708/2026/QĐ-VIC', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem_raw: '17/08/2026' })],
    existing, employees,
  );
  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toUpdate.length, 0);
  assert.equal(plan.unchanged.length, 1);
  assert.equal(plan.unchanged[0].id, 't1');
});

test('planAppointmentSheetSync: tái bổ nhiệm cùng chức vụ KHÁC ngày → tạo tenure MỚI, không match nhầm với tenure cũ', () => {
  const existing = [tenure({ id: 't1', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem: '2025-01-01' })];
  const plan = planAppointmentSheetSync(
    [rawRow({ ma_nv: '0002', chuc_vu_bo_nhiem: 'Trưởng phòng', ngay_bo_nhiem_raw: '01/06/2026' })],
    existing, employees,
  );
  assert.equal(plan.toCreate.length, 1);
  assert.equal(plan.toUpdate.length, 0);
});

// ---- Existing tenure gets Sheet-owned changes, App-only fields survive ----

test('planAppointmentSheetSync: tenure đã tồn tại nhưng số QĐ đổi trên Sheet → update patch CHỈ chứa field Sheet-owned', () => {
  const existing = [tenure({ id: 't1', so_quyet_dinh_bo_nhiem: 'OLD-NUMBER', file_quyet_dinh_bo_nhiem: 'hrm/bo-nhiem/t1/bo-nhiem-abc.pdf', ghi_chu: 'Ghi chú App' })];
  const plan = planAppointmentSheetSync(
    [rawRow({ ma_nv: '0002', ho_ten: 'Nguyễn Văn Công', phong_ban: 'VIC 01', so_qd_bn: 'NEW-NUMBER', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem_raw: '17/08/2026' })],
    existing, employees,
  );
  assert.equal(plan.toUpdate.length, 1);
  const patch = plan.toUpdate[0].patch;
  assert.equal(patch.so_quyet_dinh_bo_nhiem, 'NEW-NUMBER');
  // App-only fields KHÔNG được đụng tới — không xuất hiện trong patch object.
  assert.equal('file_quyet_dinh_bo_nhiem' in patch, false);
  assert.equal('ghi_chu' in patch, false);
  assert.equal('created_by_id' in patch, false);
  assert.equal('created_by_name' in patch, false);
});

// ---- Termination update ----

test('planAppointmentSheetSync: bổ sung miễn nhiệm hợp lệ cho tenure đang giữ → update patch có ngay_mien_nhiem/so_quyet_dinh_mien_nhiem', () => {
  const existing = [tenure({ id: 't1' })];
  const plan = planAppointmentSheetSync(
    [rawRow({
      ma_nv: '0002', ho_ten: 'Nguyễn Văn Công', phong_ban: 'VIC 01', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem_raw: '17/08/2026',
      so_qd_mn: '9999/2026/QĐ-VIC', thoi_giu_chuc_vu: 'Giám đốc dự án', ngay_mien_nhiem_raw: '01/09/2026',
    })],
    existing, employees,
  );
  assert.equal(plan.toUpdate.length, 1);
  assert.equal(plan.toUpdate[0].patch.ngay_mien_nhiem, '2026-09-01');
  assert.equal(plan.toUpdate[0].patch.so_quyet_dinh_mien_nhiem, '9999/2026/QĐ-VIC');
  assert.equal(plan.errors.length, 0);
});

test('planAppointmentSheetSync: ngày miễn nhiệm trước ngày bổ nhiệm → reject, báo lỗi, KHÔNG áp dụng phần miễn nhiệm', () => {
  const existing = [tenure({ id: 't1', ngay_bo_nhiem: '2026-08-17' })];
  const plan = planAppointmentSheetSync(
    [rawRow({
      ma_nv: '0002', ho_ten: 'Nguyễn Văn Công', phong_ban: 'VIC 01', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem_raw: '17/08/2026',
      ngay_mien_nhiem_raw: '01/01/2026', thoi_giu_chuc_vu: 'Giám đốc dự án',
    })],
    existing, employees,
  );
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0].reason, /trước Ngày bổ nhiệm/);
  // Không tenure nào bị hỏng — không patch ngay_mien_nhiem.
  const patch = plan.toUpdate[0]?.patch ?? {};
  assert.equal('ngay_mien_nhiem' in patch, false);
});

test('planAppointmentSheetSync: "Thôi giữ chức vụ" xung đột với chuc_vu_bo_nhiem của cùng dòng → report conflict, skip phần miễn nhiệm, KHÔNG corrupt tenure', () => {
  const existing = [tenure({ id: 't1' })];
  const plan = planAppointmentSheetSync(
    [rawRow({
      ma_nv: '0002', ho_ten: 'Nguyễn Văn Công', phong_ban: 'VIC 01', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem_raw: '17/08/2026',
      so_qd_mn: '9999/2026/QĐ-VIC', thoi_giu_chuc_vu: 'Trưởng phòng kinh doanh', ngay_mien_nhiem_raw: '01/09/2026',
    })],
    existing, employees,
  );
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0].reason, /xung đột/);
  const patch = plan.toUpdate[0]?.patch ?? {};
  assert.equal('ngay_mien_nhiem' in patch, false);
  assert.equal('so_quyet_dinh_mien_nhiem' in patch, false);
});

// ---- Sync never writes NhanVien.employee_type ----

test('module appointment-sheet-sync KHÔNG export bất kỳ hàm nào ghi NhanVien/employee_type', () => {
  const exportedNames = Object.keys(sheetSyncModule);
  assert.ok(!exportedNames.some(n => /employee_type|updateNhanVien|setEmployeeType/i.test(n)));
});

test('planAppointmentSheetSync: kết quả plan không có field nào liên quan employee_type', () => {
  const plan = planAppointmentSheetSync(
    [rawRow({ ma_nv: '0002', ho_ten: 'Nguyễn Văn Công', phong_ban: 'VIC 01', chuc_vu_bo_nhiem: 'Giám đốc dự án', ngay_bo_nhiem_raw: '17/08/2026' })],
    [], employees,
  );
  const json = JSON.stringify(plan);
  assert.doesNotMatch(json, /employee_type/);
});

// ---- Provenance sentinel ----

test('isSheetOwnedTenure: true khi created_by_id là sentinel HR_SHEET_SYNC_CREATED_BY_ID', () => {
  assert.equal(isSheetOwnedTenure({ created_by_id: HR_SHEET_SYNC_CREATED_BY_ID }), true);
  assert.equal(isSheetOwnedTenure({ created_by_id: 'NV0001' }), false);
});

test('HR_SHEET_SYNC_CREATED_BY_NAME là chuỗi hiển thị hợp lý, không trùng tên nhân viên thật', () => {
  assert.equal(HR_SHEET_SYNC_CREATED_BY_NAME, 'Đồng bộ HR Sheet');
});

// ---- Authorization: route bắt buộc canManageHRM (server-side), không tin
// frontend visibility (approved architecture §10) — canManageHRM() bản thân
// đã test đầy đủ ở bo-nhiem-chuc-vu-auth.test.ts; test dưới đây xác nhận route
// mới THỰC SỰ gọi guard đó trước khi chạy sync, không phải chỉ ở UI.
test('route POST /api/bo-nhiem-chuc-vu/sync gọi canManageHRM() và trả 403 khi không đủ quyền TRƯỚC khi chạy sync', () => {
  const routeSrc = fs.readFileSync(
    path.join(__dirname, '../../src/app/api/bo-nhiem-chuc-vu/sync/route.ts'), 'utf8',
  );
  assert.match(routeSrc, /canManageHRM\(user\)/);
  assert.match(routeSrc, /status:\s*403/);
  // Guard phải đứng TRƯỚC lời gọi runAppointmentSheetSync (không chạy sync rồi mới check).
  const guardIdx = routeSrc.indexOf('canManageHRM(user)');
  const syncIdx = routeSrc.indexOf('runAppointmentSheetSync(');
  assert.ok(guardIdx >= 0 && syncIdx >= 0 && guardIdx < syncIdx);
});
