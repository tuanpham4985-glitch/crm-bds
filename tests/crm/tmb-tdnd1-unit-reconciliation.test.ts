import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  extractPdfUnitLabels, classifySheetInventoryWithAliases, summarizeSheetClassification,
  type UnitAliasRule, type GlyphRemap,
} from '../../src/lib/tmb-indexer';
import { normalizeUnitCode, buildMaCanIndex, resolveTmbUnitState, summarizeTmbInventory } from '../../src/app/stacking/tmb-map-matching';
import { TMB_HLX_TDND1_UNITS, TMB_HLX_VBM_UNITS, TMB_MAP_UNITS } from '../../src/app/stacking/tmb-map-data';
import type { StackingListRow } from '../../src/lib/types';

// TĐNĐ1 marker/unit reconciliation — TMB_HLX_TDND1_UNITS populated bằng
// CHÍNH pipeline tmb-indexer.ts (Section 7) đã dùng offline 1 lần để trích +
// đối chiếu (KHÔNG chạy lại ở runtime production — xem tmb-map-data.ts).
// File test này CHỦ ĐÍCH RE-RUN pipeline đó tại test-time (offline, đọc file
// PDF ĐÃ COMMIT trong repo, KHÔNG cần mạng/credentials) để khoá regression:
// nếu ai đó sửa PDF/glyph table sau này mà quên cập nhật
// TMB_HLX_TDND1_UNITS, test này sẽ fail thay vì âm thầm lệch toạ độ.
//
// Glyph remap + alias rule dưới đây là CÔNG CỤ đã dùng offline để derive dữ
// liệu tĩnh — KHÔNG phải runtime config được ship (production KHÔNG gọi
// extractPdfUnitLabels bao giờ, xem yêu cầu "no runtime extraction").

const TDND1_GLYPH_REMAP: GlyphRemap = {
  '55': 'B', '49': 'N', '264': 'M',
  '19': '0', '20': '1', '21': '2', '22': '3', '23': '4', '24': '5', '25': '6', '26': '7', '27': '8', '28': '9',
  '16': '-',
};

const TDND1_ALIAS_RULES: UnitAliasRule[] = [
  { label: 'TĐ → BM', pattern: String.raw`^TĐ(\d+)-(\d+)$`, replacement: 'BM$1-$2' },
  { label: 'NĐ → NM', pattern: String.raw`^NĐ(\d+)-(\d+)$`, replacement: 'NM$1-$2' },
];

// Snapshot của 12 dòng Bảng hàng TĐNĐ1 THẬT tại thời điểm audit (đọc trực
// tiếp qua getStackingListRows() với credentials thật, KHÔNG suy đoán) — cố
// định để test deterministic/offline, KHÔNG phụ thuộc trạng thái Sheet SAU
// NÀY (số liệu kinh doanh có thể đổi, đó là lý do trạng thái Còn hàng/Đã bán
// KHÔNG được mã hoá vào TMB_HLX_TDND1_UNITS — chỉ toạ độ mới cố định).
const TDND1_SHEET_SNAPSHOT: readonly { maCan: string; trangThai: StackingListRow['trangThai']; marker?: 'da_ban' }[] = [
  { maCan: 'NĐ11-60', trangThai: 'con_hang', marker: 'da_ban' }, // marker ghi đè trangThai -> effective 'da_ban'
  { maCan: 'NĐ11-62', trangThai: 'con_hang' },
  { maCan: 'NĐ18-20', trangThai: 'con_hang' },
  { maCan: 'NĐ19-16', trangThai: 'con_hang' },
  { maCan: 'TĐ19-29', trangThai: 'con_hang' },
  { maCan: 'TĐ15-13', trangThai: 'con_hang' },
  { maCan: 'TĐ11-13', trangThai: 'con_hang' },
  { maCan: 'TĐ55-11', trangThai: 'con_hang' },
  { maCan: 'TĐ56-21', trangThai: 'con_hang' },
  { maCan: 'TĐ56-35', trangThai: 'con_hang' },
  { maCan: 'TĐ55-09', trangThai: 'con_hang' },
  { maCan: 'TĐ43-19', trangThai: 'con_hang' },
];

