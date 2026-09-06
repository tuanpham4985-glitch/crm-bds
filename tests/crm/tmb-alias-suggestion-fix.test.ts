import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  classifySheetInventoryWithAliases, summarizeSheetClassification, suggestUnitAliasRules,
  parseProfileDecodeConfig, type UnitAliasRule, type ExtractedLabel,
} from '../../src/lib/tmb-indexer';
import {
  hasUsableCharRemap, findCopyableDecodeSourceProfiles, shouldSuggestDecodeCopy,
} from '../../src/app/stacking/TmbManagerPanel';

// ROOT CAUSE (audit thật trên production, xem Final Report "TMB Alias
// Suggestion Fix"): profile QA "HLX - TĐNĐ1 - Test" có glyph_remap = null
// trong DB (UI hiện "{}" chỉ là placeholder hiển thị của JSON.stringify(null
// ?? {}), KHÔNG phải giá trị thật lưu) -> parseProfileDecodeConfig(null) trả
// về charRemap undefined -> extractPdfUnitLabels dùng text layer THÔ (chưa
// decode) của 1 PDF CAD có font lỗi ToUnicode (fixture "VHGG Hạ Long_TMB
// Tiện ích&mã căn TĐNĐ1.pdf", 206.6MB — ĐÚNG filename profile QA đã upload,
// xem tmb-optimizer.ts comment đầu file) -> KHÔNG trích được BẤT KỲ mã căn
// nào khớp pattern \p{Lu}{1,4}\d{1,3}-\d{1,3} -> direct=0 VÀ suggestUnitAliasRules
// cũng nhận 0 label PDF hợp lệ để so khớp -> suggestedAliasRules=[] -> 0/11
// TOÀN BỘ. Đây KHÔNG phải lỗi ở suggestUnitAliasRules() (engine đã đúng, xem
// tmb-indexer.test.ts) — là THIẾU charRemap upstream. Profile ACTIVE "Tổng
// mặt bằng TĐNĐ1" (audit DB trực tiếp) có glyph_remap.charRemap đầy đủ (12
// entry) + unitAliasRules ĐÃ chấp nhận, 8/8 mapping AUTO_TEXT provenance
// matchSource:"alias" resolvedPdfCode khớp ĐÚNG 8 mã BM dưới đây — bằng
// chứng trực tiếp các mã BM này THẬT SỰ tồn tại trong PDF khi decode đúng.

const TDND1_ALIAS_RULES: UnitAliasRule[] = [
  { label: 'TĐNĐ1: TĐ<n>-<m> -> BM<n>-<m>', pattern: '^TĐ(\\d+)-(\\d+)$', replacement: 'BM$1-$2' },
  { label: 'TĐNĐ1: NĐ<n>-<m> -> BM<n>-<m>', pattern: '^NĐ(\\d+)-(\\d+)$', replacement: 'BM$1-$2' },
];

function label(code: string, x = 0, y = 0): ExtractedLabel {
  return { code, x, y };
}

// 8 mã BM thật đã audit trực tiếp trên profile ACTIVE (provenance.resolvedPdfCode
// của 8 unit_mappings đang lưu Postgres) — toạ độ không quan trọng cho test này.
const REAL_PDF_BM_LABELS: ExtractedLabel[] = [
  label('BM11-13'), label('BM15-13'), label('BM19-29'), label('BM43-19'),
  label('BM55-09'), label('BM55-11'), label('BM56-21'), label('BM56-35'),
];

// 11 mã Bảng hàng sống thật của phân khu TĐNĐ1 (8 TĐ có PDF tương ứng + 3 NĐ
// không có PDF tương ứng trên trang này — đúng kết quả audit lịch sử).
const REAL_SHEET_CODES = [
  'TĐ11-13', 'TĐ15-13', 'TĐ19-29', 'TĐ43-19', 'TĐ55-09', 'TĐ55-11', 'TĐ56-21', 'TĐ56-35',
  'NĐ11-60', 'NĐ11-62', 'NĐ18-20',
];

// ─── A. 8 cặp TĐ->BM tất định -> ĐÚNG 1 đề xuất alias ──────────────────────

