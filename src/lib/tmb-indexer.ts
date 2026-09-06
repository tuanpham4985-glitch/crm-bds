/** TMB Manager — Auto Unit Indexing (Section 7 của TMB Manager spec).
 *
 * Trích text layer PDF (pdfjs-dist — CÙNG engine với renderer/optimizer,
 * KHÔNG viết parser riêng) rồi đối chiếu EXACT với Bảng hàng hiện có, dùng
 * LẠI normalizeUnitCode (tmb-map-matching.ts) — không tạo normalizer thứ 2.
 * KHÔNG fuzzy-match, KHÔNG đoán căn gần giống — mã ambiguous/unmatched không
 * bao giờ tự chọn (xem classifyUnitLabels).
 *
 * `glyphRemap` (tuỳ chọn, lưu trong TmbMapProfile.glyph_remap) giải quyết
 * trường hợp PDF xuất từ CAD có font label bị lỗi ToUnicode — đã gặp thực tế
 * trên fixture TĐNĐ1 (xem tmb-optimizer.ts comment đầu file): mã căn hiện ra
 * dạng ký tự điều khiển thay vì text đọc được. KHÔNG hard-code bảng decode
 * này trong engine — đây là dữ liệu CỦA RIÊNG profile đó (giống TMB_MAP_UNITS
 * là data riêng từng profile trước đây), profile PDF encoding bình thường
 * (Saigon Park, HLX VBM1) không cần field này (giữ nguyên text pdfjs trả về).
 */
// pdfjs-dist Node build, ĐÃ cấu hình workerSrc đúng cho server (xem
// tmb-pdfjs-server.ts — fix "Cannot find module .../pdf.worker.mjs" trên
// Vercel) — KHÔNG import thẳng 'pdfjs-dist/legacy/build/pdf.mjs' ở đây nữa.
import { pdfjsLib } from './tmb-pdfjs-server';
import { normalizeUnitCode } from '@/app/stacking/tmb-map-matching';

export type GlyphRemap = Record<string, string>;

export interface ExtractedLabel {
  /** Mã đã decode (sau glyphRemap nếu có), CHƯA normalize. */
  code: string;
  x: number;
  y: number;
}

// \p{Lu} (Unicode uppercase letter) thay vì [A-Z] — mã căn tiếng Việt có thể
// dùng chữ hoa có dấu (VD "TĐ55-11", "NĐ18-20", đã gặp thực tế trong Bảng
// hàng HLX) mà [A-Z] bỏ sót (Đ/Ắ/... không nằm trong A-Z).
const DEFAULT_UNIT_CODE_PATTERN = /\p{Lu}{1,4}\d{1,3}-\d{1,3}/gu;

/** Export riêng để test trực tiếp (không cần dựng PDF thật) — pure function,
 * ký tự không có trong bảng -> khoảng trắng placeholder, KHÔNG đoán/giữ nguyên
 * ký tự lạ (tránh vô tình khớp regex sai). */
export function decodeWithGlyphRemap(str: string, remap: GlyphRemap): string {
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    out += remap[String(code)] ?? ' '; // ký tự không có trong bảng -> placeholder, KHÔNG đoán
  }
  return out;
}

/** Trích toàn bộ nhãn mã căn khớp `pattern` trên 1 trang PDF, kèm toạ độ gốc
 * (pdf user-space, page KHÔNG xoay/scale — CÙNG hệ toạ độ TMB_MAP_UNITS đang
 * dùng, xem tmb-map-data.ts). `glyphRemap` rỗng/undefined = dùng text layer
 * nguyên bản (trường hợp PDF encoding bình thường). */
export async function extractPdfUnitLabels(
  buffer: Buffer,
  opts: { pageNumber?: number; glyphRemap?: GlyphRemap; pattern?: RegExp } = {},
): Promise<ExtractedLabel[]> {
  const pageNumber = opts.pageNumber ?? 1;
  const pattern = opts.pattern ?? DEFAULT_UNIT_CODE_PATTERN;
  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + 'g');

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const page = await doc.getPage(pageNumber);
  const textContent = await page.getTextContent();

  const labels: ExtractedLabel[] = [];
  for (const item of textContent.items) {
    if (!('str' in item) || item.str.length < 2) continue;
    const decoded = opts.glyphRemap ? decodeWithGlyphRemap(item.str, opts.glyphRemap) : item.str;
    let m: RegExpExecArray | null;
    globalPattern.lastIndex = 0;
    while ((m = globalPattern.exec(decoded))) {
      labels.push({ code: m[0], x: item.transform[4], y: item.transform[5] });
    }
  }
  return labels;
}

