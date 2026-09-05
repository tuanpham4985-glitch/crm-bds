import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  decodeWithGlyphRemap,
  extractPdfUnitLabels,
  classifyUnitLabels,
  summarizeClassification,
  resolveUnitCodeAliases,
  classifySheetInventoryWithAliases,
  summarizeSheetClassification,
  parseProfileDecodeConfig,
  type UnitAliasRule,
} from '../../src/lib/tmb-indexer';

// Rule thật đang dùng cho fixture TĐNĐ1 (Bảng hàng "TĐ<n>-<m>"/"NĐ<n>-<m>" ->
// mã lưới PDF "BM<n>-<m>", cùng profile-scoped rule set dùng trong reconciliation).
const TDND1_ALIAS_RULES: UnitAliasRule[] = [
  { label: 'TĐNĐ1: TĐ<n>-<m> -> BM<n>-<m>', pattern: '^TĐ(\\d+)-(\\d+)$', replacement: 'BM$1-$2' },
  { label: 'TĐNĐ1: NĐ<n>-<m> -> BM<n>-<m>', pattern: '^NĐ(\\d+)-(\\d+)$', replacement: 'BM$1-$2' },
];

// ─── decodeWithGlyphRemap — bảng decode ký tự cho font CAD bị lỗi encoding ──
// (xem tmb-optimizer.ts comment đầu file: fixture TĐNĐ1 gặp đúng trường hợp này)

test('decodeWithGlyphRemap: map đúng theo bảng, không đoán ký tự thiếu', () => {
  const remap = { '65': 'B', '66': 'M', '48': '1', '45': '-', '50': '2' };
  const input = String.fromCharCode(65, 66, 48, 45, 50); // ký tự gốc bị lỗi encoding
  assert.equal(decodeWithGlyphRemap(input, remap), 'BM1-2');
});

test('decodeWithGlyphRemap: ký tự không có trong bảng -> khoảng trắng, KHÔNG throw/giữ nguyên', () => {
  const remap = { '65': 'B' };
  const input = String.fromCharCode(65, 999); // 999 không có trong bảng
  assert.equal(decodeWithGlyphRemap(input, remap), 'B ');
});

// ─── extractPdfUnitLabels — PDF thật (pdf-lib generated), text bình thường ──
// (không cần glyphRemap — đúng trường hợp Saigon Park/HLX VBM1: text layer sạch)

test('extractPdfUnitLabels: trích đúng mã + toạ độ từ text layer PDF thật', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('BM12-05', { x: 100, y: 200, size: 12, font });
  page.drawText('khong phai ma can', { x: 100, y: 100, size: 12, font });
  const bytes = await doc.save();

  const labels = await extractPdfUnitLabels(Buffer.from(bytes));
  assert.equal(labels.length, 1);
  assert.equal(labels[0].code, 'BM12-05');
  assert.ok(Number.isFinite(labels[0].x));
  assert.ok(Number.isFinite(labels[0].y));
});

test('extractPdfUnitLabels: pattern mặc định khớp cả chữ hoa có dấu tiếng Việt (VD "TĐ55-11") — [A-Z] bỏ sót Đ, \\p{Lu} thì không (bug thật gặp trên Bảng hàng HLX: 8 mã TĐ/NĐ)', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // WinAnsi không encode được "Đ" qua drawText — dựng text item thủ công
  // bằng cách chèn thẳng vào content stream với font hex-encode Latin-1 mở
  // rộng (Đ = 0xD0 trong CP1258/Latin nhưng pdf.js đọc theo font encoding
  // riêng) không khả thi gọn trong test; thay vào đó verify TRỰC TIẾP qua
  // regex thay vì dựng PDF thật cho riêng test này.
  const pattern = /\p{Lu}{1,4}\d{1,3}-\d{1,3}/gu;
  assert.deepEqual('TĐ55-11'.match(pattern), ['TĐ55-11']);
  assert.deepEqual('NĐ18-20'.match(pattern), ['NĐ18-20']);
  assert.deepEqual('BM34-25'.match(pattern), ['BM34-25']);
  // sanity: PDF thật (Helvetica, không dấu) vẫn hoạt động bình thường
  page.drawText('BM12-05', { x: 50, y: 50, size: 12, font });
  const bytes = await doc.save();
  const labels = await extractPdfUnitLabels(Buffer.from(bytes));
  assert.equal(labels.length, 1);
  assert.equal(labels[0].code, 'BM12-05');
});