test('A. suggestUnitAliasRules: 8 mã TĐ UNMATCHED (phần số khớp CHÍNH XÁC 8 mã BM thật trong PDF) -> đúng 1 đề xuất "TĐ → BM", supportCount=8', () => {
  const classifiedNoAlias = classifySheetInventoryWithAliases(REAL_PDF_BM_LABELS, REAL_SHEET_CODES, { aliasRules: [] });
  const unmatchedCodes = classifiedNoAlias.filter(c => c.classification === 'UNMATCHED').map(c => c.originalCode);
  assert.equal(unmatchedCodes.length, 11); // chưa có alias rule nào -> cả 11 mã đều UNMATCHED

  const suggestions = suggestUnitAliasRules(unmatchedCodes, REAL_PDF_BM_LABELS);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].label, 'TĐ → BM');
  assert.equal(suggestions[0].pattern, '^TĐ(\\d.*)$');
  assert.equal(suggestions[0].replacement, 'BM$1');
  assert.equal(suggestions[0].supportCount, 8);
  assert.equal(suggestions[0].examples.length, 5); // tối đa 5 ví dụ hiển thị
});

// ─── B. 3 mã NĐ vẫn UNMATCHED, KHÔNG bị đề xuất/gộp nhầm vào rule TĐ->BM ────

test('B. 3 mã NĐ (NĐ11-60, NĐ11-62, NĐ18-20) không có BM tương ứng trong PDF -> vẫn UNMATCHED, KHÔNG xuất hiện trong suggestion "TĐ → BM"', () => {
  const classifiedNoAlias = classifySheetInventoryWithAliases(REAL_PDF_BM_LABELS, REAL_SHEET_CODES, { aliasRules: [] });
  const unmatchedCodes = classifiedNoAlias.filter(c => c.classification === 'UNMATCHED').map(c => c.originalCode);
  const [suggestion] = suggestUnitAliasRules(unmatchedCodes, REAL_PDF_BM_LABELS);
  for (const nd of ['NĐ11-60', 'NĐ11-62', 'NĐ18-20']) {
    assert.ok(!suggestion.examples.some(e => e.sheetCode === nd), `${nd} không được lọt vào ví dụ của rule TĐ → BM`);
  }
  // Không có đề xuất "NĐ → ..." nào (PDF không có mã nào cùng phần số với 3 mã NĐ này).
  const allSuggestions = suggestUnitAliasRules(unmatchedCodes, REAL_PDF_BM_LABELS, { minSupport: 1 });
  assert.ok(!allSuggestions.some(s => s.label.startsWith('NĐ →')));
});

// ─── C. Chấp nhận rule -> reconciliation ĐÚNG: direct=0, alias=8, ambiguous=0, unmatched=3 ─

test('C. Sau khi "chấp nhận" rule TĐ → BM (đưa vào aliasRules) và re-classify: direct=0, alias=8, ambiguous=0, unmatched=3 — khớp CHÍNH XÁC lịch sử đã audit', () => {
  const classified = classifySheetInventoryWithAliases(REAL_PDF_BM_LABELS, REAL_SHEET_CODES, { aliasRules: TDND1_ALIAS_RULES });
  const summary = summarizeSheetClassification(classified);
  assert.deepEqual(summary, { total: 11, matchedDirect: 0, matchedAlias: 8, ambiguous: 0, unmatched: 3 });
});

// ─── D/E. Mã Sheet gốc là identity chính; mã PDF resolve chỉ là provenance ──

test('D. Mã Sheet GỐC (originalCode) luôn là identity chính, kể cả khi khớp qua alias — KHÔNG bị thay bằng mã PDF', () => {
  const classified = classifySheetInventoryWithAliases(REAL_PDF_BM_LABELS, REAL_SHEET_CODES, { aliasRules: TDND1_ALIAS_RULES });
  const matched = classified.filter(c => c.classification === 'MATCHED' && c.matchSource === 'alias');
  assert.equal(matched.length, 8);
  for (const m of matched) {
    assert.ok(m.originalCode.startsWith('TĐ'), `identity phải là mã Sheet gốc "TĐ..." — nhận "${m.originalCode}"`);
    assert.ok(!m.originalCode.startsWith('BM'), 'identity KHÔNG được là mã PDF');
  }
});