export type MappingClassification = 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED';

export interface ClassifiedUnit {
  normalizedCode: string;
  classification: MappingClassification;
  /** Lý do cụ thể — dùng cho Admin review UI, KHÔNG chỉ nói "ambiguous" chung chung. */
  reason?: 'multiple_pdf_positions' | 'multiple_sheet_rows' | 'not_in_sheet' | 'not_in_pdf';
  /** Chỉ có khi classification === 'MATCHED' — toạ độ DUY NHẤT tìm được. */
  position?: { x: number; y: number };
  pdfPositionCount: number;
  sheetRowCount: number;
}

/** So khớp EXACT nhãn đã trích từ PDF với danh sách mã căn Bảng hàng (đã
 * normalize theo CÙNG luật). Trả về phân loại cho MỌI mã xuất hiện ở PDF
 * VÀ/HOẶC Sheet (union) — không bỏ sót mã nào để caller tự quyết định hiển
 * thị gì. Vị trí trùng nhau trong khoảng `samePositionToleranceUnits` (mặc
 * định 1pt) được coi là 1 vị trí (double-stroke vẽ 2 lần, KHÔNG phải
 * ambiguous — xem audit thực tế trên TĐNĐ1: 183/199 "trùng mã" là double-stroke,
 * chỉ 16 mã genuinely ở nhiều vị trí khác nhau). */
export function classifyUnitLabels(
  extractedLabels: readonly ExtractedLabel[],
  sheetUnitCodes: readonly string[],
  opts: { samePositionToleranceUnits?: number } = {},
): ClassifiedUnit[] {
  const tolerance = opts.samePositionToleranceUnits ?? 1.0;

  const pdfByCode = new Map<string, { x: number; y: number }[]>();
  for (const label of extractedLabels) {
    const key = normalizeUnitCode(label.code);
    const bucket = pdfByCode.get(key) ?? [];
    bucket.push({ x: label.x, y: label.y });
    pdfByCode.set(key, bucket);
  }

  const sheetByCode = new Map<string, number>();
  for (const code of sheetUnitCodes) {
    const key = normalizeUnitCode(code);
    sheetByCode.set(key, (sheetByCode.get(key) ?? 0) + 1);
  }

  const allCodes = new Set([...pdfByCode.keys(), ...sheetByCode.keys()]);
  const results: ClassifiedUnit[] = [];

  for (const code of allCodes) {
    const positions = dedupePositions(pdfByCode.get(code) ?? [], tolerance);
    const sheetRowCount = sheetByCode.get(code) ?? 0;

    if (positions.length === 0) {
      results.push({ normalizedCode: code, classification: 'UNMATCHED', reason: 'not_in_pdf', pdfPositionCount: 0, sheetRowCount });
      continue;
    }
    if (sheetRowCount === 0) {
      results.push({ normalizedCode: code, classification: 'UNMATCHED', reason: 'not_in_sheet', pdfPositionCount: positions.length, sheetRowCount });
      continue;
    }
    if (positions.length > 1) {
      results.push({ normalizedCode: code, classification: 'AMBIGUOUS', reason: 'multiple_pdf_positions', pdfPositionCount: positions.length, sheetRowCount });
      continue;
    }
    if (sheetRowCount > 1) {
      results.push({ normalizedCode: code, classification: 'AMBIGUOUS', reason: 'multiple_sheet_rows', pdfPositionCount: positions.length, sheetRowCount });
      continue;
    }
    results.push({ normalizedCode: code, classification: 'MATCHED', position: positions[0], pdfPositionCount: 1, sheetRowCount: 1 });
  }

  return results;
}

function dedupePositions(positions: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
  const kept: { x: number; y: number }[] = [];
  for (const p of positions) {
    const isDuplicate = kept.some(k => Math.hypot(k.x - p.x, k.y - p.y) < tolerance);
    if (!isDuplicate) kept.push(p);
  }
  return kept;
}

export interface IndexingSummary {
  total: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
}

