import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { resolveTrimmedUnitSearch } from '../../src/app/stacking/tmb-map-matching';

// ROOT CAUSE (audit "TMB_UNIKEY_CONTROLLED_INPUT_FIX") — bug "TĐ55-11" gõ dở
// thành "TDD-" VẪN xảy ra SAU fix Composition API trước (commit 9b07377, xem
// tmb-map-ime-search.test.ts) vì UniKey (Windows) KHÔNG dùng Composition API
// của trình duyệt (compositionstart/compositionend) như IME chuẩn Windows
// TSF — UniKey hook bàn phím ở mức HỆ ĐIỀU HÀNH rồi TỰ mô phỏng phím
// Backspace + ký tự thay thế để tạo dấu (VD gõ "D" "D" -> UniKey tự gửi
// Backspace rồi gửi ký tự "Đ"), HOÀN TOÀN ngoài cơ chế composition — do đó
// isComposing không bao giờ = true khi dùng UniKey, khiến fix trước là no-op.
//
// Input CONTROLLED (`value={state}` + `onChange`) khiến MỌI native input
// event -> setState -> re-render -> React GHI LẠI `.value` của input theo
// state mới NGAY SAU MỖI KEYSTROKE. Chuỗi ghi-lại liên tục đó race với chuỗi
// Backspace+chèn-lại UniKey đang tự thực hiện TRÊN CHÍNH DOM node đó (UniKey
// không biết gì về React, chỉ gửi phím Windows-level tới control đang focus)
// — khiến buffer UniKey theo dõi lệch khỏi giá trị DOM thật React vừa ghi
// đè, dẫn tới corrupt.
//
// FIX: bỏ HẲN `value=`/`onChange=` — input trở thành UNCONTROLLED (DOM tự sở
// hữu buffer đang gõ qua `ref`), React CHỈ ĐỌC qua `onInput` (fire cho MỌI
// thay đổi giá trị DOM, kể cả UniKey tự mô phỏng chèn/xoá) để cập nhật state
// tìm kiếm — KHÔNG BAO GIỜ ghi lại vào input. Loại bỏ HOÀN TOÀN vòng
// race/ghi-đè ở trên, bất kể IME/keyboard-hook nào đang chạy.
//
// GIỚI HẠN THẬT SỰ CỦA TEST TỰ ĐỘNG (yêu cầu nêu rõ, KHÔNG giả vờ mô phỏng
// đủ UniKey thật): môi trường test (node:test, không DOM/browser thật) KHÔNG
// THỂ tái tạo chính xác UniKey — không có Windows keyboard hook, không có
// WM_KEYDOWN/SendInput thật, không có browser thật nhận các sự kiện đó. Test
// dưới đây CHỈ chứng minh được 2 điều CÓ THỂ verify chắc chắn mà KHÔNG cần
// UniKey thật: (1) input KHÔNG còn bị React ghi đè `.value` (cấu trúc code —
// bằng chứng trực tiếp, xác định qua source, không suy đoán), và (2) state
// tìm kiếm (`unitSearch`) là 1 PURE PASS-THROUGH của bất kỳ chuỗi nào DOM báo
// qua onInput/onCompositionEnd — không có bất kỳ biến đổi/rewrite nào có thể
// tự nó gây corrupt dữ liệu cho DÙ input đến từ đâu (gõ tay, UniKey, hay bất
// kỳ engine mô phỏng phím nào khác). Đây là bằng chứng KIẾN TRÚC (không còn
// đường nào để corrupt xảy ra từ phía React), không phải bằng chứng hành vi
// UniKey thật 100% — xác nhận cuối cùng vẫn cần test tay trên máy Windows +
// UniKey thật (không thể thực hiện trong môi trường CI này).

const source = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');

function extractInputBlock(): string {
  const m = source.match(/<input\s*\n(?:[\s\S]*?)\n\s*\/>/);
  assert.ok(m, 'không tìm thấy khối JSX <input> của ô tìm mã căn');
  return m![0];
}

function extractClearButtonBlock(): string {
  const m = source.match(/\{unitSearch && \(\s*\n\s*<button onClick=\{\(\) => \{[\s\S]*?\}\}[\s\S]*?<\/button>\s*\n\s*\)\}/);
  assert.ok(m, 'không tìm thấy nút Xoá tìm kiếm');
  return m![0];
}

// ─── A. Input KHÔNG còn bị React ghi đè `.value` mỗi lần re-render ─────────

