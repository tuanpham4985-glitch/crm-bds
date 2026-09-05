import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGlyphRemapConfig } from '../../src/app/stacking/TmbManagerPanel';

/** Validator client-side cho ô nhập glyph_remap trong TmbManagerPanel — cố ý
 * KHÔNG import parseProfileDecodeConfig/UnitAliasRule từ tmb-indexer.ts (file
 * đó import pdfjs-dist, chỉ chạy được server-side) nên duplicate lại SHAPE
 * (không phải logic decode/alias thật) để validate trước khi PATCH. Test này
 * đảm bảo shape khớp ĐÚNG contract server đang đọc lại bằng
 * parseProfileDecodeConfig (xem tmb-indexer.test.ts cho phía server).
 */

test('validateGlyphRemapConfig: JSON không hợp lệ -> lỗi rõ ràng, KHÔNG throw', () => {
  const r = validateGlyphRemapConfig('{ invalid json');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /JSON không hợp lệ/);
});

test('validateGlyphRemapConfig: không phải object (VD mảng/số) -> lỗi', () => {
  assert.equal(validateGlyphRemapConfig('[]').ok, false);
  assert.equal(validateGlyphRemapConfig('42').ok, false);
  assert.equal(validateGlyphRemapConfig('null').ok, false);
});

test('validateGlyphRemapConfig: object rỗng {} hợp lệ (profile không cần decode/alias)', () => {
  const r = validateGlyphRemapConfig('{}');
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, {});
});

test('validateGlyphRemapConfig: config TĐNĐ1 thật đã audit (charRemap + unitAliasRules) -> hợp lệ', () => {
  const config = {
    charRemap: {
      '55': 'B', '264': 'M',
      '19': '0', '20': '1', '21': '2', '22': '3', '23': '4',
      '24': '5', '25': '6', '26': '7', '27': '8', '28': '9',
      '16': '-',
    },
    unitAliasRules: [
      { label: 'TĐNĐ1: TĐ<n>-<m> -> BM<n>-<m>', pattern: '^TĐ(\\d+)-(\\d+)$', replacement: 'BM$1-$2' },
      { label: 'TĐNĐ1: NĐ<n>-<m> -> BM<n>-<m>', pattern: '^NĐ(\\d+)-(\\d+)$', replacement: 'BM$1-$2' },
    ],
  };
  const r = validateGlyphRemapConfig(JSON.stringify(config));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, config);
});

test('validateGlyphRemapConfig: charRemap có value không phải string -> lỗi', () => {
  const r = validateGlyphRemapConfig(JSON.stringify({ charRemap: { '55': 66 } }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /charRemap/);
});

test('validateGlyphRemapConfig: unitAliasRules thiếu field bắt buộc -> lỗi cụ thể theo index', () => {
  const r = validateGlyphRemapConfig(JSON.stringify({ unitAliasRules: [{ label: 'x', pattern: '^A$' }] })); // thiếu replacement
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /unitAliasRules\[0\]\.replacement/);
});

test('validateGlyphRemapConfig: unitAliasRules.pattern không phải regex hợp lệ -> lỗi (KHÔNG lưu pattern hỏng)', () => {
  const r = validateGlyphRemapConfig(JSON.stringify({ unitAliasRules: [{ label: 'x', pattern: '(unterminated', replacement: 'y' }] }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /regex hợp lệ/);
});

test('validateGlyphRemapConfig: shape CŨ (flat Record<string,string>, không có charRemap/unitAliasRules key) vẫn hợp lệ — tương thích ngược', () => {
  const r = validateGlyphRemapConfig(JSON.stringify({ '55': 'B', '264': 'M' }));
  assert.equal(r.ok, true);
});

test('validateGlyphRemapConfig: shape CŨ có value không phải string -> lỗi', () => {
  const r = validateGlyphRemapConfig(JSON.stringify({ '55': 66 }));
  assert.equal(r.ok, false);
});

test('validateGlyphRemapConfig: unitAliasRules rỗng [] hợp lệ (chỉ dùng charRemap, không cần alias)', () => {
  const r = validateGlyphRemapConfig(JSON.stringify({ charRemap: { '55': 'B' }, unitAliasRules: [] }));
  assert.equal(r.ok, true);
});