export function summarizeClassification(results: readonly ClassifiedUnit[]): IndexingSummary {
  let matched = 0, ambiguous = 0, unmatched = 0;
  for (const r of results) {
    if (r.classification === 'MATCHED') matched++;
    else if (r.classification === 'AMBIGUOUS') ambiguous++;
    else unmatched++;
  }
  return { total: results.length, matched, ambiguous, unmatched };
}

// ─── Profile-scoped unit code alias rules ──────────────────────────────────
// Trường hợp thực tế gặp trên fixture TĐNĐ1: Bảng hàng dùng mã kinh doanh
// ("TĐ55-11") trong khi bản vẽ PDF dùng mã lưới kỹ thuật ("BM55-11") — CÙNG
// 1 lô đất, 2 quy ước đặt tên khác nhau, số block+số căn giữ nguyên (đã audit
// thủ công 8/8 mã "TĐ" khớp đúng số với "BM" trong PDF). Đây KHÔNG phải lỗi
// encoding (glyphRemap không giải quyết được) và KHÔNG phải fuzzy match (số
// vẫn phải khớp CHÍNH XÁC) — là 1 phép biến đổi tiền tố TẤT ĐỊNH, CHỈ áp dụng
// cho ĐÚNG 1 profile khai báo rule đó (KHÔNG áp dụng toàn cục cho engine),
// và KHÔNG BAO GIỜ mutate mã căn trong Google Sheet — chỉ dùng để TÌM toạ độ
// trong PDF, mã căn lưu trong TmbUnitMapping vẫn là mã kinh doanh gốc.
export interface UnitAliasRule {
  /** Mô tả ngắn, lưu vào provenance để Admin biết rule nào đã áp dụng. */
  label: string;
  /** Regex source (không có flags) — PHẢI có capture group cho từng phần số
   * cần giữ nguyên. Áp lên mã đã normalizeUnitCode (hoa, không khoảng trắng). */
  pattern: string;
  /** Chuỗi thay thế dùng $1/$2/... cho capture group, VD "BM$1-$2". */
  replacement: string;
}

export interface AliasResolution {
  /** Mã đã resolve (normalize), tồn tại thật trong pdfByCode nếu match được. */
  resolvedCode: string;
  rule: UnitAliasRule;
}

/** Áp toàn bộ `rules` (không dừng ở rule đầu tiên khớp pattern — 1 mã LẼ RA
 * chỉ nên khớp đúng 1 rule nếu rule được thiết kế đúng, nhưng nếu khai báo
 * chồng chéo thì CẢ 2 kết quả đều được trả về để classifySheetInventory tự
 * quyết định ambiguous, KHÔNG âm thầm chọn rule đầu). */
export function resolveUnitCodeAliases(normalizedCode: string, rules: readonly UnitAliasRule[]): AliasResolution[] {
  const out: AliasResolution[] = [];
  for (const rule of rules) {
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern);
    } catch {
      continue; // pattern lỗi cấu hình -> bỏ qua rule đó, KHÔNG throw làm hỏng cả lô
    }
    if (!re.test(normalizedCode)) continue;
    const resolved = normalizedCode.replace(re, rule.replacement);
    out.push({ resolvedCode: normalizeUnitCode(resolved), rule });
  }
  return out;
}

/** Shape lưu trong TmbMapProfile.glyph_remap (Json? — không statically-typed
 * ở SQL, cột JSONB) — MỞ RỘNG có chủ đích để chứa CẢ bảng decode ký tự lẫn
 * alias rule, tránh phải thêm cột/migration mới cho 1 khái niệm liên quan
 * (cả 2 đều là "cấu hình riêng của 1 profile PDF cụ thể"). Vẫn nhận dạng
 * được shape CŨ (flat Record<string,string> = charRemap thuần tuý, dùng
 * trước khi có alias) để không phá config đã lưu trước đó. */
export interface TmbProfileDecodeConfig {
  charRemap?: GlyphRemap;
  unitAliasRules?: UnitAliasRule[];
}

export function parseProfileDecodeConfig(raw: unknown): TmbProfileDecodeConfig {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  // Shape mới: có key charRemap và/hoặc unitAliasRules.
  if ('charRemap' in obj || 'unitAliasRules' in obj) {
    return {
      charRemap: (obj.charRemap as GlyphRemap | undefined) ?? undefined,
      unitAliasRules: (obj.unitAliasRules as UnitAliasRule[] | undefined) ?? undefined,
    };
  }
  // Shape cũ (trước khi có alias): flat Record<string,string> = charRemap thuần.
  return { charRemap: obj as GlyphRemap };
}