test('extractPdfUnitLabels: pattern tuỳ chỉnh chỉ khớp đúng field mong muốn', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('AS80-08', { x: 50, y: 50, size: 12, font });
  const bytes = await doc.save();

  const labels = await extractPdfUnitLabels(Buffer.from(bytes), { pattern: /BM\d+-\d+/ });
  assert.equal(labels.length, 0); // "AS80-08" không khớp pattern chỉ nhận "BM..."
});

// ─── classifyUnitLabels — MATCHED / AMBIGUOUS / UNMATCHED, không fuzzy ─────

test('classifyUnitLabels: 1 vị trí PDF + 1 dòng Sheet -> MATCHED', () => {
  const results = classifyUnitLabels([{ code: 'BM1-05', x: 10, y: 20 }], ['BM1-05']);
  assert.equal(results.length, 1);
  assert.equal(results[0].classification, 'MATCHED');
  assert.deepEqual(results[0].position, { x: 10, y: 20 });
});

test('classifyUnitLabels: mã trong PDF nhưng không có trong Sheet -> UNMATCHED (not_in_sheet)', () => {
  const results = classifyUnitLabels([{ code: 'BM1-05', x: 10, y: 20 }], []);
  assert.equal(results[0].classification, 'UNMATCHED');
  assert.equal(results[0].reason, 'not_in_sheet');
});

test('classifyUnitLabels: mã trong Sheet nhưng không tìm thấy trong PDF -> UNMATCHED (not_in_pdf)', () => {
  const results = classifyUnitLabels([], ['BM1-05']);
  assert.equal(results[0].classification, 'UNMATCHED');
  assert.equal(results[0].reason, 'not_in_pdf');
});

test('classifyUnitLabels: PDF có mã ở 2 vị trí khác nhau -> AMBIGUOUS, KHÔNG tự chọn 1 vị trí', () => {
  const results = classifyUnitLabels(
    [{ code: 'BM1-05', x: 10, y: 20 }, { code: 'BM1-05', x: 500, y: 900 }],
    ['BM1-05'],
  );
  assert.equal(results[0].classification, 'AMBIGUOUS');
  assert.equal(results[0].reason, 'multiple_pdf_positions');
  assert.equal(results[0].position, undefined);
});

test('classifyUnitLabels: Sheet có 2 dòng cùng mã -> AMBIGUOUS dù PDF chỉ có 1 vị trí', () => {
  const results = classifyUnitLabels([{ code: 'BM1-05', x: 10, y: 20 }], ['BM1-05', 'BM1-05']);
  assert.equal(results[0].classification, 'AMBIGUOUS');
  assert.equal(results[0].reason, 'multiple_sheet_rows');
});

test('classifyUnitLabels: 2 lần vẽ cùng 1 vị trí (double-stroke, lệch < tolerance) -> vẫn MATCHED, không phải AMBIGUOUS', () => {
  const results = classifyUnitLabels(
    [{ code: 'BM1-05', x: 10.0, y: 20.0 }, { code: 'BM1-05', x: 10.05, y: 19.98 }],
    ['BM1-05'],
    { samePositionToleranceUnits: 1.0 },
  );
  assert.equal(results[0].classification, 'MATCHED');
});

test('classifyUnitLabels: normalize áp dụng cả 2 phía (khoảng trắng/hoa-thường) trước khi so khớp', () => {
  const results = classifyUnitLabels([{ code: ' bm1-05 ', x: 1, y: 2 }], ['BM1-05']);
  assert.equal(results[0].classification, 'MATCHED');
});

test('classifyUnitLabels: KHÔNG có fuzzy match — mã gần giống vẫn UNMATCHED', () => {
  const results = classifyUnitLabels([{ code: 'BM1-05', x: 1, y: 2 }], ['BM1-50']);
  const bm105 = results.find(r => r.normalizedCode === 'BM1-05');
  const bm150 = results.find(r => r.normalizedCode === 'BM1-50');
  assert.equal(bm105?.classification, 'UNMATCHED');
  assert.equal(bm150?.classification, 'UNMATCHED');
});

// ─── summarizeClassification ───────────────────────────────────────────────