function snapshotToRows(): StackingListRow[] {
  return TDND1_SHEET_SNAPSHOT.map(s => ({ maCan: s.maCan, trangThai: s.trangThai, marker: s.marker, values: {} }));
}

// ─── 1. Dataset non-empty ───────────────────────────────────────────────────

test('1. TMB_HLX_TDND1_UNITS không còn rỗng — đúng 12 mã', () => {
  assert.equal(TMB_HLX_TDND1_UNITS.length, 12);
});

// ─── 2/3. Re-run pipeline thật (PDF đã commit + snapshot Sheet) -> khoá regression ─

test('2. Re-run extractPdfUnitLabels + classifySheetInventoryWithAliases trên CHÍNH PDF đã commit (public/tmb-poc/tmb-hlx-tdnd1.pdf) + snapshot 12 mã Sheet -> 12 matched, 0 unmatched, 0 ambiguous', async () => {
  const pdfBuffer = fs.readFileSync('public/tmb-poc/tmb-hlx-tdnd1.pdf');
  const labels = await extractPdfUnitLabels(pdfBuffer, { glyphRemap: TDND1_GLYPH_REMAP });
  const sheetCodes = TDND1_SHEET_SNAPSHOT.map(s => s.maCan);
  const classified = classifySheetInventoryWithAliases(labels, sheetCodes, { aliasRules: TDND1_ALIAS_RULES });
  const summary = summarizeSheetClassification(classified);

  assert.equal(summary.total, 12);
  assert.equal(summary.ambiguous, 0, 'không được có mã nào ambiguous');
  assert.equal(summary.unmatched, 0, 'không được có mã nào unmatched');
  assert.equal(summary.matchedDirect + summary.matchedAlias, 12);

  // Mỗi kết quả MATCHED phải khớp CHÍNH XÁC (trong sai số dấu phẩy động) với
  // toạ độ ĐÃ COMMIT trong TMB_HLX_TDND1_UNITS — khoá regression: nếu ai đó
  // sửa PDF/glyph/alias sau này mà quên chạy lại + cập nhật dataset tĩnh,
  // test này fail thay vì lặng lẽ lệch toạ độ.
  const committedByCode = new Map(TMB_HLX_TDND1_UNITS.map(u => [normalizeUnitCode(u.unitCode), u]));
  for (const c of classified) {
    assert.equal(c.classification, 'MATCHED', `${c.originalCode} phải MATCHED`);
    const committed = committedByCode.get(c.normalizedOriginalCode);
    assert.ok(committed, `${c.originalCode} phải có trong TMB_HLX_TDND1_UNITS đã commit`);
    assert.ok(Math.abs(committed!.pdfX - c.position!.x) < 1e-6, `${c.originalCode} pdfX lệch: committed=${committed!.pdfX} derived=${c.position!.x}`);
    assert.ok(Math.abs(committed!.pdfY - c.position!.y) < 1e-6, `${c.originalCode} pdfY lệch: committed=${committed!.pdfY} derived=${c.position!.y}`);
  }
});

// ─── 4. TĐ/NĐ cùng phần số KHÔNG collapse — collision check ────────────────

