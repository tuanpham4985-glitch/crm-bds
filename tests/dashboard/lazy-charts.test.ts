import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// Batch 1B — Dashboard "biểu đồ nặng" (KPI grid/TongHopTables/Hà Nội-TPHCM/
// đường xu hướng, admin-only) đóng mặc định, KHÔNG fetch/tính cho tới khi
// User bấm "Hiển thị biểu đồ". Đúng convention repo hiện có: đọc SOURCE THẬT
// + assert cấu trúc/wiring bằng regex (không có jsdom/RTL).

const routeSrc = readFileSync(resolve('src/app/api/dashboard/route.ts'), 'utf8');
const pageSrc = readFileSync(resolve('src/app/page.tsx'), 'utf8');

// ─── Server: /api/dashboard route.ts ───────────────────────────────────────

test('route.ts: đọc lite=1 từ query, wantCharts CHỈ thu hẹp thêm trong phạm vi isAdmin đã có (không mở rộng ra ngoài)', () => {
  assert.match(routeSrc, /const lite = searchParams\.get\('lite'\) === '1';/);
  assert.match(routeSrc, /const wantCharts = isAdmin && !lite;/);
});

test('route.ts: getCongViec()/getHopDong()/getDataNhanSuForReport() CHỈ fetch khi wantCharts=true (bỏ qua hoàn toàn ở chế độ lite) — KHÔNG đụng getPipeline/getKhachHang/getNhanVien/getTongHopGiaoDich (vẫn cần cho kpi/Bảng xếp hạng dù đóng biểu đồ)', () => {
  assert.match(routeSrc, /wantCharts \? getCongViec\(\) : Promise\.resolve\(\[\] as Awaited<ReturnType<typeof getCongViec>>\)/);
  assert.match(routeSrc, /wantCharts \? getHopDong\(\) : Promise\.resolve\(\[\] as Awaited<ReturnType<typeof getHopDong>>\)/);
  assert.match(routeSrc, /wantCharts \? getDataNhanSuForReport\(\)\.catch/);
  // Các fetch luôn-cần không được đổi điều kiện — vẫn gọi trần, không gate theo wantCharts/lite.
  assert.match(routeSrc, /getPipeline\(\),\s*\n\s*getKhachHang\(\),\s*\n\s*getNhanVien\(\),/);
  assert.match(routeSrc, /reportMode !== 'standard'\s*\n\s*\? getTongHopGiaoDich\(/);
});

test('route.ts: tonghop/nhanSuBienDong gate theo wantCharts (KHÔNG còn theo isAdmin trần) — lite request (kể cả isAdmin) không tính buildTongHopStats/buildNhanSu*', () => {
  assert.match(routeSrc, /const tonghop = wantCharts\s*\n\s*\? buildTongHopStats\(reportMode !== 'standard'\)\s*\n\s*: undefined;/);
  assert.match(routeSrc, /const nhanSuBienDong = wantCharts\s*\n\s*\? \(process\.env\.NHAN_SU_SHEET_ID/);
  assert.doesNotMatch(routeSrc, /const tonghop = isAdmin\b/);
  assert.doesNotMatch(routeSrc, /const nhanSuBienDong = isAdmin\b/);
});

test('route.ts: crm_totals bị ẩn khỏi response khi wantCharts=false — tránh trả cv_total/cv_by_status sai (0/rỗng vì allCongViec rỗng ở chế độ lite) trông như dữ liệu thật', () => {
  assert.match(routeSrc, /crm_totals: wantCharts \? crm_totals : undefined,/);
});

// ─── Client: page.tsx (Dashboard) ──────────────────────────────────────────

test('page.tsx: chartsOpen/chartsLoaded mặc định false (đóng, chưa tải) khi vào Dashboard', () => {
  assert.match(pageSrc, /const \[chartsOpen, setChartsOpen\] = useState\(false\);/);
  assert.match(pageSrc, /const \[chartsLoaded, setChartsLoaded\] = useState\(false\);/);
});

test('page.tsx: fetchData gửi lite=1 khi KHÔNG muốn biểu đồ (đọc chartsOpenRef khi không truyền tường minh includeCharts) — chỉ gọi API "đủ" (không lite) khi thật sự cần', () => {
  assert.match(pageSrc, /const fetchData = useCallback\(async \(includeCharts\?: boolean\) => \{/);
  assert.match(pageSrc, /const wantCharts = includeCharts \?\? chartsOpenRef\.current;/);
  assert.match(pageSrc, /if \(!wantCharts\) params\.set\('lite', '1'\);/);
});

test('page.tsx: fetchData luôn setChartsLoaded(wantCharts) theo ĐÚNG kết quả fetch vừa rồi (không chỉ set true) — 1 fetch lite (VD đổi period lúc đang đóng) phải đặt lại chartsLoaded=false để lần mở sau không dùng nhầm data cũ thiếu tonghop', () => {
  assert.match(pageSrc, /setData\(result\.data\);\s*\n\s*\/\/[^\n]*\n(\s*\/\/[^\n]*\n)*\s*setChartsLoaded\(wantCharts\);/);
});

test('page.tsx: effect fetch chính KHÔNG đổi wiring — vẫn chỉ phụ thuộc [fetchData] (period/compare/month/year), KHÔNG thêm chartsOpen vào dependency — bấm mở/đóng biểu đồ một mình KHÔNG kích hoạt lại effect này (tránh double-fetch, xem handleToggleCharts gọi fetchData(true) RIÊNG)', () => {
  assert.match(pageSrc, /useEffect\(\(\) => \{ fetchData\(\); \}, \[fetchData\]\);/);
});

test('page.tsx: handleToggleCharts CHỈ gọi fetchData(true) khi mở LẦN ĐẦU (chưa chartsLoaded) — mở lại trong cùng phiên không đổi filter thì tái dùng data cũ, không refetch trùng lặp; đóng thì chỉ ẩn, không fetch gì', () => {
  assert.match(pageSrc, /const handleToggleCharts = useCallback\(\(\) => \{\s*\n\s*setChartsOpen\(prev => \{\s*\n\s*const next = !prev;\s*\n\s*if \(next && !chartsLoaded\) fetchData\(true\);\s*\n\s*return next;\s*\n\s*\}\);\s*\n\s*\}, \[chartsLoaded, fetchData\]\);/);
});

test('page.tsx: TongHopTables + khối "Hà Nội vs TP.HCM/Doanh thu theo thời gian" (recharts LineChart) gate thêm theo chartsOpen — unmount thật khi đóng, không chỉ ẩn CSS', () => {
  assert.match(pageSrc, /\{isAdmin && chartsOpen && data\.tonghop && \(\s*\n\s*<TongHopTables/);
  assert.match(pageSrc, /\{isAdmin && chartsOpen && \(\s*\n\s*<div className="charts-grid"/);
});

test('page.tsx: KPI Grid (3 số) KHÔNG gate theo chartsOpen — vẫn hiển thị ngay (dùng data.kpi khi tonghop chưa tải) đúng yêu cầu "giữ thông tin nhẹ hiển thị ngay"', () => {
  assert.match(pageSrc, /\{\/\* KPI Grid — admin only[^*]*\*\/\}\s*\n\s*\{isAdmin && \(\s*\n\s*<div className="kpi-grid"/);
});

test('page.tsx: nút "Hiển thị biểu đồ"/"Ẩn biểu đồ" tồn tại, gọi handleToggleCharts, đổi nhãn theo chartsOpen', () => {
  assert.match(pageSrc, /onClick=\{handleToggleCharts\}/);
  assert.match(pageSrc, /\{chartsOpen \? 'Ẩn biểu đồ' : 'Hiển thị biểu đồ'\}/);
});

test('page.tsx: fetch riêng CỰC CHIẾN (raceData) cũng gửi lite=1 — chỉ cần doanh_thu_theo_sale, không kéo theo tonghop/nhan_su_bien_dong/crm_totals cho toàn bộ khoảng ngày kể từ lúc thành lập công ty', () => {
  assert.match(pageSrc, /fetch\(`\/api\/dashboard\?from=\$\{RACE_START_DATE\}&to=\$\{today\}&lite=1`\)/);
});

// ─── /bao-cao KHÔNG bị đụng — không truyền lite, vẫn nhận đủ như cũ ────────

test('bao-cao/page.tsx: KHÔNG truyền lite — request /api/dashboard của Báo cáo vẫn nhận đủ tonghop/nhan_su_bien_dong/crm_totals như trước (wantCharts=isAdmin khi thiếu lite)', () => {
  const baoCaoSrc = readFileSync(resolve('src/app/bao-cao/page.tsx'), 'utf8');
  assert.doesNotMatch(baoCaoSrc, /lite/);
});
