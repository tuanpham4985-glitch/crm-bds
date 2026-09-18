import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { canAccessHrmAppointment } from '../../src/lib/hrm/appointment-access';
import { hasBusinessAccess } from '../../src/lib/menu-registry';

// Approved architecture HRM_APPOINTMENT_ACCESS_CONTROL — CHỈ Ban lãnh đạo,
// Phòng HCNS, Phòng TKKD, Phòng TCKT (canonical cho "Kế toán", xác nhận trực
// tiếp từ dữ liệu thật + chéo qua task-management/sync-users.ts) được truy
// cập capability Bổ nhiệm/Miễn nhiệm. Canonical phong_KD dùng đúng giá trị
// đã xác nhận, KHÔNG suy đoán nhãn hiển thị.

test('A. Ban lãnh đạo (phong_KD = "BLĐ") → allowed', () => {
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'NVKD', phong_KD: 'BLĐ' }), true);
});

test('B. Phòng HCNS → allowed', () => {
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'CV HCNS', phong_KD: 'Phòng HCNS' }), true);
});

test('C. Phòng TKKD → allowed', () => {
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'TKKD', phong_KD: 'Phòng TKKD' }), true);
});

test('D. Phòng TCKT (canonical cho "Kế toán") → allowed', () => {
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'CV Kế toán', phong_KD: 'Phòng TCKT' }), true);
});

test('E. Nhân viên bình thường ngoài 4 nhóm (VD phong_KD "VIC-01", NVKD) → denied', () => {
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'NVKD', phong_KD: 'VIC-01' }), false);
});

test('E2. Không xác định actor (chưa đăng nhập) → denied', () => {
  assert.equal(canAccessHrmAppointment(null), false);
});

test('E3. phong_KD trống/không rõ → denied (không mặc định cho qua)', () => {
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'NVKD', phong_KD: '' }), false);
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'NVKD' }), false);
});

test('Admin luôn được phép bất kể phong_KD (cùng convention canManageHRM)', () => {
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Admin', employee_type: 'NVKD', phong_KD: 'VIC-01' }), true);
});

test('SENIOR_EMPLOYEE_TYPES (Chủ tịch/CEO/TGĐ/Phó TGĐ) luôn được phép dù phong_KD không ghi đúng "BLĐ" (data-entry không nhất quán)', () => {
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'CEO', phong_KD: '' }), true);
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'Chủ tịch', phong_KD: 'VIC-01' }), true);
});

test('Không nhầm "Phòng Kế toán" (không tồn tại trong dữ liệu thật) với "Phòng TCKT" — chuỗi hiển thị khác canonical KHÔNG được match', () => {
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'NVKD', phong_KD: 'Phòng Kế toán' }), false);
});

test('Không nhầm chức danh "TKKD" (Thư ký kinh doanh, employee_type) với phòng ban "Phòng TKKD" — chỉ phong_KD mới xét, employee_type="TKKD" đơn thuần không đủ nếu KHÔNG phải senior/Admin', () => {
  assert.equal(canAccessHrmAppointment({ vai_tro: 'Sale', employee_type: 'TKKD', phong_KD: 'VIC-01' }), false);
});

// ---- Menu visibility follows same audience ----

test('hasBusinessAccess("canAccessHrmAppointment", ctx) đúng theo tín hiệu canAccessHrmAppointment trong context', () => {
  assert.equal(hasBusinessAccess('canAccessHrmAppointment', {
    isAdmin: false, canPhanKhach: false, canQualityDashboard: false, canEditHRM: false, canAccessHrmAppointment: false,
  }), false);
  assert.equal(hasBusinessAccess('canAccessHrmAppointment', {
    isAdmin: false, canPhanKhach: false, canQualityDashboard: false, canEditHRM: false, canAccessHrmAppointment: true,
  }), true);
});

// ---- Server-side enforcement — mọi route phải gọi canAccessHrmAppointment
// TRƯỚC khi chạm dữ liệu, không tin frontend visibility. Cùng phương pháp
// source-inspection đã dùng cho canManageHRM ở bo-nhiem-chuc-vu-sheet-sync.test.ts. ----