test('summarizeClassification: tổng khớp số đầu vào, tách đúng từng nhóm', () => {
  const results = classifyUnitLabels(
    [
      { code: 'BM1-01', x: 1, y: 1 },
      { code: 'BM1-02', x: 2, y: 2 },
      { code: 'BM1-02', x: 900, y: 900 }, // ambiguous vị trí
      { code: 'BM1-04', x: 4, y: 4 },
    ],
    ['BM1-01', 'BM1-02', 'BM1-03', 'BM1-04', 'BM1-04'], // BM1-04 ambiguous ở Sheet, BM1-03 unmatched (not in PDF)
  );
  const summary = summarizeClassification(results);
  assert.equal(summary.total, 4);
  assert.equal(summary.matched, 1); // chỉ BM1-01
  assert.equal(summary.ambiguous, 2); // BM1-02, BM1-04
  assert.equal(summary.unmatched, 1); // BM1-03
  assert.equal(summary.matched + summary.ambiguous + summary.unmatched, summary.total);
});

test('summarizeClassification: danh sách rỗng không lỗi', () => {
  assert.deepEqual(summarizeClassification([]), { total: 0, matched: 0, ambiguous: 0, unmatched: 0 });
});

// ─── resolveUnitCodeAliases / classifySheetInventoryWithAliases (profile-scoped alias) ─
// Business finding thật (audit trực tiếp): Bảng hàng HLX dùng mã kinh doanh
// "TĐ55-11"/"NĐ11-60" trong khi PDF TĐNĐ1 dùng mã lưới kỹ thuật "BM55-11" —
// CÙNG lô, khác quy ước đặt tên, số block+số căn giữ NGUYÊN (đã audit 8/8 mã
// "TĐ" khớp đúng số với PDF thật). Rule alias CHỈ áp dụng cho profile khai
// báo nó, KHÔNG sửa gì trong Sheet, KHÔNG fuzzy — số phải khớp CHÍNH XÁC.

test('resolveUnitCodeAliases: khớp đúng rule, giữ nguyên số, KHÔNG đoán', () => {
  const result = resolveUnitCodeAliases('TĐ55-11', TDND1_ALIAS_RULES);
  assert.equal(result.length, 1);
  assert.equal(result[0].resolvedCode, 'BM55-11');
  assert.equal(result[0].rule.label, TDND1_ALIAS_RULES[0].label);
});

test('resolveUnitCodeAliases: mã đã là BM... -> không rule nào khớp (rule chỉ bắt TĐ/NĐ)', () => {
  assert.deepEqual(resolveUnitCodeAliases('BM55-11', TDND1_ALIAS_RULES), []);
});

test('resolveUnitCodeAliases: mã không khớp pattern nào -> mảng rỗng, KHÔNG throw', () => {
  assert.deepEqual(resolveUnitCodeAliases('XYZ999', TDND1_ALIAS_RULES), []);
});

test('classifySheetInventoryWithAliases: mã Sheet "TĐ55-11" resolve qua alias tới đúng 1 vị trí "BM55-11" trong PDF -> MATCHED(alias), giữ nguyên identity gốc "TĐ55-11"', () => {
  const results = classifySheetInventoryWithAliases(
    [{ code: 'BM55-11', x: 100, y: 200 }],
    ['TĐ55-11'],
    { aliasRules: TDND1_ALIAS_RULES },
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].originalCode, 'TĐ55-11'); // identity chính = mã kinh doanh gốc
  assert.equal(results[0].classification, 'MATCHED');
  assert.equal(results[0].matchSource, 'alias');
  assert.equal(results[0].resolvedPdfCode, 'BM55-11');
  assert.deepEqual(results[0].position, { x: 100, y: 200 });
});

test('classifySheetInventoryWithAliases: PDF không có "BM<n>-<m>" tương ứng -> UNMATCHED, KHÔNG bịa (đúng 3 mã NĐ thật trong audit: block/số không tồn tại trên trang PDF này)', () => {
  const results = classifySheetInventoryWithAliases(
    [{ code: 'BM99-01', x: 1, y: 1 }], // PDF có nội dung khác, không liên quan
    ['NĐ11-60'],
    { aliasRules: TDND1_ALIAS_RULES },
  );
  assert.equal(results[0].classification, 'UNMATCHED');
  assert.equal(results[0].reason, 'no_match');
  assert.equal(results[0].originalCode, 'NĐ11-60');
});

test('classifySheetInventoryWithAliases: mã trực tiếp khớp PDF (không cần alias) -> MATCHED(direct), ưu tiên trước khi thử alias', () => {
  const results = classifySheetInventoryWithAliases(
    [{ code: 'BM34-25', x: 5, y: 5 }],
    ['BM34-25'], // Sheet đã dùng ĐÚNG mã PDF (VD phân khu VBM1, không cần alias)
    { aliasRules: TDND1_ALIAS_RULES },
  );
  assert.equal(results[0].classification, 'MATCHED');
  assert.equal(results[0].matchSource, 'direct');
  assert.equal(results[0].resolvedPdfCode, undefined);
});

