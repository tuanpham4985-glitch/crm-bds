import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Root cause đã audit (GOOGLE_SHEETS_429_ROOT_CAUSE_PROVEN): settings-store.ts
// TRƯỚC ĐÂY tự dựng GoogleSpreadsheet + JWT + doc.loadInfo() RIÊNG cho MỖI
// lần đọc/ghi SETTINGS, bỏ qua hoàn toàn cache 60s (cachedDoc) đã có sẵn
// trong google-sheets.ts cho CÙNG 1 document (cùng GOOGLE_SHEET_ID/
// credentials) — 4 consumer khác nhau (crm-module, navigation-config,
// settings/logo, crm-access) mỗi lần gọi đều tốn thêm 1 loadInfo() thật
// không cần thiết. Fix: settings-store.ts dùng LẠI getDoc() đã export từ
// google-sheets.ts thay vì tự dựng kết nối thứ 2.
//
// Không có mock Google Sheets API thật trong repo (getDoc/getSettingsSheet
// gọi network thật) — theo ĐÚNG convention test hiện có của project (đọc
// SOURCE THẬT, assert cấu trúc/wiring bằng regex, không mock network).

const settingsStoreSource = fs.readFileSync('src/lib/settings-store.ts', 'utf8');
const googleSheetsSource = fs.readFileSync('src/lib/google-sheets.ts', 'utf8');

// ─── google-sheets.ts: getDoc() PHẢI được export để settings-store.ts dùng lại ─

test('google-sheets.ts: getDoc() được export (trước đây module-private) — settings-store.ts cần import được', () => {
  assert.match(googleSheetsSource, /export async function getDoc\(\): Promise<GoogleSpreadsheet> \{/);
});

test('google-sheets.ts: cache 60s (cachedDoc/lastLoadTime/CACHE_DURATION) bên trong getDoc() KHÔNG bị đổi bởi việc export', () => {
  assert.match(googleSheetsSource, /let cachedDoc: GoogleSpreadsheet \| null = null;/);
  assert.match(googleSheetsSource, /let lastLoadTime = 0;/);
  assert.match(googleSheetsSource, /const CACHE_DURATION = 60000;/);
  assert.match(googleSheetsSource, /if \(cachedDoc && \(now - lastLoadTime < CACHE_DURATION\)\) \{\s*\n\s*return cachedDoc;/);
});

// ─── settings-store.ts: dùng LẠI getDoc() được share — KHÔNG tự dựng kết nối riêng ─

test('settings-store.ts: import getDoc từ ./google-sheets — dùng chung kết nối đã cache, KHÔNG tự dựng riêng', () => {
  assert.match(settingsStoreSource, /import \{ getDoc \} from '\.\/google-sheets';/);
});

test('settings-store.ts: KHÔNG còn tự import GoogleSpreadsheet/JWT trực tiếp — không còn kết nối thứ 2', () => {
  assert.doesNotMatch(settingsStoreSource, /import \{ GoogleSpreadsheet \} from 'google-spreadsheet'/);
  assert.doesNotMatch(settingsStoreSource, /import \{ JWT \} from 'google-auth-library'/);
});

test('settings-store.ts: KHÔNG còn hàm getJWT() riêng (JWT construction đã chuyển vào getDoc() dùng chung)', () => {
  assert.doesNotMatch(settingsStoreSource, /function getJWT\(\)/);
});

test('settings-store.ts: getSettingsSheet() gọi await getDoc() — KHÔNG tự "new GoogleSpreadsheet(...)"', () => {
  const fnBlock = settingsStoreSource.match(/export async function getSettingsSheet\(\) \{[\s\S]*?\n\}/)![0];
  assert.match(fnBlock, /const doc = await getDoc\(\);/);
  assert.doesNotMatch(fnBlock, /new GoogleSpreadsheet\(/, 'không được tự dựng GoogleSpreadsheet thứ 2 — phải dùng doc đã cache từ getDoc()');
});

test('getSettingsSheet() KHÔNG còn tự gọi doc.loadInfo() — loadInfo() giờ nằm bên trong getDoc() dùng chung (chỉ chạy khi cache miss)', () => {
  const fnBlock = settingsStoreSource.match(/export async function getSettingsSheet\(\) \{[\s\S]*?\n\}/)![0];
  assert.doesNotMatch(fnBlock, /doc\.loadInfo\(\)/, 'loadInfo() thật trùng lặp đã bị loại bỏ khỏi settings-store.ts, đã có sẵn trong getDoc()');
});

// ─── Hành vi đọc/ghi SETTINGS hiện có PHẢI giữ nguyên (chỉ đổi CÁCH lấy `doc`) ─

test('getSettingsSheet(): vẫn tự tạo sheet SETTINGS nếu chưa tồn tại, vẫn loadHeaderRow() trước khi trả về — hành vi KHÔNG đổi', () => {
  const fnBlock = settingsStoreSource.match(/export async function getSettingsSheet\(\) \{[\s\S]*?\n\}/)![0];
  assert.match(fnBlock, /doc\.sheetsByTitle\[SETTINGS_SHEET\]/);
  assert.match(fnBlock, /doc\.addSheet\(\{ title: SETTINGS_SHEET, headerValues: \['key', 'value'\] \}\)/);
  assert.match(fnBlock, /sheet\.loadHeaderRow\(\)/);
  assert.match(fnBlock, /return sheet;/);
});

test('getSettingValue()/setSettingValue(): logic đọc/ghi qua getSettingsSheet() + getRows()/addRow()/.save() giữ NGUYÊN — chỉ đổi nguồn `doc`, không đổi field/semantics đọc-ghi', () => {
  assert.match(settingsStoreSource, /export async function getSettingValue\(key: string\): Promise<string \| null> \{\s*\n\s*const sheet = await getSettingsSheet\(\);\s*\n\s*const rows = await sheet\.getRows\(\);/);
  assert.match(settingsStoreSource, /export async function setSettingValue\(key: string, value: string\): Promise<void> \{\s*\n\s*const sheet = await getSettingsSheet\(\);\s*\n\s*const rows = await sheet\.getRows\(\);/);
  assert.match(settingsStoreSource, /existing\.set\('value', value\);\s*\n\s*await existing\.save\(\);/);
  assert.match(settingsStoreSource, /await sheet\.addRow\(\{ key, value \}\);/);
});

// ─── Không mở rộng phạm vi ngoài yêu cầu ────────────────────────────────────

test('Không đổi STACKING_CONFIG caching, pending-count polling, SWR/revalidate, hay bất kỳ logic TMB/DB/Blob nào — chỉ 2 file này bị đụng tới', () => {
  assert.doesNotMatch(settingsStoreSource, /STACKING_CONFIG|pending-count|revalidateOnFocus|prisma|Blob/i);
});
