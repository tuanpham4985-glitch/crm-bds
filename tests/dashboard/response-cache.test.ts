import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// Batch 1 item 1 — Dashboard "double-fetch" — cache NGUYÊN response đã tính
// theo tổ hợp tham số ảnh hưởng output, TTL ngắn (mem-cache.ts cached(),
// KHÔNG hạ tầng mới) — bảo vệ đúng trường hợp request TRÙNG khoá thật sự
// (2 tab/2 người cùng xem 1 view trong cùng cửa sổ TTL, StrictMode double-
// invoke dev). Race fetch (raceData, khoảng ngày cố định từ lúc thành lập
// công ty) và main fetch (period đang chọn) CỐ Ý KHÔNG merge — 2 khoảng
// ngày khác nhau phục vụ 2 widget khác nhau, merge đòi đổi hợp đồng API
// (ngoài phạm vi Batch 1, không redesign).

const src = readFileSync(resolve('src/app/api/dashboard/route.ts'), 'utf8');

test('route.ts: import cached() từ mem-cache.ts (reuse infra sẵn có, không tự chế cache riêng)', () => {
  assert.match(src, /import \{ cached \} from '@\/lib\/mem-cache';/);
});

test('route.ts: TTL ngắn (không quá 60s) — tránh biến "gần real-time" hiện có thành stale lâu', () => {
  const m = src.match(/const DASHBOARD_RESPONSE_TTL_MS = (\d+)(?:_(\d+))?;/);
  assert.ok(m, 'phải khai báo DASHBOARD_RESPONSE_TTL_MS');
  const ttl = Number(m![1] + (m![2] ?? ''));
  assert.ok(ttl > 0 && ttl <= 60_000, `TTL ${ttl}ms phải nằm trong (0, 60000]`);
});

test('route.ts: cache key gồm ĐỦ mọi tham số ảnh hưởng output (period/compare/reportMode/from/to/lite/isAdmin) — thiếu 1 cái sẽ trả nhầm response tổ hợp khác', () => {
  const keyBlockStart = src.indexOf('const dashboardCacheKey = [');
  const keyBlockEnd = src.indexOf('].join(\':\');', keyBlockStart);
  assert.ok(keyBlockStart > -1 && keyBlockEnd > keyBlockStart);
  const keyBlock = src.slice(keyBlockStart, keyBlockEnd);
  for (const part of ['period', 'compare', 'reportMode', 'fromParam', 'toParam', 'lite', 'isAdmin']) {
    assert.ok(keyBlock.includes(part), `cache key thiếu tham số "${part}" — có thể trả nhầm response giữa 2 tổ hợp khác nhau`);
  }
});

test('route.ts: isAdmin PHẢI nằm trong cache key — admin và non-admin nhận SHAPE response khác hẳn nhau (tonghop/crm_totals/nhan_su_bien_dong chỉ admin có), lẫn cache giữa 2 vai trò là rò rỉ dữ liệu/sai hiển thị nghiêm trọng', () => {
  const keyBlockStart = src.indexOf('const dashboardCacheKey = [');
  const keyBlockEnd = src.indexOf('].join(\':\');', keyBlockStart);
  const keyBlock = src.slice(keyBlockStart, keyBlockEnd);
  assert.match(keyBlock, /isAdmin \? 'admin' : 'user'/);
});

test('route.ts: toàn bộ Promise.all fetch + aggregation nằm BÊN TRONG cached() — cache bọc đúng phần tính toán tốn kém, không chỉ bọc phần rẻ', () => {
  const iCachedStart = src.indexOf('const data = await cached(dashboardCacheKey, DASHBOARD_RESPONSE_TTL_MS, async ()');
  const iPromiseAll = src.indexOf('await Promise.all([');
  const iReturnAdmin = src.indexOf('return isAdmin ? {');
  const iCachedEnd = src.indexOf('return NextResponse.json({ success: true, data });');
  assert.ok(iCachedStart > -1 && iPromiseAll > -1 && iReturnAdmin > -1 && iCachedEnd > -1);
  assert.ok(iCachedStart < iPromiseAll && iPromiseAll < iReturnAdmin && iReturnAdmin < iCachedEnd,
    'thứ tự bắt buộc: mở cached() -> Promise.all fetch -> return kết quả tính -> đóng cached()');
});

test('route.ts: không đọc "request" (NextRequest) bên trong khối cached() — mọi giá trị cần thiết (period/compare/...) đã trích xuất ra biến TRƯỚC khi mở cached(), tránh đóng gói nhầm 1 object gắn với request cụ thể vào cache dùng chung', () => {
  const iCachedStart = src.indexOf('const data = await cached(dashboardCacheKey, DASHBOARD_RESPONSE_TTL_MS, async ()');
  const iCachedEnd = src.indexOf('return NextResponse.json({ success: true, data });');
  const cachedBody = src.slice(iCachedStart, iCachedEnd);
  assert.doesNotMatch(cachedBody, /\brequest\./, 'không được đọc request.* bên trong callback truyền cho cached() — phá vỡ tính "thuần theo cache key" của cache');
});

test('route.ts: response CUỐI CÙNG (NextResponse.json) vẫn nằm NGOÀI cached() — không cache nguyên NextResponse (tránh chia sẻ nhầm object response giữa các request)', () => {
  const iCachedEnd = src.indexOf('return NextResponse.json({ success: true, data });');
  const before = src.slice(Math.max(0, iCachedEnd - 40), iCachedEnd);
  assert.match(before, /\}\);\s*/, 'phải có 1 dấu đóng "});" (đóng cached()) ngay trước return NextResponse.json — chỉ cache "data" (object thuần), không cache NextResponse');
});