test('4. Toạ độ 4 mã NĐ (NĐ11-60, NĐ11-62, NĐ18-20, NĐ19-16) đều khác biệt lẫn nhau VÀ khác biệt với toàn bộ toạ độ gia đình TĐ (không collapse dù cùng phần số, VD "11-13"/"11-60"/"11-62" đều có block "11")', () => {
  const ndUnits = TMB_HLX_TDND1_UNITS.filter(u => u.unitCode.startsWith('NĐ'));
  const tdUnits = TMB_HLX_TDND1_UNITS.filter(u => u.unitCode.startsWith('TĐ'));
  assert.equal(ndUnits.length, 4);
  assert.equal(tdUnits.length, 8);

  const allUnits = [...ndUnits, ...tdUnits];
  for (let i = 0; i < allUnits.length; i++) {
    for (let j = i + 1; j < allUnits.length; j++) {
      const dist = Math.hypot(allUnits[i].pdfX - allUnits[j].pdfX, allUnits[i].pdfY - allUnits[j].pdfY);
      assert.ok(dist > 1.0, `${allUnits[i].unitCode} và ${allUnits[j].unitCode} toạ độ quá gần nhau (dist=${dist}) — nghi ngờ collapse nhầm`);
    }
  }
});

// ─── 5. Runtime status: 11 Còn hàng -> 11 marker available, 1 Đã bán -> loại ─

test('5. resolveTmbUnitState trên snapshot Sheet: 11/12 mã "con_hang" (available=true), ĐÚNG 1 mã (NĐ11-60, marker=da_ban ghi đè trangThai) available=false — dùng CHÍNH effectiveDotStatus/resolveTmbUnitState production, không công thức riêng', () => {
  const rows = snapshotToRows();
  const index = buildMaCanIndex(rows);
  const states = TMB_HLX_TDND1_UNITS.map(u => resolveTmbUnitState(u.unitCode, index));
  const summary = summarizeTmbInventory(states);

  assert.equal(summary.total, 12);
  assert.equal(summary.matched, 12, 'cả 12 mã trong TMB_HLX_TDND1_UNITS phải khớp Sheet snapshot — không unmatched/ambiguous');
  assert.equal(summary.unmatched, 0);
  assert.equal(summary.ambiguous, 0);
  assert.equal(summary.available, 11, 'đúng 11 căn available (Còn hàng)');
  assert.equal(summary.otherStatus, 1, 'đúng 1 căn khác trạng thái (Đã bán)');

  const soldUnit = states.find(s => s.unitCode === 'NĐ11-60');
  assert.ok(soldUnit);
  assert.equal(soldUnit!.available, false, 'NĐ11-60 (marker=da_ban) KHÔNG được coi là available');

  const availableCodes = states.filter(s => s.available).map(s => s.unitCode).sort();
  assert.deepEqual(availableCodes, [
    'NĐ11-62', 'NĐ18-20', 'NĐ19-16', 'TĐ11-13', 'TĐ15-13', 'TĐ19-29', 'TĐ43-19', 'TĐ55-09', 'TĐ55-11', 'TĐ56-21', 'TĐ56-35',
  ].sort());
});

// ─── 6. Không mã nào trùng lặp trong dataset tĩnh (mỗi unitCode xuất hiện đúng 1 lần) ─

test('6. TMB_HLX_TDND1_UNITS không có unitCode trùng lặp (mỗi mã đúng 1 entry — double-stroke đã bị loại từ bước derive, không lọt vào dataset tĩnh)', () => {
  const codes = TMB_HLX_TDND1_UNITS.map(u => normalizeUnitCode(u.unitCode));
  const uniqueCodes = new Set(codes);
  assert.equal(uniqueCodes.size, codes.length, 'phát hiện unitCode trùng lặp trong TMB_HLX_TDND1_UNITS');
});

// ─── 7/8. VBM1 + Saigon Park KHÔNG bị đụng vào ─────────────────────────────

test('7. TMB_HLX_VBM_UNITS không đổi — vẫn đúng 5 mã như trước (fix TĐNĐ1 không lan sang VBM1)', () => {
  assert.equal(TMB_HLX_VBM_UNITS.length, 5);
});

test('8. TMB_MAP_UNITS (Saigon Park) không đổi — vẫn đúng 22 mã như trước', () => {
  assert.equal(TMB_MAP_UNITS.length, 22);
});