export type SheetMatchSource = 'direct' | 'alias';

export interface SheetUnitClassification {
  /** Mã căn GỐC trong Bảng hàng — LUÔN là identity chính, kể cả khi match qua alias. */
  originalCode: string;
  normalizedOriginalCode: string;
  classification: MappingClassification;
  matchSource?: SheetMatchSource;
  /** Chỉ có khi matchSource === 'alias' — mã PDF thật đã dùng để tìm toạ độ. */
  resolvedPdfCode?: string;
  aliasRuleLabel?: string;
  position?: { x: number; y: number };
  reason?: 'multiple_candidates' | 'multiple_sheet_rows' | 'no_match';
  sheetRowCount: number;
}

/** So khớp Bảng hàng (driver) với PDF, CHO PHÉP alias tiền tố profile-scoped
 * khi mã gốc không khớp trực tiếp. Thứ tự ưu tiên:
 * 1. >1 dòng Sheet cùng mã -> AMBIGUOUS (lỗi data Sheet, không liên quan PDF).
 * 2. Khớp TRỰC TIẾP (không qua alias) — 1 vị trí -> MATCHED('direct');
 *    >1 vị trí -> AMBIGUOUS.
 * 3. KHÔNG khớp trực tiếp -> thử từng alias rule, gộp TẤT CẢ vị trí từ MỌI
 *    candidate hợp lệ (dedupe theo tolerance) — đúng 1 vị trí DUY NHẤT trên
 *    TOÀN BỘ candidates -> MATCHED('alias'); >1 (dù từ 1 candidate lặp
 *    nhiều vị trí hay nhiều candidate khác nhau) -> AMBIGUOUS; 0 -> UNMATCHED.
 * KHÔNG BAO GIỜ tự bịa mapping cho mã không tìm thấy ở bước 3. */
export function classifySheetInventoryWithAliases(
  extractedLabels: readonly ExtractedLabel[],
  sheetUnitCodes: readonly string[],
  opts: { aliasRules?: readonly UnitAliasRule[]; samePositionToleranceUnits?: number } = {},
): SheetUnitClassification[] {
  const tolerance = opts.samePositionToleranceUnits ?? 1.0;
  const rules = opts.aliasRules ?? [];

  const pdfByCode = new Map<string, { x: number; y: number }[]>();
  for (const label of extractedLabels) {
    const key = normalizeUnitCode(label.code);
    const bucket = pdfByCode.get(key) ?? [];
    bucket.push({ x: label.x, y: label.y });
    pdfByCode.set(key, bucket);
  }

  const byNormalizedCode = new Map<string, { originalCode: string; count: number }>();
  for (const code of sheetUnitCodes) {
    const key = normalizeUnitCode(code);
    const existing = byNormalizedCode.get(key);
    if (existing) existing.count++;
    else byNormalizedCode.set(key, { originalCode: code, count: 1 });
  }

  const results: SheetUnitClassification[] = [];
  for (const [normalizedOriginalCode, { originalCode, count }] of byNormalizedCode) {
    if (count > 1) {
      results.push({ originalCode, normalizedOriginalCode, classification: 'AMBIGUOUS', reason: 'multiple_sheet_rows', sheetRowCount: count });
      continue;
    }

    const directPositions = dedupePositions(pdfByCode.get(normalizedOriginalCode) ?? [], tolerance);
    if (directPositions.length === 1) {
      results.push({ originalCode, normalizedOriginalCode, classification: 'MATCHED', matchSource: 'direct', position: directPositions[0], sheetRowCount: 1 });
      continue;
    }
    if (directPositions.length > 1) {
      results.push({ originalCode, normalizedOriginalCode, classification: 'AMBIGUOUS', reason: 'multiple_candidates', sheetRowCount: 1 });
      continue;
    }

    // Không khớp trực tiếp -> thử alias (nếu profile này có khai báo rule).
    const aliasCandidates = resolveUnitCodeAliases(normalizedOriginalCode, rules);
    const allAliasPositions: { x: number; y: number; rule: UnitAliasRule; resolvedCode: string }[] = [];
    for (const candidate of aliasCandidates) {
      const positions = dedupePositions(pdfByCode.get(candidate.resolvedCode) ?? [], tolerance);
      for (const p of positions) allAliasPositions.push({ ...p, rule: candidate.rule, resolvedCode: candidate.resolvedCode });
    }
    const dedupedAliasPositions = dedupePositions(allAliasPositions, tolerance);

    if (dedupedAliasPositions.length === 0) {
      results.push({ originalCode, normalizedOriginalCode, classification: 'UNMATCHED', reason: 'no_match', sheetRowCount: 1 });
    } else if (dedupedAliasPositions.length === 1) {
      const winner = allAliasPositions.find(p => Math.hypot(p.x - dedupedAliasPositions[0].x, p.y - dedupedAliasPositions[0].y) < tolerance)!;
      results.push({
        originalCode, normalizedOriginalCode, classification: 'MATCHED', matchSource: 'alias',
        resolvedPdfCode: winner.resolvedCode, aliasRuleLabel: winner.rule.label,
        position: { x: winner.x, y: winner.y }, sheetRowCount: 1,
      });
    } else {
      results.push({ originalCode, normalizedOriginalCode, classification: 'AMBIGUOUS', reason: 'multiple_candidates', sheetRowCount: 1 });
    }
  }

  return results;
}