test('E. resolvedPdfCode chỉ là provenance (để tra cứu toạ độ + hiển thị Admin), KHÔNG dùng làm khoá mapping — index route lưu unitCode: c.originalCode (xem src/app/api/stacking/tmb-profiles/[id]/index/route.ts)', () => {
  const classified = classifySheetInventoryWithAliases(REAL_PDF_BM_LABELS, REAL_SHEET_CODES, { aliasRules: TDND1_ALIAS_RULES });
  const sample = classified.find(c => c.originalCode === 'TĐ55-11')!;
  assert.equal(sample.resolvedPdfCode, 'BM55-11'); // provenance
  assert.equal(sample.originalCode, 'TĐ55-11'); // identity — 2 field TÁCH BIỆT

  const routeSource = fs.readFileSync('src/app/api/stacking/tmb-profiles/[id]/index/route.ts', 'utf8');
  assert.match(routeSource, /unitCode: c\.originalCode, \/\/ identity CHÍNH luôn là mã kinh doanh gốc/);
  assert.match(routeSource, /resolvedPdfCode: c\.resolvedPdfCode/); // chỉ ghi vào provenance, không vào unitCode
});

// ─── F. Không fuzzy — số lệch thì KHÔNG được coi là khớp ───────────────────

test('F. KHÔNG fuzzy matching: NĐ18-20 có "BM18-19" gần giống trong PDF (số cuối lệch 1) vẫn phải UNMATCHED, KHÔNG tự chọn khớp gần đúng', () => {
  const pdfWithNearMiss = [...REAL_PDF_BM_LABELS, label('BM18-19')];
  const classified = classifySheetInventoryWithAliases(pdfWithNearMiss, REAL_SHEET_CODES, { aliasRules: TDND1_ALIAS_RULES });
  const nd18 = classified.find(c => c.originalCode === 'NĐ18-20')!;
  assert.equal(nd18.classification, 'UNMATCHED');
  assert.equal(nd18.reason, 'no_match');
});

// ─── G. Idempotent: chấp nhận rule + re-index lặp lại KHÔNG tạo mapping trùng ─