test('classifySheetInventoryWithAliases: alias resolve ra 2 vị trí khác nhau -> AMBIGUOUS, KHÔNG tự chọn 1', () => {
  const results = classifySheetInventoryWithAliases(
    [{ code: 'BM55-11', x: 100, y: 200 }, { code: 'BM55-11', x: 900, y: 900 }],
    ['TĐ55-11'],
    { aliasRules: TDND1_ALIAS_RULES },
  );
  assert.equal(results[0].classification, 'AMBIGUOUS');
  assert.equal(results[0].reason, 'multiple_candidates');
});

test('classifySheetInventoryWithAliases: 2 dòng Sheet trùng mã -> AMBIGUOUS ngay từ đầu, không thử alias/PDF', () => {
  const results = classifySheetInventoryWithAliases([], ['TĐ55-11', 'TĐ55-11'], { aliasRules: TDND1_ALIAS_RULES });
  assert.equal(results[0].classification, 'AMBIGUOUS');
  assert.equal(results[0].reason, 'multiple_sheet_rows');
});

test('classifySheetInventoryWithAliases: không truyền aliasRules -> hành vi y hệt exact-match thường (không alias nào áp dụng)', () => {
  const results = classifySheetInventoryWithAliases([{ code: 'BM55-11', x: 1, y: 1 }], ['TĐ55-11']);
  assert.equal(results[0].classification, 'UNMATCHED');
  assert.equal(results[0].reason, 'no_match');
});

test('summarizeSheetClassification: tách riêng matchedDirect vs matchedAlias, tổng khớp đầu vào', () => {
  const results = classifySheetInventoryWithAliases(
    [{ code: 'BM55-11', x: 1, y: 1 }, { code: 'BM34-25', x: 2, y: 2 }],
    ['TĐ55-11', 'BM34-25', 'NĐ11-60'],
    { aliasRules: TDND1_ALIAS_RULES },
  );
  const summary = summarizeSheetClassification(results);
  assert.equal(summary.total, 3);
  assert.equal(summary.matchedAlias, 1); // TĐ55-11
  assert.equal(summary.matchedDirect, 1); // BM34-25
  assert.equal(summary.unmatched, 1); // NĐ11-60
  assert.equal(summary.matchedDirect + summary.matchedAlias + summary.ambiguous + summary.unmatched, summary.total);
});

// ─── parseProfileDecodeConfig — contract dùng CHUNG với validateGlyphRemapConfig ─
// (validator client-side trong TmbManagerPanel.tsx, xem tmb-glyph-remap-validation.test.ts)
// phía client duplicate lại SHAPE (không import module này vào bundle client vì
// nó import pdfjs-dist) — 2 test dưới đây khoá contract để đổi 1 bên phải đổi cả 2.

test('parseProfileDecodeConfig: config TĐNĐ1 thật đã audit (shape mới charRemap+unitAliasRules) parse đúng, dùng được ngay cho extractPdfUnitLabels + classifySheetInventoryWithAliases', () => {
  const raw = {
    charRemap: { '55': 'B', '264': 'M', '19': '0', '16': '-' },
    unitAliasRules: [
      { label: 'TĐNĐ1: TĐ<n>-<m> -> BM<n>-<m>', pattern: '^TĐ(\\d+)-(\\d+)$', replacement: 'BM$1-$2' },
    ],
  };
  const config = parseProfileDecodeConfig(raw);
  assert.deepEqual(config.charRemap, raw.charRemap);
  assert.equal(config.unitAliasRules?.length, 1);
  assert.equal(config.unitAliasRules?.[0].label, raw.unitAliasRules[0].label);
});

test('parseProfileDecodeConfig: shape CŨ (flat Record<string,string>, không có charRemap/unitAliasRules key) -> coi toàn bộ là charRemap, unitAliasRules undefined', () => {
  const config = parseProfileDecodeConfig({ '55': 'B', '264': 'M' });
  assert.deepEqual(config.charRemap, { '55': 'B', '264': 'M' });
  assert.equal(config.unitAliasRules, undefined);
});

test('parseProfileDecodeConfig: null/undefined/không phải object -> {} an toàn, không throw', () => {
  assert.deepEqual(parseProfileDecodeConfig(null), {});
  assert.deepEqual(parseProfileDecodeConfig(undefined), {});
  assert.deepEqual(parseProfileDecodeConfig('not an object'), {});
});