export interface SheetIndexingSummary {
  total: number;
  matchedDirect: number;
  matchedAlias: number;
  ambiguous: number;
  unmatched: number;
}

export function summarizeSheetClassification(results: readonly SheetUnitClassification[]): SheetIndexingSummary {
  let matchedDirect = 0, matchedAlias = 0, ambiguous = 0, unmatched = 0;
  for (const r of results) {
    if (r.classification === 'MATCHED' && r.matchSource === 'direct') matchedDirect++;
    else if (r.classification === 'MATCHED' && r.matchSource === 'alias') matchedAlias++;
    else if (r.classification === 'AMBIGUOUS') ambiguous++;
    else unmatched++;
  }
  return { total: results.length, matchedDirect, matchedAlias, ambiguous, unmatched };
}

// ─── Alias RULE SUGGESTION (TMB Self-Service Ingestion v1) ─────────────────
// Hiện tại `UnitAliasRule` phải do Admin TỰ GÕ tay vào JSON glyph_remap (xem
// TmbManagerPanel.tsx `saveGlyphRemap`) — mục tiêu self-service là ĐỀ XUẤT
// rule này tự động khi bằng chứng đủ mạnh, để Admin chỉ cần "Chấp nhận" thay
// vì tự viết regex. Y HỆT ví dụ TĐNĐ1 (TĐ55-11 Sheet <-> BM55-11 PDF): phát
// hiện các cặp (tiền tố Sheet, tiền tố PDF) mà PHẦN SỐ giữ NGUYÊN Y HỆT giữa
// 1 mã Sheet UNMATCHED và 1 label PDF — CHỈ đề xuất khi bằng chứng KHÔNG mơ hồ
// (đúng 1 tiền tố PDF ứng với phần số đó, khác tiền tố Sheet) và đủ số lượng
// (`minSupport`, mặc định 2 — tránh suy diễn từ 1 trùng hợp ngẫu nhiên).
// KHÔNG fuzzy: phần số phải khớp CHÍNH XÁC (cùng cách `resolveUnitCodeAliases`
// đã dùng cho rule sau khi Admin chấp nhận). Profile-scoped: hàm chỉ nhận vào
// đúng danh sách unmatched + label PDF của 1 profile, KHÔNG đọc/ghi state
// toàn cục nào — gọi lại nhiều lần (VD sau khi Admin chấp nhận 1 rule rồi
// re-index) sẽ tự KHÔNG đề xuất lại rule đã áp dụng (những mã đó không còn
// UNMATCHED nữa). Deterministic: cùng input luôn ra cùng output, sort theo
// support giảm dần rồi theo label để thứ tự ổn định giữa các lần gọi.
const PREFIX_NUMERIC_BODY_PATTERN = /^(\p{Lu}+)(\d.*)$/u;

function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface AliasSuggestion {
  /** Nhãn ngắn cho Admin đọc, VD "TĐ → BM" — cũng dùng làm UnitAliasRule.label khi Admin chấp nhận. */
  label: string;
  /** Regex source (không flags), tương thích thẳng UnitAliasRule.pattern. */
  pattern: string;
  /** Chuỗi thay thế $1, tương thích thẳng UnitAliasRule.replacement. */
  replacement: string;
  /** Số mã Sheet UNMATCHED có bằng chứng KHÔNG mơ hồ ủng hộ rule này. */
  supportCount: number;
  /** Tổng số mã UNMATCHED đưa vào xét (mẫu số hiển thị dạng "X/Y"). */
  totalUnmatched: number;
  /** Ví dụ cụ thể (tối đa 5) để Admin tự kiểm tra trước khi chấp nhận. */
  examples: { sheetCode: string; pdfCode: string }[];
}