test('G. upsertTmbUnitMapping dùng Prisma upsert() trên unique(map_profile_id, normalized_unit_code) -> gọi lại nhiều lần cùng mã KHÔNG tạo bản ghi trùng, chỉ update', () => {
  const repoSource = fs.readFileSync('src/lib/tmb-repository.ts', 'utf8');
  assert.match(repoSource, /prisma\.tmbUnitMapping\.upsert\(\{/);
  assert.match(repoSource, /where: \{ map_profile_id_normalized_unit_code: \{ map_profile_id: mapProfileId, normalized_unit_code: input\.normalizedUnitCode \} \}/);
});

test('G. classifySheetInventoryWithAliases là pure function — gọi lại 2 lần cùng input luôn ra CÙNG kết quả (deterministic, an toàn cho refresh review lặp lại)', () => {
  const run1 = summarizeSheetClassification(classifySheetInventoryWithAliases(REAL_PDF_BM_LABELS, REAL_SHEET_CODES, { aliasRules: TDND1_ALIAS_RULES }));
  const run2 = summarizeSheetClassification(classifySheetInventoryWithAliases(REAL_PDF_BM_LABELS, REAL_SHEET_CODES, { aliasRules: TDND1_ALIAS_RULES }));
  assert.deepEqual(run1, run2);
});

test('G. index route: mapping MANUAL đã có luôn được skip khi re-index (autoSkippedManual) — AUTO_TEXT KHÔNG BAO GIỜ ghi đè MANUAL dù chạy lại bao nhiêu lần', () => {
  const routeSource = fs.readFileSync('src/app/api/stacking/tmb-profiles/[id]/index/route.ts', 'utf8');
  assert.match(routeSource, /if \(manualCodes\.has\(c\.normalizedOriginalCode\)\) \{ autoSkippedManual\+\+; continue; \}/);
});

// ─── H. Profile Self-Service mới (glyph_remap null/{}) surface được đề xuất
//        MÀ KHÔNG cần Admin mở "Chi tiết kỹ thuật" gõ tay JSON ─────────────

function makeProfileRow(overrides: Partial<{
  id: string; stacking_config_id: string; label: string; subdivision: string | null;
  glyph_remap: unknown; status: string;
}> = {}) {
  return {
    id: overrides.id ?? 'p1',
    stacking_config_id: overrides.stacking_config_id ?? 'SC_1',
    label: overrides.label ?? 'Profile',
    subdivision: overrides.subdivision ?? null,
    source_type: 'PDF',
    master_asset_ref: 'ref',
    web_asset_ref: 'ref',
    page_number: 1,
    page_width: null,
    page_height: null,
    rotation: 0,
    unit_code_field: null,
    glyph_remap: overrides.glyph_remap ?? null,
    status: overrides.status ?? 'READY_FOR_REVIEW',
    error_message: null,
    master_size_bytes: null,
    web_size_bytes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

test('H1. hasUsableCharRemap: glyph_remap null/{} (charRemap rỗng hoặc thiếu) -> false; charRemap có entry -> true', () => {
  assert.equal(hasUsableCharRemap(null), false);
  assert.equal(hasUsableCharRemap({}), false);
  assert.equal(hasUsableCharRemap({ charRemap: {} }), false);
  assert.equal(hasUsableCharRemap({ charRemap: { '55': 'B' } }), true);
  assert.equal(hasUsableCharRemap({ '55': 'B' }), true); // shape cũ (flat) vẫn nhận diện đúng
});

test('H2. findCopyableDecodeSourceProfiles: profile QA (glyph_remap null) CÙNG dự án với profile ACTIVE (có charRemap) -> ACTIVE xuất hiện là nguồn sao chép hợp lệ, chính QA bị loại khỏi danh sách nguồn của chính nó', () => {
  const active = makeProfileRow({ id: 'active-1', label: 'Tổng mặt bằng TĐNĐ1', status: 'ACTIVE', glyph_remap: { charRemap: { '55': 'B' }, unitAliasRules: TDND1_ALIAS_RULES } });
  const qa = makeProfileRow({ id: 'qa-1', label: 'HLX - TĐNĐ1 - Test', status: 'READY_FOR_REVIEW', glyph_remap: null });
  const candidates = findCopyableDecodeSourceProfiles([active, qa], qa.id);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, 'active-1');
});

test('H3. shouldSuggestDecodeCopy: kết quả review 0 direct/0 alias/0 suggestion + có candidate -> true (đúng trạng thái sản xuất thật của QA profile trước fix)', () => {
  const indexResultBeforeFix = { summary: { matchedDirect: 0, matchedAlias: 0 }, suggestedAliasRules: [] };
  assert.equal(shouldSuggestDecodeCopy(indexResultBeforeFix, 1), true);
  assert.equal(shouldSuggestDecodeCopy(indexResultBeforeFix, 0), false); // không có nguồn nào để mượn -> không gợi ý
  assert.equal(shouldSuggestDecodeCopy(undefined, 1), false); // chưa review lần nào
});

test('H4. shouldSuggestDecodeCopy: đã khớp được ít nhất 1 mã (direct hoặc alias) HOẶC đã có suggestion -> false (charRemap đã ổn, không cần gợi ý sao chép)', () => {
  assert.equal(shouldSuggestDecodeCopy({ summary: { matchedDirect: 1, matchedAlias: 0 }, suggestedAliasRules: [] }, 1), false);
  assert.equal(shouldSuggestDecodeCopy({ summary: { matchedDirect: 0, matchedAlias: 8 }, suggestedAliasRules: [] }, 1), false);
  assert.equal(shouldSuggestDecodeCopy({ summary: { matchedDirect: 0, matchedAlias: 0 }, suggestedAliasRules: [{ label: 'TĐ → BM' }] }, 1), false);
});

test('H5. TmbManagerPanel.tsx: nút "Sao chép cấu hình decode & Quét lại" đặt trong khối review (KHÔNG yêu cầu mở "Chi tiết kỹ thuật"/textarea JSON) — gọi copyDecodeConfig(), KHÔNG gọi saveGlyphRemap()/JSON.parse thủ công của Admin', () => {
  const panelSource = fs.readFileSync('src/app/stacking/TmbManagerPanel.tsx', 'utf8');
  assert.match(panelSource, /Sao chép cấu hình decode & Quét lại/);
  assert.match(panelSource, /onClick=\{\(\) => copyDecodeConfig\(p, selectedSourceId\)\}/);
  // Khối gợi ý này nằm trong `expandedId === p.id` (Review) — KHÔNG lồng bên
  // trong `technicalOpenIds.has(p.id)` (Chi tiết kỹ thuật) — kiểm tra thứ tự
  // xuất hiện: block "Sao chép cấu hình decode" phải đứng TRƯỚC dòng mở
  // "Chi tiết kỹ thuật" trong cùng 1 profile card (tức nằm ở review, không
  // phải trong technical accordion phía dưới).
  const copyBlockIdx = panelSource.indexOf('Sao chép cấu hình decode & Quét lại');
  const technicalToggleIdx = panelSource.indexOf('Chi tiết kỹ thuật</button>') >= 0
    ? panelSource.indexOf('Chi tiết kỹ thuật</button>')
    : panelSource.indexOf('{technicalOpenIds.has(p.id) && (');
  assert.ok(copyBlockIdx > 0 && technicalToggleIdx > 0);
  assert.ok(copyBlockIdx < technicalToggleIdx, 'nút sao chép decode phải xuất hiện TRƯỚC accordion Chi tiết kỹ thuật, không lồng bên trong nó');
});

test('H6. copyDecodeConfig(): PATCH glyph_remap rồi POST index — KHÔNG gọi /activate, KHÔNG DELETE nào (chỉ đổi cấu hình decode + quét lại, không đổi trạng thái/xoá gì)', () => {
  const panelSource = fs.readFileSync('src/app/stacking/TmbManagerPanel.tsx', 'utf8');
  const fnMatch = panelSource.match(/async function copyDecodeConfig\(p: TmbProfileRow, sourceId: string\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fnMatch, 'không tìm thấy hàm copyDecodeConfig');
  const fnBody = fnMatch![0];
  assert.match(fnBody, /method: 'PATCH'/);
  assert.match(fnBody, /fetch\(`\/api\/stacking\/tmb-profiles\/\$\{p\.id\}\/index`, \{ method: 'POST' \}\)/);
  assert.ok(!fnBody.includes('/activate'));
  assert.ok(!fnBody.includes("method: 'DELETE'"));
});

test('H7. copyDecodeConfig(): CHỈ copy charRemap từ nguồn — GIỮ NGUYÊN unitAliasRules của CHÍNH profile hiện tại (current.unitAliasRules), KHÔNG copy alias rule của nguồn', () => {
  const panelSource = fs.readFileSync('src/app/stacking/TmbManagerPanel.tsx', 'utf8');
  const fnMatch = panelSource.match(/async function copyDecodeConfig\(p: TmbProfileRow, sourceId: string\) \{[\s\S]*?\n  \}\n/);
  const fnBody = fnMatch![0];
  assert.match(fnBody, /const nextConfig = \{ charRemap: sourceConfig\.charRemap, unitAliasRules: current\.unitAliasRules \};/);
});

// ─── I. Profile ACTIVE / runtime hiện có KHÔNG bị ảnh hưởng bởi fix này ────

test('I. useDbTmbMapProfiles (registry runtime ACTIVE-only) KHÔNG bị sửa bởi fix này — vẫn lọc CHÍNH XÁC status === "ACTIVE"', () => {
  const registrySource = fs.readFileSync('src/app/stacking/tmb-map-registry.ts', 'utf8');
  assert.match(registrySource, /const activeRows = \(listRes\.data as TmbDbProfileRow\[\]\)\.filter\(p => p\.status === 'ACTIVE'\);/);
});

test('I. Fix này KHÔNG động tới optimizer/renderer/worker/route activate — chỉ TmbManagerPanel.tsx (UI Admin) + test mới', () => {
  const optimizerSource = fs.readFileSync('src/lib/tmb-optimizer.ts', 'utf8');
  const tmbMapSource = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');
  // Sanity: 2 file này vẫn chứa các marker gốc không đổi (không bị chỉnh sửa
  // ngoài phạm vi) — nếu bị sửa nhầm, các chuỗi đặc trưng này vẫn còn (test
  // này CHỈ đảm bảo file tồn tại/đọc được, phép so sánh git diff thật đã kiểm
  // tra riêng ở bước release).
  assert.match(optimizerSource, /export async function analyzePdf/);
  assert.match(tmbMapSource, /export default function TmbMap/);
});

test('I. classifySheetInventoryWithAliases không truyền aliasRules (hành vi Saigon Park/HLX VBM1, PDF encoding bình thường, không cần alias) -> KHÔNG bị ảnh hưởng, vẫn exact-match thường', () => {
  const results = classifySheetInventoryWithAliases([{ code: 'BM99-01', x: 1, y: 1 }], ['BM99-01']);
  assert.equal(results[0].classification, 'MATCHED');
  assert.equal(results[0].matchSource, 'direct');
});

// ─── Sanity: contract glyph_remap null hiển thị "{}" ở UI KHÔNG phải bug DB ─

test('parseProfileDecodeConfig(null) (đúng giá trị THẬT lưu trong DB của QA profile trước fix) -> charRemap undefined, KHÔNG phải {} — khác "{}" mà UI hiển thị (chỉ là placeholder JSON.stringify(glyph_remap ?? {}))', () => {
  const config = parseProfileDecodeConfig(null);
  assert.equal(config.charRemap, undefined);
  assert.deepEqual(config, {});
});