const ROUTE_FILES = [
  ['src/app/api/bo-nhiem-chuc-vu/route.ts', ['GET', 'POST']],
  ['src/app/api/bo-nhiem-chuc-vu/[id]/route.ts', ['PUT', 'DELETE']],
  ['src/app/api/bo-nhiem-chuc-vu/sync/route.ts', ['POST']],
  ['src/app/api/bo-nhiem-chuc-vu/documents/route.ts', ['POST']],
  ['src/app/api/bo-nhiem-chuc-vu/documents/[ref]/route.ts', ['GET']],
] as const;

for (const [file, methods] of ROUTE_FILES) {
  test(`route ${file} (${methods.join('/')}): import + gọi canAccessHrmAppointment(), trả 403 khi denied`, () => {
    const src = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
    assert.match(src, /canAccessHrmAppointment/, `${file} phải import/gọi canAccessHrmAppointment`);
    assert.match(src, /status:\s*403/, `${file} phải trả 403 khi bị từ chối`);
  });
}

test('route [id]: canAccessHrmAppointment được gọi TRƯỚC updateTenure/deleteTenure (không ghi dữ liệu trước khi kiểm tra quyền)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/app/api/bo-nhiem-chuc-vu/[id]/route.ts'), 'utf8');
  const gateIdx = src.indexOf('canAccessHrmAppointment');
  const updateIdx = src.indexOf('updateTenure(');
  const deleteIdx = src.indexOf('deleteTenure(');
  assert.ok(gateIdx >= 0 && updateIdx >= 0 && deleteIdx >= 0);
  assert.ok(gateIdx < updateIdx);
  assert.ok(gateIdx < deleteIdx);
});

test('route sync: canAccessHrmAppointment được gọi TRƯỚC runAppointmentSheetSync (không chạy sync trước khi kiểm tra quyền)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/app/api/bo-nhiem-chuc-vu/sync/route.ts'), 'utf8');
  const gateIdx = src.indexOf('canAccessHrmAppointment');
  const syncIdx = src.indexOf('runAppointmentSheetSync(');
  assert.ok(gateIdx >= 0 && syncIdx >= 0 && gateIdx < syncIdx);
});

test('route documents (upload): canAccessHrmAppointment được gọi TRƯỚC khi đọc/lưu file', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/app/api/bo-nhiem-chuc-vu/documents/route.ts'), 'utf8');
  const gateIdx = src.indexOf('canAccessHrmAppointment');
  const putIdx = src.indexOf('.put(');
  assert.ok(gateIdx >= 0 && putIdx >= 0 && gateIdx < putIdx);
});

test('route documents/[ref] (đọc file): canAccessHrmAppointment được gọi TRƯỚC khi đọc storage', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/app/api/bo-nhiem-chuc-vu/documents/[ref]/route.ts'), 'utf8');
  const gateIdx = src.indexOf('canAccessHrmAppointment');
  const getIdx = src.indexOf('.get(ref)');
  assert.ok(gateIdx >= 0 && getIdx >= 0 && gateIdx < getIdx);
});

test('trang /nhan-vien/bo-nhiem-chuc-vu (client): gọi canAccessHrmAppointment và có early-return khi denied (không expose dữ liệu cho URL truy cập trực tiếp)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/app/nhan-vien/bo-nhiem-chuc-vu/page.tsx'), 'utf8');
  assert.match(src, /canAccessHrmAppointment/);
  assert.match(src, /Bạn không có quyền truy cập trang này/);
});

// ---- canManageHRM (gate ghi/quản lý hiện có, tách biệt) KHÔNG bị nới lỏng —
// vẫn required cùng lúc với canAccessHrmAppointment (AND, không thay thế). ----

test('regression: canManageHRM vẫn được gọi song song canAccessHrmAppointment ở route ghi/sync/document-upload/[id] (2 gate độc lập, AND với nhau — không gộp/nới lỏng)', () => {
  const writeRoutes = [
    'src/app/api/bo-nhiem-chuc-vu/route.ts',
    'src/app/api/bo-nhiem-chuc-vu/[id]/route.ts',
    'src/app/api/bo-nhiem-chuc-vu/sync/route.ts',
    'src/app/api/bo-nhiem-chuc-vu/documents/route.ts',
    'src/app/api/bo-nhiem-chuc-vu/documents/[ref]/route.ts',
  ];
  for (const file of writeRoutes) {
    const src = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
    assert.match(src, /canManageHRM/, `${file} phải vẫn còn canManageHRM`);
    assert.match(src, /canAccessHrmAppointment/, `${file} phải có thêm canAccessHrmAppointment`);
  }
});

