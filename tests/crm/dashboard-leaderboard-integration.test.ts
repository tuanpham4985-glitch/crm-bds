import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Dashboard "BẢNG XẾP HẠNG" (doanh_thu_theo_sale) — integration giữa route
// (src/app/api/dashboard/route.ts) và authoritative calculation
// (src/lib/dashboard-travel-sales.ts). Route handler không unit-test trực
// tiếp được (Next.js request context + Sheets/Postgres I/O thật) — cùng kỹ
// thuật source-regex đã dùng xuyên suốt repo (private-group-api.test.ts,
// v.v.): đọc SOURCE THẬT rồi khoá lại đúng wiring, để không ai vô tình sửa
// route quay lại tính raw transaction total (regression đã audit + fix).
// Bản thân CÔNG THỨC (golden case Trần Võ Khánh, ratio semantics, Đối tác)
// đã unit-test đầy đủ ở tests/crm/dashboard-travel-sales.test.ts — file này
// CHỈ khoá phần WIRING (route dùng đúng hàm nào, filter nào).

const ROUTE_PATH = 'src/app/api/dashboard/route.ts';

function read(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

test('doanh_thu_theo_sale (contract cũ, KHÔNG đổi) tiếp tục nhận giá trị từ selectedLeaderboard — UI/API contract giữ nguyên (test bắt buộc #8)', () => {
  const src = read(ROUTE_PATH);
  const matches = src.match(/doanh_thu_theo_sale:\s*selectedLeaderboard,/g) || [];
  assert.equal(matches.length, 2, 'cả 2 nhánh isAdmin/non-admin đều phải dùng selectedLeaderboard, không đổi field name/shape');
});

test('selectedLeaderboard dùng travelSalesLeaderboard (authoritative, KHÔNG phải raceLeaderboard cũ) cho mọi mode trừ "standard" — ngăn regression quay lại raw transaction total (test bắt buộc #8)', () => {
  const src = read(ROUTE_PATH);
  assert.match(src, /const selectedLeaderboard = reportMode === 'standard' \? leaderboard : travelSalesLeaderboard;/);
});

// DASHBOARD_RACE_LEADERBOARD_LIGHTWEIGHT_ENDPOINT — display-rule step (loại
// Nghỉ việc/CTV + enrich avatar_url) tách từ route.ts sang
// applyLeaderboardDisplayRules() (dashboard-travel-sales.ts) — cùng
// authoritative helper dùng chung với /api/dashboard/leaderboard (endpoint
// mới), không còn 2 bản logic song song. 4 test dưới đây cập nhật đúng
// wiring MỚI (route.ts gọi helper, KHÔNG còn tự inline filter/map) — hành vi
// (loại Nghỉ việc/CTV, enrich avatar) không đổi, chỉ đổi CHỖ đặt code — xem
// tests/dashboard/race-leaderboard.test.ts cho equivalence proof + unit test
// của chính applyLeaderboardDisplayRules().
test('travelSalesLeaderboard được tính từ buildTravelSalesLeaderboard(tongHopRows) rồi applyLeaderboardDisplayRules() — ĐÚNG 2 hàm authoritative trong dashboard-travel-sales.ts, KHÔNG tự tính lại (test bắt buộc #8)', () => {
  const src = read(ROUTE_PATH);
  assert.match(src, /import \{ buildTravelSalesLeaderboard, applyLeaderboardDisplayRules \} from '@\/lib\/dashboard-travel-sales';/);
  assert.match(src, /const travelSalesLeaderboard = applyLeaderboardDisplayRules\(buildTravelSalesLeaderboard\(tongHopRows\), allEmployeesRaw\);/);
});

test('buildRaceSaleLeaderboard (hàm cũ, tính raw gia_tri không lọc ratio) KHÔNG còn tồn tại như function definition — chỉ còn trong comment giải thích lịch sử (regression guard, test bắt buộc #8)', () => {
  const src = read(ROUTE_PATH);
  assert.doesNotMatch(src, /const buildRaceSaleLeaderboard = /);
});

test('travelSalesLeaderboard loại nhân viên "Nghỉ việc"/"CTV" qua applyLeaderboardDisplayRules() (dashboard-travel-sales.ts) — cùng exclusion rule cũ, giờ nằm trong helper dùng chung (test bắt buộc #5/#6)', () => {
  const helperSrc = read('src/lib/dashboard-travel-sales.ts');
  const idx = helperSrc.indexOf('export function applyLeaderboardDisplayRules');
  assert.ok(idx > -1);
  const after = helperSrc.slice(idx, idx + 800);
  assert.match(after, /\.filter\(entry => !excludedNames\.has\(entry\.nhan_vien\)\)/);
});

test('leaderboardExcludedNames = employees có trang_thai "Nghỉ việc" HOẶC "CTV" (không phải AND, không phải chỉ 1 trong 2) — cùng Set đã release, không bị đổi bởi task này', () => {
  const src = read(ROUTE_PATH);
  assert.match(src, /\.filter\(nv => nv\.trang_thai === 'Nghỉ việc' \|\| nv\.trang_thai === 'CTV'\)/);
});

test('filter là PHỦ ĐỊNH (!excludedNames.has) — mặc định GIỮ LẠI mọi Sale không nằm trong danh sách loại, KHÔNG phải allowlist (Sale đang hoạt động vẫn được tính, test bắt buộc #7)', () => {
  const helperSrc = read('src/lib/dashboard-travel-sales.ts');
  const idx = helperSrc.indexOf('.filter(entry => !excludedNames.has(entry.nhan_vien))');
  assert.ok(idx > -1, 'phải là phủ định (loại trừ), không phải allowlist dương');
});

test('avatar_url vẫn được enrich sau khi tính travelSalesLeaderboard (nay qua applyLeaderboardDisplayRules) — giữ nguyên UI contract (SafeAvatar trên Dashboard, không bị mất khi đổi calculation)', () => {
  const helperSrc = read('src/lib/dashboard-travel-sales.ts');
  const idx = helperSrc.indexOf('export function applyLeaderboardDisplayRules');
  const after = helperSrc.slice(idx, idx + 800);
  assert.match(after, /allEmployees\.find\(nv => nv\.ho_ten === entry\.nhan_vien\)/);
  assert.match(after, /avatar_url: emp\.avatar_url/);
});

test('"standard" mode (tongHopRows KHÔNG được fetch, xem điều kiện Promise.all) vẫn giữ nguyên leaderboard Pipeline-based cũ — KHÔNG đổi hành vi mode không liên quan tới task này', () => {
  const src = read(ROUTE_PATH);
  assert.match(src, /reportMode !== 'standard'\s*\n\s*\? getTongHopGiaoDich/);
});
