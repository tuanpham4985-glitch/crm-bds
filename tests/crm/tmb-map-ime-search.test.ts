import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { resolveTrimmedUnitSearch } from '../../src/app/stacking/tmb-map-matching';

// ROOT CAUSE: ô "Tìm mã căn" (TmbMap.tsx) là controlled input thuần
// (value={unitSearch}, onChange={e => setUnitSearch(e.target.value)}) —
// KHÔNG có bất kỳ tracking composition nào (không onCompositionStart/
// onCompositionEnd/isComposing). onChange TỰ NÓ không biến đổi ký tự (không
// uppercase/trim/replace) nên không phải nguồn gây "TDD-" — nhưng vì
// trimmedUnitSearch/matchedUnit/hiệu ứng tự-zoom (dep theo matchedUnit?.unitCode)
// đánh giá LẠI trên MỌI giá trị input tức thời, kể cả text TRUNG GIAN mà
// trình duyệt phát ra qua sự kiện `input` trong lúc IME tiếng Việt/Telex
// đang composition (VD gõ "T" "D" "D" trước khi engine gộp "DD" -> "Đ" —
// DOM/React có thể tạm thấy "TDD" trước compositionend) — hệ quả: search/
// zoom/"Không tìm thấy" phản ứng nhầm với text CHƯA HOÀN CHỈNH, và việc
// React render lại `value` từ state trong lúc composition (dù giá trị y hệt)
// vẫn là điểm rủi ro chuẩn khiến 1 số engine IME (đặc biệt IME nền OS qua
// browser) làm lệch buffer composition, gây "TDD-" hoặc composition hỏng.
//
// FIX (generic, KHÔNG hardcode "TDD"->"TĐ" hay bất kỳ cặp ký tự nào):
// resolveTrimmedUnitSearch(unitSearch, isComposing) — trong lúc composing,
// LUÔN trả về "" (chưa tìm gì), bất kể unitSearch đang chứa gì — trì hoãn
// MỌI đánh giá search/zoom tới compositionend, KHÔNG động vào chính chuỗi
// input (unitSearch vẫn hiển thị NGUYÊN VẸN những gì User đang gõ, chỉ logic
// TÌM KIẾM tạm "đóng băng"). onCompositionEnd đồng bộ lại unitSearch từ
// e.currentTarget.value (DOM authoritative) rồi mở lại composing=false —
// NGAY SAU ĐÓ trimmedUnitSearch/matchedUnit tính lại bình thường y hệt logic
// cũ (.trim(), so khớp không phân biệt hoa/thường).

const source = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');

// ─── A/E. Composition CHƯA xong -> search/zoom KHÔNG chạy trên text trung gian ─

test('A/E. resolveTrimmedUnitSearch(): isComposing=true -> LUÔN trả về "" dù unitSearch đang chứa text trung gian (VD "TDD" trước khi IME gộp thành "TĐ") — search/zoom không đánh giá trên text chưa hoàn chỉnh', () => {
  assert.equal(resolveTrimmedUnitSearch('TDD', true), '');
  assert.equal(resolveTrimmedUnitSearch('TĐ', true), '');
  assert.equal(resolveTrimmedUnitSearch('TĐ55-1', true), '');
  assert.equal(resolveTrimmedUnitSearch('', true), '');
});

// ─── B/F. compositionend -> giá trị cuối ĐÚNG "TĐ55-11", search chạy lại bình thường ─

test('B/F. resolveTrimmedUnitSearch(): isComposing=false (SAU compositionend) -> trả về ĐÚNG unitSearch.trim(), y hệt hành vi cũ — "TĐ55-11" giữ nguyên, không bị rewrite/mất dấu', () => {
  assert.equal(resolveTrimmedUnitSearch('TĐ55-11', false), 'TĐ55-11');
  assert.equal(resolveTrimmedUnitSearch('  TĐ55-11  ', false), 'TĐ55-11'); // trim() y hệt logic cũ
});

// ─── C. NĐ11-62 (mã tiếng Việt khác) hoạt động bình thường ─────────────────

test('C. resolveTrimmedUnitSearch("NĐ11-62", false) -> "NĐ11-62" — mã tiếng Việt bất kỳ, không riêng "TĐ", đều không bị biến đổi khi composing đã kết thúc', () => {
  assert.equal(resolveTrimmedUnitSearch('NĐ11-62', false), 'NĐ11-62');
  assert.equal(resolveTrimmedUnitSearch('NĐ18-20', false), 'NĐ18-20');
});

// ─── D. Mã ASCII thường (không qua IME) không bị ảnh hưởng ─────────────────

test('D. resolveTrimmedUnitSearch("BM55-09", false/true) — mã ASCII thuần: composing=false hoạt động y hệt trước; composing=true (hiếm khi xảy ra với gõ ASCII vì compositionstart/end thường không fire) vẫn tự nhất quán trả về ""', () => {
  assert.equal(resolveTrimmedUnitSearch('BM55-09', false), 'BM55-09');
  assert.equal(resolveTrimmedUnitSearch('BM55-09', true), '');
});

// ─── G. Backspace/Delete/hyphen không làm hỏng buffer composition ──────────