// ---- Fix HRM_APPOINTMENT_VIEW_SCOPE_FIX — VIEW-only audience (VD Phòng
// TCKT, không có canManageHRM) phải nhận CHUNG 1 dataset appointment như
// Admin/HR, KHÔNG bị tự scope xuống own id_nhan_vien chỉ vì thiếu
// canManageHRM (đó là quyền GHI). Route không có HTTP test harness sẵn
// (kiến trúc hiện tại dùng source-inspection cho mọi route test trong file
// này) — tái dùng đúng cách đó, không dựng framework mock request/response
// mới chỉ cho task này. ----

function getGetHandlerSource(): string {
  const src = fs.readFileSync(path.join(__dirname, '../../src/app/api/bo-nhiem-chuc-vu/route.ts'), 'utf8');
  const start = src.indexOf('export async function GET');
  // Cắt TRƯỚC comment block của POST (không phải TRƯỚC "export async function
  // POST") — comment đó tự nhắc tới "canManageHRM" như tài liệu cho POST, nếu
  // cắt muộn hơn sẽ vô tình lẫn chữ đó vào slice của GET.
  const end = src.indexOf('// POST —');
  assert.ok(start >= 0 && end > start, 'Không tìm thấy đúng ranh giới GET handler trong route.ts');
  return src.slice(start, end);
}

test('GET /api/bo-nhiem-chuc-vu: KHÔNG còn tự scope dataset theo canManageHRM — mọi actor đã qua gate canAccessHrmAppointment đều nhận CHUNG 1 dataset (regression cho bug TP TC-KT thấy 0 bản ghi)', () => {
  const getSrc = getGetHandlerSource();
  // canManageHRM KHÔNG được xuất hiện trong GET handler nữa — quyền GHI
  // không còn quyết định dataset XEM. canManageHRM vẫn còn nguyên trong
  // POST/PUT/DELETE/sync/document (test riêng ở trên đã xác nhận).
  assert.doesNotMatch(getSrc, /canManageHRM/, 'GET không được dùng canManageHRM để scope dataset — đó là root cause bug TP TC-KT');
  assert.doesNotMatch(getSrc, /privileged/i, 'GET không được còn khái niệm "privileged" phân biệt dataset — audience gate (canAccessHrmAppointment) đã quyết định ai vào được, ai vào rồi thì cùng 1 dataset');
});

test('GET /api/bo-nhiem-chuc-vu: dataset fetch chỉ phụ thuộc optional id_nhan_vien query param, KHÔNG phụ thuộc actor identity nào khác', () => {
  const getSrc = getGetHandlerSource();
  assert.match(
    getSrc,
    /listTenures\(idNhanVienParam \? \{ id_nhan_vien: idNhanVienParam \} : undefined\)/,
    'GET phải gọi listTenures với duy nhất optional id_nhan_vien filter, không nhánh theo actor',
  );
  // canAccessHrmAppointment vẫn PHẢI đứng TRƯỚC lời gọi listTenures (audience
  // gate không bị bỏ qua) — cùng cách kiểm tra thứ tự đã dùng cho các route khác.
  const gateIdx = getSrc.indexOf('canAccessHrmAppointment');
  const listIdx = getSrc.indexOf('listTenures(');
  assert.ok(gateIdx >= 0 && listIdx >= 0 && gateIdx < listIdx, 'canAccessHrmAppointment phải được gọi TRƯỚC listTenures trong GET');
});

// ---- canAccessHrmAppointment (audience gate, pure) đã test đầy đủ ở đầu file
// (test A-E: BLĐ/HCNS/TKKD/TCKT allowed, ngoài audience denied, Admin/senior
// allowed) — vì GET giờ CHỈ còn phụ thuộc DUY NHẤT gate này để quyết định ai
// xem được dataset chung, các test đó ĐÃ chứng minh đủ ma trận VIEW cho GET:
// Admin/BLĐ/HCNS/TKKD/TCKT → allowed (nhận dataset chung); actor ngoài
// audience → denied (403, chưa từng chạm listTenures). Không lặp lại ở đây. ----