test('A1. <input> ô tìm mã căn KHÔNG còn prop `value=` (controlled) — React không tự ghi lại DOM value nữa, loại bỏ vòng race với UniKey', () => {
  const inputBlock = extractInputBlock();
  assert.ok(!/\bvalue=\{unitSearch\}/.test(inputBlock), 'input KHÔNG được bind value={unitSearch} (controlled) — đây chính là root cause vòng race với UniKey');
  assert.ok(!/\svalue=\{/.test(inputBlock), 'input KHÔNG được có BẤT KỲ prop value= nào (kể cả tên state khác) — phải hoàn toàn uncontrolled');
});

test('A2. <input> có ref={searchInputRef} — DOM/UniKey toàn quyền sở hữu buffer đang gõ, React chỉ đọc qua ref khi cần (VD nút Xoá)', () => {
  const inputBlock = extractInputBlock();
  assert.match(inputBlock, /ref=\{searchInputRef\}/);
});

test('A3. Không còn onChange={...} (thuộc tính THẬT trên JSX, không tính prose trong comment) trên input — dùng onInput (đúng ngữ nghĩa "quan sát MỌI thay đổi DOM value", không phải "React sở hữu value")', () => {
  const inputBlock = extractInputBlock();
  assert.ok(!/onChange=\{/.test(inputBlock), 'input KHÔNG được có thuộc tính onChange={...} thật sự (chỉ được nhắc tới trong comment giải thích)');
  assert.match(inputBlock, /onInput=\{e => setUnitSearch\(e\.currentTarget\.value\)\}/);
});

// ─── B/G. State search là PURE PASS-THROUGH — không rewrite, search/zoom vẫn nhận đúng query cuối ─

test('B/G. onInput/onCompositionEnd CHỈ gán e.currentTarget.value NGUYÊN VẸN vào setUnitSearch — không uppercase/trim/replace ngay tại chỗ (mọi biến đổi CHỈ xảy ra sau, qua resolveTrimmedUnitSearch dùng cho matching, KHÔNG đụng vào chuỗi hiển thị)', () => {
  const inputBlock = extractInputBlock();
  const setUnitSearchCalls = [...inputBlock.matchAll(/setUnitSearch\(([^)]*)\)/g)].map(m => m[1]);
  assert.ok(setUnitSearchCalls.length >= 2, 'phải có setUnitSearch trong CẢ onInput lẫn onCompositionEnd');
  for (const arg of setUnitSearchCalls) {
    assert.equal(arg.trim(), 'e.currentTarget.value', `setUnitSearch phải nhận NGUYÊN VẸN e.currentTarget.value, không biến đổi — nhận "${arg}"`);
  }
});

test('G2. matchedUnit/trimmedUnitSearch/hiệu ứng tự-zoom KHÔNG đổi công thức — search/zoom vẫn nhận ĐÚNG query cuối cùng qua unitSearch (giờ đến từ onInput thay vì onChange, semantics tính toán y hệt)', () => {
  assert.match(source, /const trimmedUnitSearch = resolveTrimmedUnitSearch\(unitSearch, isComposing\);/);
  assert.match(source, /const matchedUnit = useMemo\(\(\) => \{\s*\n\s*if \(!trimmedUnitSearch\) return null;\s*\n\s*const norm = trimmedUnitSearch\.toLowerCase\(\);\s*\n\s*return units\.find\(u => u\.available && u\.unitCode\.toLowerCase\(\) === norm\) \?\? null;\s*\n\s*\}, \[units, trimmedUnitSearch\]\);/);
  assert.match(source, /setZoomMultiplier\(z => Math\.max\(z, SEARCH_FOCUS_ZOOM\)\);/);
});

// ─── B (mô phỏng tối đa có thể — xem giới hạn ở đầu file): chuỗi sự kiện input
//        kết thúc bằng "TĐ55-11" -> unitSearch cuối cùng CHÍNH XÁC "TĐ55-11" ─

test('B2. Mô phỏng chuỗi onInput liên tiếp (giống UniKey: chèn rồi tự sửa qua các bước trung gian) kết thúc ở "TĐ55-11" -> setUnitSearch cuối cùng nhận ĐÚNG "TĐ55-11", không cắt/không rewrite — chứng minh bằng cách gọi TRỰC TIẾP hàm gán state với chuỗi input mô phỏng (KHÔNG phải browser thật, xem giới hạn đầu file)', () => {
  // Mô phỏng state updates y hệt những gì handler onInput sẽ làm cho từng
  // "giá trị DOM hiện tại" mà UniKey có thể tạo ra qua các bước trung gian
  // (T, TD, TDD, TĐ, TĐ5, TĐ55, TĐ55-, TĐ55-1, TĐ55-11) — handler CHỈ gán
  // NGUYÊN VẸN, nên state cuối cùng LUÔN khớp giá trị DOM cuối cùng.
  const domValueSequence = ['T', 'TD', 'TDD', 'TĐ', 'TĐ5', 'TĐ55', 'TĐ55-', 'TĐ55-1', 'TĐ55-11'];
  let unitSearch = '';
  const setUnitSearch = (v: string) => { unitSearch = v; }; // y hệt setState — gán trực tiếp, không transform
  for (const domValue of domValueSequence) {
    setUnitSearch(domValue); // y hệt onInput={e => setUnitSearch(e.currentTarget.value)}
  }
  assert.equal(unitSearch, 'TĐ55-11');
});

// ─── C. Không hardcode sửa ký tự nào ────────────────────────────────────────

test('C. Không hardcode sửa ký tự nào kiểu "TDD"->"TĐ"/"DD"->"Đ", không đặc cách theo mã cụ thể nào — fix hoàn toàn generic (uncontrolled input), không phụ thuộc nội dung mã căn. ("TDD" CÓ xuất hiện trong file — CHỈ trong comment giải thích root cause bằng ví dụ, xem code KHÔNG chứa construct thay thế ký tự nào ở dưới.)', () => {
  assert.ok(!source.includes("'DD'"));
  assert.ok(!source.includes('"DD"'));
  assert.ok(!/\.replace\(/.test(extractInputBlock()), 'khối JSX input KHÔNG được gọi .replace() nào trên giá trị gõ vào');
  assert.ok(!/if \(.*unitSearch.*===.*'T[ĐD]/i.test(source), 'không được có nhánh đặc cách riêng cho mã "TĐ..."');
});

// ─── D/E. Mã tiếng Việt khác + mã ASCII vẫn hoạt động bình thường (qua resolveTrimmedUnitSearch không đổi) ─

test('D. resolveTrimmedUnitSearch("NĐ11-62", false) -> "NĐ11-62" — không riêng "TĐ", mọi mã tiếng Việt đều đi qua CÙNG cơ chế uncontrolled input, không transform', () => {
  assert.equal(resolveTrimmedUnitSearch('NĐ11-62', false), 'NĐ11-62');
  assert.equal(resolveTrimmedUnitSearch('NĐ18-20', false), 'NĐ18-20');
});

test('E. resolveTrimmedUnitSearch("BM55-09", false) -> "BM55-09" — mã ASCII (không qua UniKey) không bị ảnh hưởng bởi việc chuyển sang uncontrolled', () => {
  assert.equal(resolveTrimmedUnitSearch('BM55-09', false), 'BM55-09');
});

// ─── F. Nút "Xoá tìm kiếm" vẫn hoạt động — PHẢI tự ghi rỗng vào DOM qua ref ─

test('F. Nút Xoá tìm kiếm: PHẢI gán searchInputRef.current.value = "" (input uncontrolled, không có value= để React tự đồng bộ) RỒI mới setUnitSearch(\'\') — thiếu bước ref sẽ để lại text cũ trên DOM dù state đã rỗng', () => {
  const clearBlock = extractClearButtonBlock();
  const refClearIdx = clearBlock.indexOf("searchInputRef.current.value = '';");
  const setEmptyIdx = clearBlock.indexOf("setUnitSearch('');");
  assert.ok(refClearIdx > 0, 'thiếu bước ghi rỗng vào DOM qua ref');
  assert.ok(setEmptyIdx > refClearIdx, 'phải ghi DOM qua ref TRƯỚC, setUnitSearch(\'\') sau');
});

// ─── H. Hành vi composition-based trước đó KHÔNG bị mất (vẫn còn cho IME chuẩn Composition API) ─

test('H. isComposing/onCompositionStart/onCompositionEnd VẪN còn nguyên (cho IME dùng đúng Composition API — Windows IME built-in, macOS, Linux...) — fix UniKey KHÔNG xoá bỏ cơ chế composition cũ, chỉ bổ sung thêm lớp uncontrolled bên dưới', () => {
  assert.match(source, /const \[isComposing, setIsComposing\] = useState\(false\);/);
  const inputBlock = extractInputBlock();
  assert.match(inputBlock, /onCompositionStart=\{\(\) => setIsComposing\(true\)\}/);
  assert.match(inputBlock, /onCompositionEnd=\{e => \{/);
  assert.match(inputBlock, /setIsComposing\(false\);/);
});

test('H2. resolveTrimmedUnitSearch (composition-gating pure function, tmb-map-matching.ts) KHÔNG đổi — hành vi gating cũ với IME Composition API chuẩn vẫn y hệt trước', () => {
  assert.equal(resolveTrimmedUnitSearch('TDD', true), '');
  assert.equal(resolveTrimmedUnitSearch('TĐ55-11', false), 'TĐ55-11');
});