test('G. Trình xử lý cập nhật state tìm kiếm KHÔNG biến đổi ký tự nào (không uppercase/trim/replace ngay trên giá trị DOM) — Backspace/Delete/"-" đi qua y nguyên, KHÔNG có logic nào can thiệp giữa DOM và state khiến buffer IME bị ghi đè. (Đã đổi từ onChange={e => setUnitSearch(e.target.value)} sang onInput={e => setUnitSearch(e.currentTarget.value)} — input giờ UNCONTROLLED, xem TMB_UNIKEY_CONTROLLED_INPUT_FIX + tests/crm/tmb-map-unikey-input.test.ts — nhưng bất biến "không transform" vẫn giữ nguyên.)', () => {
  assert.match(source, /onInput=\{e => setUnitSearch\(e\.currentTarget\.value\)\}/);
  const onInputLine = source.match(/onInput=\{[^}]*\}/)![0];
  assert.ok(!onInputLine.includes('toUpperCase'));
  assert.ok(!onInputLine.includes('replace('));
  assert.ok(!onInputLine.includes('trim('));
});

test('G2. Không hardcode sửa ký tự nào kiểu "TDD"->"TĐ"/"DD"->"Đ" — fix hoàn toàn generic, không chứa bất kỳ literal thay thế ký tự tiếng Việt cụ thể nào. ("TDD" CÓ xuất hiện trong file — chỉ trong comment giải thích root cause UniKey bằng ví dụ, xem tests/crm/tmb-map-unikey-input.test.ts test "C" kiểm tra kỹ hơn phần code thật.)', () => {
  assert.ok(!source.includes("'DD'"));
  assert.ok(!source.includes('"DD"'));
  assert.ok(!source.includes("replace(/D/g"));
});

// ─── Composition wiring có mặt đúng vị trí, đúng hành vi ───────────────────

test('Wiring: input có onCompositionStart={() => setIsComposing(true)} và onCompositionEnd đồng bộ lại unitSearch từ e.currentTarget.value RỒI mới setIsComposing(false)', () => {
  assert.match(source, /onCompositionStart=\{\(\) => setIsComposing\(true\)\}/);
  const compEndBlock = source.match(/onCompositionEnd=\{e => \{[\s\S]*?\n\s*\}\}/);
  assert.ok(compEndBlock, 'không tìm thấy onCompositionEnd handler');
  assert.match(compEndBlock![0], /setIsComposing\(false\);/);
  assert.match(compEndBlock![0], /setUnitSearch\(e\.currentTarget\.value\);/);
});

test('Wiring: trimmedUnitSearch dùng resolveTrimmedUnitSearch(unitSearch, isComposing) — import từ tmb-map-matching.ts, KHÔNG viết lại logic gating lần 2 trong TmbMap.tsx', () => {
  assert.match(source, /import \{ buildMaCanIndex, resolveTmbUnitState, resolveTrimmedUnitSearch, type TmbUnitState \} from '\.\/tmb-map-matching';/);
  assert.match(source, /const trimmedUnitSearch = resolveTrimmedUnitSearch\(unitSearch, isComposing\);/);
});

// ─── H. Search/zoom logic hiện có KHÔNG đổi ngoài nguồn trimmedUnitSearch ──

test('H1. matchedUnit useMemo: vẫn ĐÚNG công thức cũ (available + so khớp không phân biệt hoa/thường trên trimmedUnitSearch) — chỉ NGUỒN trimmedUnitSearch đổi (qua resolveTrimmedUnitSearch), công thức matching không đổi', () => {
  assert.match(source, /const matchedUnit = useMemo\(\(\) => \{\s*\n\s*if \(!trimmedUnitSearch\) return null;\s*\n\s*const norm = trimmedUnitSearch\.toLowerCase\(\);\s*\n\s*return units\.find\(u => u\.available && u\.unitCode\.toLowerCase\(\) === norm\) \?\? null;\s*\n\s*\}, \[units, trimmedUnitSearch\]\);/);
});

test('H2. Hiệu ứng tự động zoom/pan tới marker khi tìm thấy (dep theo matchedUnit?.unitCode, SEARCH_FOCUS_ZOOM) KHÔNG đổi — vẫn y hệt logic cũ, chỉ được gate gián tiếp qua trimmedUnitSearch (composing -> matchedUnit=null -> effect tự return sớm, không cần sửa effect này)', () => {
  assert.match(source, /useEffect\(\(\) => \{\s*\n\s*if \(!matchedUnit\) return;/);
  assert.match(source, /setZoomMultiplier\(z => Math\.max\(z, SEARCH_FOCUS_ZOOM\)\);/);
  assert.match(source, /\}, \[matchedUnit\?\.unitCode\]\);/);
});

test('H3. unitSearchNotFound KHÔNG đổi công thức — vẫn trimmedUnitSearch.length > 0 && !matchedUnit (giờ tự "im lặng" trong lúc composing vì trimmedUnitSearch rỗng, không cần sửa dòng này)', () => {
  assert.match(source, /const unitSearchNotFound = trimmedUnitSearch\.length > 0 && !matchedUnit;/);
});

test('H4. normalizeUnitCode/buildMaCanIndex/resolveTmbUnitState (tmb-map-matching.ts) KHÔNG đổi — fix IME hoàn toàn tách biệt khỏi luồng match Bảng hàng/mapping/profile', () => {
  const matchingSource = fs.readFileSync('src/app/stacking/tmb-map-matching.ts', 'utf8');
  assert.match(matchingSource, /export function normalizeUnitCode\(code: string\): string \{\s*\n\s*return code\.trim\(\)\.toUpperCase\(\)\.replace\(\/\\s\+\/g, ''\);\s*\n\s*\}/);
  assert.match(matchingSource, /export function resolveTmbUnitState\(unitCode: string, index: ReadonlyMap<string, StackingListRow\[\]>\): TmbUnitState \{/);
});