/** Đề xuất `UnitAliasRule` từ các mã Sheet UNMATCHED + toàn bộ label PDF trích
 * xuất được (thô, CHƯA alias-resolve — dùng `labels` từ `extractPdfUnitLabels`,
 * KHÔNG dùng danh sách đã lọc theo rule cũ). `existingRuleLabels` (tuỳ chọn)
 * để loại bỏ đề xuất trùng nhãn rule Admin đã chấp nhận trước đó — tránh gợi ý
 * lặp lại thứ đã áp dụng rồi. */
export function suggestUnitAliasRules(
  unmatchedCodes: readonly string[],
  extractedLabels: readonly ExtractedLabel[],
  opts: { minSupport?: number; existingRuleLabels?: ReadonlySet<string> } = {},
): AliasSuggestion[] {
  const minSupport = opts.minSupport ?? 2;
  const totalUnmatched = unmatchedCodes.length;

  // Số thân (phần sau chữ cái đầu) -> tập tiền tố PDF phân biệt đã thấy, mỗi
  // tiền tố giữ 1 mã ví dụ (mã ĐÃ normalize, để hiển thị nhất quán).
  const bodyToPdfPrefixes = new Map<string, Map<string, string>>();
  for (const l of extractedLabels) {
    const norm = normalizeUnitCode(l.code);
    const m = norm.match(PREFIX_NUMERIC_BODY_PATTERN);
    if (!m) continue;
    const [, prefix, body] = m;
    const bucket = bodyToPdfPrefixes.get(body) ?? new Map<string, string>();
    if (!bucket.has(prefix)) bucket.set(prefix, norm);
    bodyToPdfPrefixes.set(body, bucket);
  }

  const pairs = new Map<string, { sheetPrefix: string; pdfPrefix: string; examples: { sheetCode: string; pdfCode: string }[]; count: number }>();
  for (const code of unmatchedCodes) {
    const norm = normalizeUnitCode(code);
    const m = norm.match(PREFIX_NUMERIC_BODY_PATTERN);
    if (!m) continue;
    const [, sheetPrefix, body] = m;
    const pdfPrefixes = bodyToPdfPrefixes.get(body);
    if (!pdfPrefixes || pdfPrefixes.size === 0) continue;

    // Bằng chứng KHÔNG mơ hồ: đúng 1 tiền tố PDF khác tiền tố Sheet ứng với
    // CÙNG phần số này — >1 candidate nghĩa là không rõ ràng, bỏ qua (KHÔNG
    // đoán), giống hệt nguyên tắc "multiple_candidates -> AMBIGUOUS" của
    // classifySheetInventoryWithAliases, chỉ áp dụng sớm hơn ở bước đề xuất.
    const candidates = [...pdfPrefixes.entries()].filter(([prefix]) => prefix !== sheetPrefix);
    if (candidates.length !== 1) continue;
    const [pdfPrefix, examplePdfCode] = candidates[0];

    const key = `${sheetPrefix} ${pdfPrefix}`;
    const entry = pairs.get(key) ?? { sheetPrefix, pdfPrefix, examples: [], count: 0 };
    entry.count++;
    if (entry.examples.length < 5) entry.examples.push({ sheetCode: code, pdfCode: examplePdfCode });
    pairs.set(key, entry);
  }

  const existingLabels = opts.existingRuleLabels ?? new Set<string>();
  const suggestions: AliasSuggestion[] = [];
  for (const { sheetPrefix, pdfPrefix, examples, count } of pairs.values()) {
    if (count < minSupport) continue;
    const label = `${sheetPrefix} → ${pdfPrefix}`;
    if (existingLabels.has(label)) continue;
    suggestions.push({
      label,
      pattern: `^${escapeRegExpLiteral(sheetPrefix)}(\\d.*)$`,
      replacement: `${pdfPrefix}$1`,
      supportCount: count,
      totalUnmatched,
      examples,
    });
  }

  suggestions.sort((a, b) => b.supportCount - a.supportCount || a.label.localeCompare(b.label));
  return suggestions;
}
