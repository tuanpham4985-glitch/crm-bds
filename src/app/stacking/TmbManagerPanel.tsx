'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, RefreshCw, Trash2, CheckCircle, Loader2, Map as MapIcon, Upload, FileText, ChevronDown, ChevronRight, Sparkles, Eye } from 'lucide-react';
import TmbMap from './TmbMap';
import { dbProfileToTmbMapProfile } from './tmb-map-registry';
import type { TmbMapProfile } from './tmb-map-data';
import type { StackingConfig, StackingListRow } from '@/lib/types';

/** TMB Manager — panel Admin quản lý Tổng mặt bằng (Section 9 TMB Manager
 * spec): tạo profile, Phân tích/Tối ưu/Quét mã căn, review + mapping thủ
 * công, Kích hoạt/Xoá. File RIÊNG (không nhét vào page.tsx 1900+ dòng) —
 * cùng convention modal/panel với ManagePanel ("Quản lý Sheet") đã có.
 *
 * KHÔNG động tới TmbMap.tsx/tmb-map-data.ts (renderer + registry tĩnh production-
 * stable) — panel này CHỈ nói chuyện với API /api/stacking/tmb-profiles/*,
 * hoàn toàn tách biệt khỏi luồng xem TMB của Sale.
 */

interface TmbProfileRow {
  id: string;
  stacking_config_id: string;
  label: string;
  subdivision: string | null;
  source_type: string;
  master_asset_ref: string;
  web_asset_ref: string | null;
  page_number: number;
  page_width: number | null;
  page_height: number | null;
  rotation: number;
  unit_code_field: string | null;
  glyph_remap: unknown;
  status: string;
  error_message: string | null;
  master_size_bytes: number | null;
  web_size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

/** Shape TỐI THIỂU để validate — cố ý KHÔNG import parseProfileDecodeConfig/
 * UnitAliasRule từ tmb-indexer.ts vào đây: file đó import pdfjs-dist ở top
 * level (chỉ chạy được server-side), kéo vào bundle client 'use client' này
 * sẽ vỡ build/runtime. Field name/semantics giữ NGUYÊN THEO ĐÚNG contract
 * TmbProfileDecodeConfig/UnitAliasRule thật (server đọc lại bằng
 * parseProfileDecodeConfig, không phải model riêng) — đổi 1 bên phải đổi cả 2. */
export function validateGlyphRemapConfig(rawText: string): { ok: true; value: unknown } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    return { ok: false, error: `JSON không hợp lệ: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Phải là 1 object JSON (VD {} hoặc {"charRemap": {...}, "unitAliasRules": [...]})' };
  }
  const obj = parsed as Record<string, unknown>;
  const hasNewShapeKeys = 'charRemap' in obj || 'unitAliasRules' in obj;

  if (hasNewShapeKeys) {
    if ('charRemap' in obj && obj.charRemap !== undefined) {
      const cr = obj.charRemap;
      if (cr === null || typeof cr !== 'object' || Array.isArray(cr)) {
        return { ok: false, error: 'charRemap phải là object (VD {"55": "B"})' };
      }
      for (const [k, v] of Object.entries(cr as Record<string, unknown>)) {
        if (typeof v !== 'string') return { ok: false, error: `charRemap["${k}"] phải là string, nhận được ${typeof v}` };
      }
    }
    if ('unitAliasRules' in obj && obj.unitAliasRules !== undefined) {
      const rules = obj.unitAliasRules;
      if (!Array.isArray(rules)) return { ok: false, error: 'unitAliasRules phải là mảng' };
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        if (!r || typeof r !== 'object') return { ok: false, error: `unitAliasRules[${i}] phải là object` };
        const { label, pattern, replacement } = r as Record<string, unknown>;
        if (typeof label !== 'string' || !label) return { ok: false, error: `unitAliasRules[${i}].label phải là string không rỗng` };
        if (typeof pattern !== 'string' || !pattern) return { ok: false, error: `unitAliasRules[${i}].pattern phải là string không rỗng` };
        if (typeof replacement !== 'string') return { ok: false, error: `unitAliasRules[${i}].replacement phải là string` };
        try {
          new RegExp(pattern);
        } catch (e) {
          return { ok: false, error: `unitAliasRules[${i}].pattern không phải regex hợp lệ: ${e instanceof Error ? e.message : String(e)}` };
        }
      }
    }
    return { ok: true, value: parsed };
  }

  // Shape cũ (tương thích ngược) — flat Record<string,string> = charRemap thuần.
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string') return { ok: false, error: `"${k}" phải là string (shape cũ = charRemap phẳng), hoặc dùng shape mới {"charRemap": {...}}` };
  }
  return { ok: true, value: parsed };
}

/** Guard tổng hợp cho "Tải lên & xử lý" — TÁCH RIÊNG khỏi handleSimpleUpload()
 * để test được điều kiện chặn re-entrancy/duplicate-click ĐỘC LẬP với
 * React/DOM (regression cho bug upload-loop đã audit trên production, file
 * 206.6MB — xem comment đầy đủ tại handleSimpleUpload). `inFlight` PHẢI đọc
 * từ 1 ref đồng bộ ở nơi gọi (uploadInFlightRef), KHÔNG phải React state —
 * state chỉ cập nhật theo chu kỳ render nên không đủ nhanh để chặn click thứ
 * 2 xảy ra TRƯỚC khi React kịp re-render nút disabled. */
export function canStartSimpleUpload(opts: { inFlight: boolean; label: string; file: unknown; storageConfigured: boolean | null }): boolean {
  if (opts.inFlight) return false;
  if (!opts.label.trim() || !opts.file) return false;
  if (opts.storageConfigured === false) return false;
  return true;
}

/** Quyết định resume-point khi Admin bấm lại "Tải lên & xử lý" sau 1 lỗi:
 * đã có `resumeProfileId` (profile đã tạo ở lượt trước, lỗi xảy ra ở 1 bước
 * SAU upload — analyze/optimize/index) -> 'resume_processing', SKIP HẲN
 * upload+create, KHÔNG đụng lại file gốc; chưa có -> 'start_fresh' (lượt
 * upload đầu tiên, hoặc đã hoàn tất/đã đổi file nên bị reset về null). Tách
 * riêng để test trực tiếp bất biến "retry sau lỗi hậu-upload KHÔNG tự upload
 * lại file 100-300MB" mà không cần dựng React/DOM. */
export function resolveUploadResumePoint(resumeProfileId: string | null): 'start_fresh' | 'resume_processing' {
  return resumeProfileId ? 'resume_processing' : 'start_fresh';
}

interface AliasSuggestion {
  label: string;
  pattern: string;
  replacement: string;
  supportCount: number;
  totalUnmatched: number;
  examples: { sheetCode: string; pdfCode: string }[];
}

interface IndexResult {
  summary: { total: number; matchedDirect: number; matchedAlias: number; ambiguous: number; unmatched: number };
  autoCreated: number;
  autoSkippedManual: number;
  matchedDirect: { code: string }[];
  ambiguous: { code: string; reason?: string; sheetRowCount: number }[];
  unmatched: { code: string; reason?: string }[];
  matchedAlias: { code: string; resolvedPdfCode?: string; aliasRuleLabel?: string }[];
  suggestedAliasRules: AliasSuggestion[];
  sheetInventoryCount: number;
  sheetInventoryCountNormalized: number;
}

/** Giai đoạn pipeline "Tải lên & xử lý" (Simple Mode, one-click) — MỖI bước
 * gọi 1 request riêng tới ĐÚNG route hiện có (upload trực tiếp Blob, rồi
 * POST tuần tự /tmb-profiles, /analyze, /optimize, /index) — KHÔNG gộp thành
 * 1 request server-side duy nhất (Section "One-click processing pipeline":
 * "Nếu file lớn khiến synchronous execution không an toàn: thiết kế safe
 * staged processing"). Mỗi bước tự chịu timeout riêng của Vercel Function,
 * và có thể retry lại đúng bước lỗi qua "Chi tiết kỹ thuật" mà KHÔNG cần
 * upload lại file hay tạo trùng profile (idempotent theo thiết kế của từng
 * route — xem index/route.ts upsert theo unique normalized_unit_code). */
type UploadStage = 'idle' | 'uploading' | 'uploaded' | 'creating' | 'analyzing' | 'optimizing' | 'indexing' | 'done' | 'error';
const UPLOAD_STAGE_LABEL: Record<UploadStage, string> = {
  idle: '', uploading: 'Đang tải PDF lên Blob...', uploaded: 'Đã tải PDF — đang tạo hồ sơ',
  creating: 'Đang tạo hồ sơ...', analyzing: 'Đang phân tích bản vẽ...', optimizing: 'Đang tối ưu file...',
  indexing: 'Đang khớp mã căn...', done: 'Sẵn sàng Review', error: 'Lỗi',
};

/** Đọc lại glyph_remap hiện có ở đúng shape TmbProfileDecodeConfig (server
 * đọc bằng parseProfileDecodeConfig, tmb-indexer.ts) để ghép thêm 1 alias rule
 * mới khi Admin "Chấp nhận quy tắc" — viết lại RIÊNG (không import
 * tmb-indexer.ts, file đó kéo theo pdfjs-dist chỉ chạy server-side, xem comment
 * validateGlyphRemapConfig phía trên). Field/semantics PHẢI khớp contract thật
 * — đổi 1 bên phải đổi cả 2. */
function decodeConfigForClient(raw: unknown): { charRemap?: Record<string, string>; unitAliasRules: { label: string; pattern: string; replacement: string }[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { unitAliasRules: [] };
  const obj = raw as Record<string, unknown>;
  if ('charRemap' in obj || 'unitAliasRules' in obj) {
    return {
      charRemap: (obj.charRemap as Record<string, string> | undefined) ?? undefined,
      unitAliasRules: Array.isArray(obj.unitAliasRules) ? obj.unitAliasRules as { label: string; pattern: string; replacement: string }[] : [],
    };
  }
  return { charRemap: obj as Record<string, string>, unitAliasRules: [] };
}

// ─── "Sao chép cấu hình decode" (TMB Alias Suggestion Fix) ─────────────────
// Root cause đã audit: 1 số PDF xuất từ CAD có font label bị lỗi ToUnicode
// (đã gặp thực tế trên fixture TĐNĐ1) — KHÔNG có charRemap thì extractPdfUnitLabels
// không trích được BẤT KỲ mã căn nào đọc được (không chỉ riêng phần "Bảng
// hàng dùng tiền tố khác PDF" mà suggestUnitAliasRules giải quyết — engine đó
// hoạt động ĐÚNG khi có label hợp lệ để so sánh, xem tests/crm/tmb-alias-
// suggestion-fix.test.ts). Vì charRemap là DATA RIÊNG của 1 file PDF cụ thể
// (không suy luận/đoán được an toàn — sai 1 ký tự là mapping sai âm thầm),
// hướng xử lý generic + an toàn nhất KHÔNG phải "tự động dò" mà là: nếu 1
// profile CÙNG dự án (`stackingConfigId`, đã load sẵn trong `profiles`, KHÔNG
// gọi API mới) đã có charRemap hoạt động (Admin từng tự xác nhận đúng), CHO
// PHÉP Admin sao chép sang profile mới — vẫn cần Admin bấm xác nhận tường
// minh, KHÔNG tự áp. Copy CHỈ charRemap (bảng giải mã ký tự) — unitAliasRules
// KHÔNG copy theo (giữ nguyên rule đã có của CHÍNH profile này), Admin vẫn
// phải "Chấp nhận quy tắc" riêng cho alias suggestion sau khi re-index — 2
// khái niệm tách biệt (decode ký tự vs. luật đổi tiền tố mã căn), không gộp
// để tránh Admin vô tình áp rule của 1 profile khác không liên quan.

/** 1 profile có charRemap "hữu ích" để làm nguồn sao chép — object rỗng {}
 * (hoặc glyph_remap null/chưa cấu hình) không giải quyết được gì. */
export function hasUsableCharRemap(raw: unknown): boolean {
  const cfg = decodeConfigForClient(raw);
  return !!cfg.charRemap && Object.keys(cfg.charRemap).length > 0;
}

/** Danh sách profile khác (CÙNG dự án, đã có sẵn trong `profiles` state —
 * KHÔNG gọi API mới) có thể làm nguồn "Sao chép cấu hình decode" cho
 * `currentId`. Generic: KHÔNG lọc theo subdivision/label/dự án cụ thể nào —
 * Admin tự chọn đúng nguồn phù hợp trong danh sách (thường là bản PDF cùng
 * file/font đã từng cấu hình đúng). */
export function findCopyableDecodeSourceProfiles(profiles: readonly TmbProfileRow[], currentId: string): TmbProfileRow[] {
  return profiles.filter(o => o.id !== currentId && hasUsableCharRemap(o.glyph_remap));
}

/** Điều kiện đủ mạnh để gợi ý "Sao chép cấu hình decode" — CHỈ khi review vừa
 * chạy cho kết quả KHÔNG khớp gì cả (matchedDirect=0, matchedAlias=0) VÀ
 * suggestUnitAliasRules cũng KHÔNG đề xuất được gì (suggestedAliasRules rỗng)
 * — đây là dấu hiệu PDF text chưa giải mã ra được mã căn đọc được nào (khác
 * hẳn "chỉ đơn giản không có mã nào trùng", trường hợp đó suggestedAliasRules
 * vẫn có thể có gợi ý nếu partial). KHÔNG hiện nếu không có profile nào khác
 * để mượn cấu hình (`candidateCount === 0`) — tránh gợi ý vô nghĩa. */
export function shouldSuggestDecodeCopy(
  index: { summary: { matchedDirect: number; matchedAlias: number }; suggestedAliasRules: readonly unknown[] } | undefined,
  candidateCount: number,
): boolean {
  if (!index || candidateCount === 0) return false;
  return index.summary.matchedDirect === 0 && index.summary.matchedAlias === 0 && index.suggestedAliasRules.length === 0;
}

interface AnalyzeResult {
  fileSizeBytes: number;
  pageCount: number;
  page: { width: number; height: number; rotation: number };
  hasTextLayer: boolean;
  textItemCount: number;
  classification: string;
  images: { path: string; width: number; height: number; streamBytes: number; role: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp', ANALYZED: 'Đã phân tích', READY_FOR_REVIEW: 'Chờ review', ACTIVE: 'Đang dùng', ERROR: 'Lỗi',
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: '#9ca3af', ANALYZED: '#3b82f6', READY_FOR_REVIEW: '#f59e0b', ACTIVE: '#22c55e', ERROR: '#ef4444',
};

function fmtMB(bytes: number | null): string {
  if (!bytes) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TmbManagerPanel({ stackingConfigId, stackingConfigLabel, onClose }: {
  stackingConfigId: string;
  stackingConfigLabel: string;
  onClose: () => void;
}) {
  const [profiles, setProfiles] = useState<TmbProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastAnalyze, setLastAnalyze] = useState<Record<string, AnalyzeResult>>({});
  const [lastIndex, setLastIndex] = useState<Record<string, IndexResult>>({});
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  const [form, setForm] = useState({ label: '', subdivision: '', master_asset_ref: '' });
  const [saving, setSaving] = useState(false);
  const [showAdvancedAdd, setShowAdvancedAdd] = useState(false); // form nhập tay master_asset_ref (nâng cao) — ẩn mặc định, xem Section "Simple mode vs Technical mode"

  const [manualForm, setManualForm] = useState<{ profileId: string; unitCode: string; x: string; y: string } | null>(null);

  // ── Simple Mode: upload file trực tiếp + one-click processing ────────────
  const [storageConfigured, setStorageConfigured] = useState<boolean | null>(null); // null = chưa biết (đang tải /api/stacking/info)
  const [simpleLabel, setSimpleLabel] = useState('');
  const [simpleSubdivision, setSimpleSubdivision] = useState('');
  const [simpleFile, setSimpleFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Khoá đồng bộ (ref, KHÔNG phải state) chống re-entrancy — kiểm tra + set
  // TRƯỚC bất kỳ await/state update nào trong handleSimpleUpload(), nên click
  // đúp/click lặp trong lúc React chưa kịp re-render nút disabled (bug thật
  // đã audit: race giữa DOM click event và React commit) không thể lọt qua 2
  // lần. State (uploadStage) chỉ quyết định UI, KHÔNG đủ để chống race vì cập
  // nhật bất đồng bộ theo chu kỳ render.
  const uploadInFlightRef = useRef(false);
  // Id profile ĐÃ TẠO cho lượt upload đang xử lý (nếu có) — khi 1 bước SAU
  // upload (analyze/optimize/index) lỗi, giữ lại id này để lần bấm "Tải lên &
  // xử lý" tiếp theo SKIP hẳn bước upload+tạo profile (không upload lại file
  // 100-300MB, không tạo profile trùng), chỉ chạy lại analyze->optimize->index
  // (đã idempotent theo thiết kế route hiện có — xem comment handleSimpleUpload).
  // Reset về null khi: chọn file mới, chạy xong toàn bộ pipeline, hoặc đóng form.
  const [resumeProfileId, setResumeProfileId] = useState<string | null>(null);

  // Bật/tắt "Chi tiết kỹ thuật" theo từng profile — mặc định ĐÓNG (Simple Mode
  // là mặc định của Admin thường, xem Section "Simple mode vs Technical mode").
  // KHÔNG xoá bất kỳ action/field kỹ thuật nào, chỉ gấp gọn lại.
  const [technicalOpenIds, setTechnicalOpenIds] = useState<Set<string>>(new Set());
  const [reviewTabByProfile, setReviewTabByProfile] = useState<Record<string, 'matched' | 'alias' | 'unmatched' | 'ambiguous'>>({});

  // ── "Xem TMB" (Review Preview) — Admin xem trước web_asset_ref của 1 profile
  // READY_FOR_REVIEW (hoặc bất kỳ status nào đã có web_asset_ref, VD ACTIVE)
  // TRƯỚC khi Kích hoạt, bằng ĐÚNG renderer TmbMap.tsx Sale dùng — KHÔNG viết
  // renderer PDF thứ 2. `previewProfileId` = id đang preview (đồng bộ trạng
  // thái loading với đúng nút đang bấm); `previewMapProfile` = kết quả đã
  // convert (null = chưa mở/đã đóng). Đọc-only tuyệt đối: chỉ 1 lời gọi GET
  // (route [id]/route.ts đã cho phép Admin đọc BẤT KỲ status nào, xem comment
  // route đó "Admin xem asset của profile bất kỳ để review trước khi
  // activate"), KHÔNG PATCH/POST/DELETE nào trong toàn bộ luồng preview.
  const [previewProfileId, setPreviewProfileId] = useState<string | null>(null);
  const [previewMapProfile, setPreviewMapProfile] = useState<TmbMapProfile | null>(null);
  const [previewError, setPreviewError] = useState<Record<string, string>>({});
  // Bảng hàng SỐNG cho preview — CÙNG nguồn dữ liệu + cách gọi page.tsx đã
  // dùng cho luồng Sale bình thường (fetchListRows: /api/stacking/configs rồi
  // /api/stacking?mode=list, xem fetchPreviewListRows bên dưới), KHÔNG tạo
  // nguồn dữ liệu thứ 2. Trước fix này luôn là [] cứng — khiến MỌI mapping
  // (dù đúng toạ độ) resolve "unmatched" (buildMaCanIndex([]) rỗng), nên
  // "Còn hàng" trong preview luôn ra 0 bất kể profile đã map bao nhiêu mã
  // (xem audit "TMB_OLD_VS_NEW_ROOT_CAUSE"). Lỗi tải Bảng hàng KHÔNG được làm
  // hỏng preview PDF (yêu cầu gốc "visual preview phải hoạt động dù mapped =
  // 0") — fetchPreviewListRows tự nuốt lỗi, trả [] thay vì throw.
  const [previewListRows, setPreviewListRows] = useState<StackingListRow[]>([]);

  // "Sao chép cấu hình decode" (xem findCopyableDecodeSourceProfiles phía
  // trên) — profile nguồn Admin đang chọn trong <select> theo từng profile.
  const [copySourceId, setCopySourceId] = useState<Record<string, string>>({});
  const [copyingId, setCopyingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/stacking/info').then(r => r.json()).then(d => {
      if (d.success) setStorageConfigured(Boolean(d.tmb_storage_configured));
    }).catch(() => setStorageConfigured(false));
  }, []);

  function toggleTechnical(id: string) {
    setTechnicalOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Cấu hình decode/alias (glyph_remap) — draft text theo từng profile (chưa
  // gõ gì thì hiển thị giá trị THẬT đang lưu, xem glyphRemapText() bên dưới).
  // KHÔNG hard-code bất kỳ config cụ thể (VD TĐNĐ1) nào ở đây — Admin tự dán
  // JSON cho ĐÚNG profile đang sửa, generic cho mọi profile.
  const [glyphRemapDraft, setGlyphRemapDraft] = useState<Record<string, string>>({});
  const [glyphRemapError, setGlyphRemapError] = useState<Record<string, string>>({});
  const [glyphRemapSavingId, setGlyphRemapSavingId] = useState<string | null>(null);

  function glyphRemapText(p: TmbProfileRow): string {
    return glyphRemapDraft[p.id] ?? JSON.stringify(p.glyph_remap ?? {}, null, 2);
  }

  async function saveGlyphRemap(p: TmbProfileRow) {
    const validation = validateGlyphRemapConfig(glyphRemapText(p));
    if (!validation.ok) {
      setGlyphRemapError(m => ({ ...m, [p.id]: validation.error }));
      return;
    }
    setGlyphRemapError(m => ({ ...m, [p.id]: '' }));
    setGlyphRemapSavingId(p.id);
    try {
      const r = await fetch(`/api/stacking/tmb-profiles/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ glyph_remap: validation.value }),
      });
      const d = await r.json();
      if (d.success) {
        setGlyphRemapDraft(m => { const next = { ...m }; delete next[p.id]; return next; });
        setActionMsg(m => ({ ...m, [p.id]: 'Đã lưu cấu hình decode/alias' }));
        await load();
      } else {
        setGlyphRemapError(m => ({ ...m, [p.id]: d.error || 'Không lưu được' }));
      }
    } catch {
      setGlyphRemapError(m => ({ ...m, [p.id]: 'Lỗi kết nối server' }));
    } finally {
      setGlyphRemapSavingId(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/stacking/tmb-profiles?stacking_config_id=${encodeURIComponent(stackingConfigId)}`);
      const d = await r.json();
      if (d.success) setProfiles(d.data);
      else setError(d.error || 'Lỗi tải danh sách');
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  }, [stackingConfigId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.label.trim() || !form.master_asset_ref.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/stacking/tmb-profiles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stacking_config_id: stackingConfigId,
          label: form.label.trim(),
          subdivision: form.subdivision.trim() || undefined,
          master_asset_ref: form.master_asset_ref.trim(),
        }),
      });
      const d = await r.json();
      if (d.success) {
        setForm({ label: '', subdivision: '', master_asset_ref: '' });
        setShowAddForm(false);
        await load();
      } else {
        setError(d.error || 'Không tạo được profile');
      }
    } finally {
      setSaving(false);
    }
  }

  /** "Tải lên & xử lý" (Simple Mode, one-click) — Section "Upload architecture"
   * + "One-click processing pipeline": browser upload TRỰC TIẾP tới Vercel
   * Blob (KHÔNG qua body Next.js API — giới hạn cứng ~4.5MB serverless), rồi
   * gọi TUẦN TỰ đúng các route hiện có (tạo profile JSON -> analyze -> optimize
   * -> index) — mỗi bước 1 request riêng, KHÔNG gộp 1 request server-side làm
   * hết (an toàn với file 200MB+, mỗi bước tự chịu timeout riêng của Vercel
   * Function). Lỗi ở bước nào dừng ở đó, profile giữ trạng thái ERROR/đã tạo
   * -> Admin retry đúng bước đó qua "Chi tiết kỹ thuật" mà KHÔNG upload lại
   * file/tạo trùng profile.
   *
   * REGRESSION FIX (upload-loop bug đã audit trên production, file 206.6MB):
   * 2 nguyên nhân ĐỘC LẬP, cả 2 đã fix:
   * 1. `access: 'public'` SAI khi Blob store production cấu hình Private —
   *    Vercel Blob API từ chối request, SDK client (`requestApi`,
   *    @vercel/blob) không map được lỗi vào 1 mã cụ thể (rơi vào nhánh
   *    "unknown_error") NÊN coi là retryable và tự gửi lại TOÀN BỘ file qua
   *    `async-retry` (mặc định 10 lần) — mỗi lần gửi lại là 1 request PUT MỚI
   *    nên onUploadProgress tụt về 0% rồi leo lại, lặp tới 10 lần trước khi
   *    thật sự fail. Fix: đổi `access` thành 'private' (khớp store thật, xem
   *    tmb-storage.ts VercelBlobAssetStorage.put() comment đầy đủ).
   * 2. KHÔNG có khoá chống re-entrancy — nếu Admin bấm lại nút SAU KHI 1 bước
   *    sau-upload lỗi (analyze/optimize/index), hàm này chạy lại TỪ ĐẦU, upload
   *    lại NGUYÊN file + tạo THÊM 1 profile mới (trùng). Fix: `uploadInFlightRef`
   *    (khoá đồng bộ, chặn double-click/re-entry) + `resumeProfileId` (nếu đã
   *    tạo profile cho lượt hiện tại, lần bấm lại SKIP hẳn upload+create, chỉ
   *    chạy lại analyze->optimize->index — an toàn vì cả 3 route đó đã
   *    idempotent theo thiết kế sẵn có, xem index/route.ts upsert theo unique
   *    normalized_unit_code). */
  async function handleSimpleUpload() {
    // Guard TRƯỚC mọi state/await khác — dùng CHUNG canStartSimpleUpload() với
    // test (tests/crm/tmb-upload-flow.test.ts) để runtime/test không lệch nhau.
    if (!canStartSimpleUpload({ inFlight: uploadInFlightRef.current, label: simpleLabel, file: simpleFile, storageConfigured })) {
      if (uploadInFlightRef.current || !simpleLabel.trim() || !simpleFile) return; // im lặng — nút đã disabled tương ứng, hoặc double-click/re-entry
      setUploadStage('error');
      setUploadError('Chưa cấu hình Object Storage cho Tổng mặt bằng — liên hệ Admin kỹ thuật (cần env TMB_ASSET_STORAGE_PROVIDER + BLOB_READ_WRITE_TOKEN, xem tài liệu TMB Self-Service Ingestion).');
      return;
    }
    const file = simpleFile;
    if (!file) return; // đã được canStartSimpleUpload() chặn, guard lại để TypeScript narrow đúng kiểu File
    uploadInFlightRef.current = true;
    setUploadError('');
    try {
      // resumeProfileId đã có -> lượt upload+create TRƯỚC ĐÓ đã xong, lỗi xảy
      // ra ở 1 bước SAU đó -> SKIP hẳn upload+create, không đụng lại file gốc.
      let id = resumeProfileId;

      if (resolveUploadResumePoint(resumeProfileId) === 'start_fresh') {
        setUploadProgress(0);
        setUploadStage('uploading');
        const { upload } = await import('@vercel/blob/client');
        const blob = await upload(`${stackingConfigId}/${Date.now()}-${file.name}`, file, {
          access: 'private',
          handleUploadUrl: '/api/stacking/tmb-profiles/upload-url',
          onUploadProgress: (p) => setUploadProgress(Math.round(p.percentage)),
        });
        setUploadStage('uploaded');

        setUploadStage('creating');
        const createRes = await fetch('/api/stacking/tmb-profiles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stacking_config_id: stackingConfigId,
            label: simpleLabel.trim(),
            subdivision: simpleSubdivision.trim() || undefined,
            master_asset_ref: blob.url,
            master_size_bytes: file.size,
          }),
        });
        const created = await createRes.json();
        if (!created.success) throw new Error(created.error || 'Không tạo được hồ sơ Tổng mặt bằng');
        id = created.data.id as string;
        setResumeProfileId(id); // đánh dấu NGAY — nếu bước sau lỗi, lần retry tới sẽ skip đúng đoạn này
        await load();
      }

      setUploadStage('analyzing');
      const analyzeRes = await fetch(`/api/stacking/tmb-profiles/${id}/analyze`, { method: 'POST' }).then(r => r.json());
      if (!analyzeRes.success) throw new Error(analyzeRes.error || 'Phân tích thất bại');
      setLastAnalyze(m => ({ ...m, [id!]: analyzeRes.data.analysis }));

      setUploadStage('optimizing');
      const optimizeRes = await fetch(`/api/stacking/tmb-profiles/${id}/optimize`, { method: 'POST' }).then(r => r.json());
      if (!optimizeRes.success) throw new Error(optimizeRes.error || 'Tối ưu thất bại');

      setUploadStage('indexing');
      const indexRes = await fetch(`/api/stacking/tmb-profiles/${id}/index`, { method: 'POST' }).then(r => r.json());
      if (!indexRes.success) throw new Error(indexRes.error || 'Quét mã căn thất bại');
      setLastIndex(m => ({ ...m, [id!]: indexRes.data }));

      setUploadStage('done');
      setExpandedId(id);
      setResumeProfileId(null); // pipeline xong trọn vẹn — lần bấm tiếp theo (nếu có) là 1 upload MỚI hoàn toàn
      setSimpleLabel(''); setSimpleSubdivision(''); setSimpleFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (e) {
      setUploadStage('error');
      setUploadError(e instanceof Error ? e.message : 'Lỗi không xác định trong lúc xử lý');
      await load(); // profile (nếu đã tạo) vẫn hiện trong danh sách với status ERROR/đúng bước đã xong — không mồ côi, không mất tiến độ; resumeProfileId GIỮ NGUYÊN để lần bấm lại resume đúng chỗ
    } finally {
      uploadInFlightRef.current = false;
    }
  }

  /** "Chấp nhận quy tắc" (Section "Alias suggestion — UX quan trọng") — Admin
   * xác nhận TƯỜNG MINH 1 đề xuất alias (suggestUnitAliasRules, tmb-indexer.ts)
   * trước khi nó được áp dụng: ghép rule vào glyph_remap.unitAliasRules hiện
   * có (PATCH, KHÔNG ghi đè charRemap/rule khác) rồi chạy lại "Quét mã căn" để
   * rule mới thật sự tạo mapping AUTO_TEXT cho các mã vừa khớp được. */
  async function acceptAliasSuggestion(p: TmbProfileRow, suggestion: AliasSuggestion) {
    setBusyId(p.id);
    try {
      const current = decodeConfigForClient(p.glyph_remap);
      const nextConfig = {
        charRemap: current.charRemap,
        unitAliasRules: [...current.unitAliasRules, { label: suggestion.label, pattern: suggestion.pattern, replacement: suggestion.replacement }],
      };
      const patchRes = await fetch(`/api/stacking/tmb-profiles/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ glyph_remap: nextConfig }),
      }).then(r => r.json());
      if (!patchRes.success) { setActionMsg(m => ({ ...m, [p.id]: `Lỗi: ${patchRes.error}` })); return; }

      const indexRes = await fetch(`/api/stacking/tmb-profiles/${p.id}/index`, { method: 'POST' }).then(r => r.json());
      if (indexRes.success) {
        setLastIndex(m => ({ ...m, [p.id]: indexRes.data }));
        setActionMsg(m => ({ ...m, [p.id]: `Đã chấp nhận quy tắc "${suggestion.label}"` }));
      } else {
        setActionMsg(m => ({ ...m, [p.id]: `Đã lưu quy tắc nhưng quét lại lỗi: ${indexRes.error}` }));
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  /** "Sao chép cấu hình decode & Quét lại" — Admin chọn 1 profile CÙNG dự án
   * đã có charRemap hoạt động (`sourceId`, xem findCopyableDecodeSourceProfiles)
   * rồi bấm xác nhận tường minh: PATCH charRemap của nguồn vào profile hiện
   * tại (GIỮ NGUYÊN unitAliasRules đã có của CHÍNH profile này — KHÔNG copy
   * alias rule của nguồn, xem comment đầu khối "Sao chép cấu hình decode"),
   * rồi chạy lại "Quét mã căn" ngay để review cập nhật — cùng pattern với
   * acceptAliasSuggestion() phía trên, KHÔNG viết luồng PATCH+re-index thứ 2. */
  async function copyDecodeConfig(p: TmbProfileRow, sourceId: string) {
    const source = profiles.find(o => o.id === sourceId);
    if (!source) return;
    const sourceConfig = decodeConfigForClient(source.glyph_remap);
    if (!sourceConfig.charRemap || Object.keys(sourceConfig.charRemap).length === 0) return;
    setCopyingId(p.id);
    try {
      const current = decodeConfigForClient(p.glyph_remap);
      const nextConfig = { charRemap: sourceConfig.charRemap, unitAliasRules: current.unitAliasRules };
      const patchRes = await fetch(`/api/stacking/tmb-profiles/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ glyph_remap: nextConfig }),
      }).then(r => r.json());
      if (!patchRes.success) { setActionMsg(m => ({ ...m, [p.id]: `Lỗi: ${patchRes.error}` })); return; }

      const indexRes = await fetch(`/api/stacking/tmb-profiles/${p.id}/index`, { method: 'POST' }).then(r => r.json());
      if (indexRes.success) {
        setLastIndex(m => ({ ...m, [p.id]: indexRes.data }));
        setActionMsg(m => ({ ...m, [p.id]: `Đã sao chép cấu hình decode từ "${source.label}"` }));
      } else {
        setActionMsg(m => ({ ...m, [p.id]: `Đã lưu cấu hình nhưng quét lại lỗi: ${indexRes.error}` }));
      }
      await load();
    } finally {
      setCopyingId(null);
    }
  }

  async function runAction(id: string, action: 'analyze' | 'optimize' | 'index' | 'delete') {
    setBusyId(id); setActionMsg(m => ({ ...m, [id]: '' }));
    try {
      if (action === 'delete') {
        if (!confirm('Xoá map profile này? Mapping của nó cũng bị xoá theo (KHÔNG ảnh hưởng Bảng hàng/Sheet).')) { setBusyId(null); return; }
        const r = await fetch(`/api/stacking/tmb-profiles/${id}`, { method: 'DELETE' });
        const d = await r.json();
        if (d.success) await load(); else setError(d.error);
        return;
      }
      const r = await fetch(`/api/stacking/tmb-profiles/${id}/${action}`, { method: 'POST' });
      const d = await r.json();
      if (!d.success) {
        setActionMsg(m => ({ ...m, [id]: `Lỗi: ${d.error}` }));
        await load();
        return;
      }
      if (action === 'analyze') setLastAnalyze(m => ({ ...m, [id]: d.data.analysis }));
      if (action === 'index') setLastIndex(m => ({ ...m, [id]: d.data }));
      setActionMsg(m => ({ ...m, [id]: 'OK' }));
      setExpandedId(id);
      await load();
    } catch {
      setActionMsg(m => ({ ...m, [id]: 'Lỗi kết nối server' }));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActivate(profile: TmbProfileRow) {
    setBusyId(profile.id);
    try {
      const action = profile.status === 'ACTIVE' ? 'deactivate' : 'activate';
      const r = await fetch(`/api/stacking/tmb-profiles/${profile.id}/activate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (!d.success) setActionMsg(m => ({ ...m, [profile.id]: `Lỗi: ${d.error}` }));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  /** "Xem TMB" — tải chi tiết profile (CÙNG route GET /api/stacking/tmb-profiles/[id]
   * dùng bởi useDbTmbMapProfiles cho runtime ACTIVE-only, nhưng gọi TRỰC TIẾP
   * cho ĐÚNG 1 profile Admin chọn, không qua hook lọc ACTIVE), convert bằng
   * ĐÚNG dbProfileToTmbMapProfile() rồi mount TmbMap — KHÔNG đổi status, KHÔNG
   * ghi DB. `mappings` rỗng (VD hồ sơ QA "HLX - TĐNĐ1 - Test" hiện 0/11 mapped)
   * vẫn convert thành công (units: []) — TmbMap vẫn render nền PDF đầy đủ để
   * kiểm tra fidelity (hồ/đường/cảnh quan), chỉ không có marker nào, ĐÚNG yêu
   * cầu "visual preview phải hoạt động dù mapped = 0". */
  async function openPreview(p: TmbProfileRow) {
    setPreviewError(m => ({ ...m, [p.id]: '' }));
    setPreviewProfileId(p.id);
    setPreviewListRows([]); // reset — không để rows của lượt preview TRƯỚC lọt sang profile này
    try {
      const detailRes = await fetch(`/api/stacking/tmb-profiles/${p.id}`).then(r => r.json());
      if (!detailRes.success) throw new Error(detailRes.error || 'Không tải được chi tiết profile');
      const mapProfile = dbProfileToTmbMapProfile(detailRes.data.profile, detailRes.data.mappings);
      if (!mapProfile) throw new Error('Profile chưa có web_asset_ref (chưa Tối ưu xong) — chưa thể xem trước.');
      // Bảng hàng SỐNG — lỗi ở bước này KHÔNG được chặn preview PDF (fetchPreviewListRows
      // tự nuốt lỗi, trả [] — giữ đúng bất biến "visual preview phải hoạt động dù mapped = 0").
      const rows = await fetchPreviewListRows(p.stacking_config_id);
      setPreviewMapProfile(mapProfile);
      setPreviewListRows(rows);
    } catch (e) {
      setPreviewError(m => ({ ...m, [p.id]: e instanceof Error ? e.message : 'Lỗi tải xem trước TMB' }));
    } finally {
      setPreviewProfileId(null);
    }
  }

  /** Bảng hàng SỐNG cho preview — 2 lời gọi CÙNG route đọc-only page.tsx đã
   * dùng cho luồng Sale (fetchListRows): /api/stacking/configs (tìm đúng
   * sheet_id/tab/project_code/visible_columns của stackingConfigId) rồi
   * /api/stacking?mode=list (đúng rows sống, đúng semantics buildMaCanIndex
   * đang dùng cho ACTIVE — KHÔNG lọc thêm theo subdivision, giống hệt Sale
   * runtime không lọc). KHÔNG throw — lỗi mạng/config thiếu sheet_tab chỉ
   * trả [] (preview PDF vẫn phải render được, chỉ "Còn hàng" tạm thời không
   * có số liệu, giống hệt hành vi mapped=0 đã có từ trước). */
  async function fetchPreviewListRows(stackingConfigId: string): Promise<StackingListRow[]> {
    try {
      const configsRes = await fetch('/api/stacking/configs').then(r => r.json());
      if (!configsRes.success) return [];
      const config = (configsRes.data as StackingConfig[]).find(c => c.id === stackingConfigId);
      if (!config || config.loai !== 'list' || !config.sheet_tab) return [];
      const params = new URLSearchParams({ mode: 'list', sheet_id: config.sheet_id, tab: config.sheet_tab });
      if (config.project_code) params.set('project_code', config.project_code);
      if (config.visible_columns && config.visible_columns.length > 0) params.set('columns', config.visible_columns.join('|'));
      const listRes = await fetch(`/api/stacking?${params}`).then(r => r.json());
      return listRes.success ? (listRes.data.rows as StackingListRow[]) : [];
    } catch {
      return [];
    }
  }

  async function saveManualMapping() {
    if (!manualForm) return;
    const x = Number(manualForm.x), y = Number(manualForm.y);
    if (!manualForm.unitCode.trim() || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const r = await fetch(`/api/stacking/tmb-profiles/${manualForm.profileId}/mappings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_code: manualForm.unitCode.trim(), x, y }),
    });
    const d = await r.json();
    if (d.success) {
      setManualForm(null);
      setActionMsg(m => ({ ...m, [manualForm.profileId]: `Đã lưu mapping thủ công cho ${manualForm.unitCode}` }));
    } else {
      setError(d.error);
    }
  }

  return (
    <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: 10, width: 'min(920px, 94vw)', maxHeight: '88vh',
        boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
        overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapIcon size={18} /> Quản lý TMB — {stackingConfigLabel}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {error && (
          <div style={{ padding: '8px 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.85rem' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem' }}>
            <RefreshCw size={14} style={loading ? { animation: 'spin 0.7s linear infinite' } : undefined} /> Làm mới
          </button>
          <button onClick={() => setShowAddForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem' }}>
            <Plus size={14} /> Thêm Tổng mặt bằng
          </button>
        </div>

        {showAddForm && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {storageConfigured === false && (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.78rem' }}>
                Chưa cấu hình Object Storage cho upload trực tiếp (cần env <code>TMB_ASSET_STORAGE_PROVIDER=vercel-blob</code> + <code>BLOB_READ_WRITE_TOKEN</code> trên production) — liên hệ Admin kỹ thuật. Vẫn có thể dùng "Nhập thủ công (nâng cao)" bên dưới nếu đã có sẵn master_asset_ref từ ingest server-side.
              </div>
            )}

            <input placeholder="Tên TMB (VD: HLX · TĐNĐ1)" value={simpleLabel} onChange={e => setSimpleLabel(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)' }} />
            <input placeholder="Phân khu (tuỳ chọn, VD: TĐNĐ1)" value={simpleSubdivision} onChange={e => setSimpleSubdivision(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)' }} />

            <div>
              <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                onChange={e => {
                  // Chọn file MỚI (khác lượt trước, kể cả cùng tên) -> bỏ hẳn
                  // resumeProfileId cũ — retry chỉ được resume đúng profile
                  // của CHÍNH file đang resume, không lỡ tay resume nhầm profile
                  // của 1 lượt upload khác đã đổi file giữa chừng.
                  setSimpleFile(e.target.files?.[0] ?? null);
                  setResumeProfileId(null);
                  setUploadStage('idle');
                  setUploadError('');
                }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadStage !== 'idle' && uploadStage !== 'done' && uploadStage !== 'error'}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', width: '100%', justifyContent: 'center' }}>
                <Upload size={14} /> Chọn file PDF
              </button>
              {simpleFile && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-label)' }}>
                  <FileText size={13} /> {simpleFile.name} · {fmtMB(simpleFile.size)}
                </div>
              )}
            </div>

            {uploadStage !== 'idle' && (
              <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6, color: uploadStage === 'error' ? '#dc2626' : uploadStage === 'done' ? '#16a34a' : 'var(--text-label)' }}>
                {uploadStage !== 'done' && uploadStage !== 'error' && <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} />}
                {UPLOAD_STAGE_LABEL[uploadStage]}
                {uploadStage === 'uploading' && ` (${uploadProgress}%)`}
                {uploadStage === 'error' && `: ${uploadError}`}
                {uploadStage === 'done' && ' — xem Review bên dưới'}
              </div>
            )}
            {uploadStage === 'error' && resumeProfileId && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-label)' }}>
                PDF đã tải lên và hồ sơ đã tạo (ID {resumeProfileId}) — bấm "Tải lên & xử lý" lần nữa sẽ CHỈ chạy lại đúng bước lỗi, KHÔNG tải lại file.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSimpleUpload}
                disabled={!simpleLabel.trim() || !simpleFile || (uploadStage !== 'idle' && uploadStage !== 'done' && uploadStage !== 'error')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                {uploadStage !== 'idle' && uploadStage !== 'done' && uploadStage !== 'error' ? 'Đang xử lý...' : 'Tải lên & xử lý'}
              </button>
              <button onClick={() => { setShowAddForm(false); setUploadStage('idle'); setUploadError(''); setResumeProfileId(null); }} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem' }}>Đóng</button>
            </div>

            <button onClick={() => setShowAdvancedAdd(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 0, border: 'none', background: 'none', color: 'var(--text-label)', cursor: 'pointer', fontSize: '0.72rem', textAlign: 'left' }}>
              {showAdvancedAdd ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Nhập thủ công (nâng cao) — đã có sẵn master_asset_ref/storage key
            </button>
            {showAdvancedAdd && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4, borderLeft: '2px solid var(--border)' }}>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-label)' }}>
                  Dùng khi file đã được ingest sẵn server-side (VD script cho file quá lớn, hoặc path tĩnh dưới public/) — dán key/path trực tiếp, KHÔNG upload lại qua đây.
                </p>
                <input placeholder="Tên TMB (VD: HLX · TĐNĐ1)" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }} />
                <input placeholder="Phân khu (tuỳ chọn, VD: TĐNĐ1)" value={form.subdivision} onChange={e => setForm(f => ({ ...f, subdivision: e.target.value }))}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }} />
                <input placeholder="master_asset_ref (path public/... hoặc storage key)" value={form.master_asset_ref} onChange={e => setForm(f => ({ ...f, master_asset_ref: e.target.value }))}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }} />
                <div>
                  <button onClick={handleAdd} disabled={saving || !form.label.trim() || !form.master_asset_ref.trim()} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                    {saving ? 'Đang lưu...' : 'Tạo (DRAFT)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {profiles.length === 0 && !loading && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-label)' }}>Chưa có Tổng mặt bằng nào cho nguồn này.</p>
          )}
          {profiles.map(p => {
            const analysis = lastAnalyze[p.id];
            const index = lastIndex[p.id];
            return (
              <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>{p.label}</strong>{p.subdivision && <span style={{ color: 'var(--text-label)' }}> · {p.subdivision}</span>}
                    <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: '#fff', background: STATUS_COLOR[p.status] }}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {p.web_asset_ref && (
                      <button disabled={previewProfileId === p.id} onClick={() => openPreview(p)} title="Xem trước bản vẽ TMB (đọc-only, không đổi trạng thái)" style={actionBtnStyle}>
                        {previewProfileId === p.id ? <Loader2 size={12} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Eye size={12} />} Xem TMB
                      </button>
                    )}
                    {(p.status === 'READY_FOR_REVIEW' || p.status === 'ACTIVE') && (
                      <button disabled={busyId === p.id} onClick={() => toggleActivate(p)} style={{ ...actionBtnStyle, borderColor: p.status === 'ACTIVE' ? '#ef4444' : '#22c55e', color: p.status === 'ACTIVE' ? '#ef4444' : '#22c55e' }}>
                        {p.status === 'ACTIVE' ? 'Ngừng dùng' : 'Kích hoạt'}
                      </button>
                    )}
                    <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'delete')} style={{ ...actionBtnStyle, color: '#ef4444', borderColor: '#ef4444' }}><Trash2 size={12} /></button>
                    <button onClick={() => setExpandedId(id => id === p.id ? null : p.id)} style={actionBtnStyle}>{expandedId === p.id ? 'Thu gọn' : 'Review'}</button>
                  </div>
                </div>

                <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-label)' }}>
                  Master: {fmtMB(p.master_size_bytes)} · Web: {fmtMB(p.web_size_bytes)}
                  {p.page_width && p.page_height && ` · Trang: ${p.page_width.toFixed(0)}×${p.page_height.toFixed(0)}pt (rotation ${p.rotation}°)`}
                  {busyId === p.id && <Loader2 size={12} style={{ marginLeft: 6, verticalAlign: 'middle', animation: 'spin 0.7s linear infinite' }} />}
                  {actionMsg[p.id] && actionMsg[p.id] !== 'OK' && <span style={{ color: '#dc2626', marginLeft: 6 }}>{actionMsg[p.id]}</span>}
                </div>
                {p.error_message && (
                  <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: '0.78rem' }}>{p.error_message}</div>
                )}
                {previewError[p.id] && (
                  <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: '0.78rem' }}>{previewError[p.id]}</div>
                )}

                {expandedId === p.id && (
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {!index && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-label)', margin: 0 }}>
                        Chưa có kết quả "Quét mã căn" — mở "Chi tiết kỹ thuật" bên dưới để chạy, hoặc dùng "Tải lên & xử lý" cho profile mới.
                      </p>
                    )}
                    {index && (() => {
                      const mappedCount = index.summary.matchedDirect + index.summary.matchedAlias;
                      const activeTab = reviewTabByProfile[p.id] ?? (index.summary.unmatched > 0 ? 'unmatched' : 'matched');
                      const setTab = (t: typeof activeTab) => setReviewTabByProfile(m => ({ ...m, [p.id]: t }));
                      const TABS: { key: typeof activeTab; label: string; count: number }[] = [
                        { key: 'matched', label: '✅ Khớp trực tiếp', count: index.summary.matchedDirect },
                        { key: 'alias', label: '🔄 Khớp theo quy tắc', count: index.summary.matchedAlias },
                        { key: 'unmatched', label: '⚠️ Chưa tìm thấy', count: index.summary.unmatched },
                        { key: 'ambiguous', label: '❌ Trùng/không rõ', count: index.summary.ambiguous },
                      ];
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            Bảng hàng: {index.sheetInventoryCountNormalized} căn — {mappedCount}/{index.sheetInventoryCountNormalized} căn đã map
                          </div>

                          {(() => {
                            const copyCandidates = findCopyableDecodeSourceProfiles(profiles, p.id);
                            if (!shouldSuggestDecodeCopy(index, copyCandidates.length)) return null;
                            const selectedSourceId = copySourceId[p.id] ?? copyCandidates[0].id;
                            return (
                              <div style={{ padding: '8px 10px', borderRadius: 6, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: '0.78rem' }}>
                                <div style={{ fontWeight: 600, color: '#9a3412' }}>Không đọc được mã căn nào từ PDF này</div>
                                <div style={{ marginTop: 3, color: 'var(--text-label)' }}>
                                  Có thể font PDF bị lỗi encoding — {copyCandidates.length} profile khác cùng dự án đã có cấu hình giải mã, thử sao chép sang profile này:
                                </div>
                                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <select value={selectedSourceId} onChange={e => setCopySourceId(m => ({ ...m, [p.id]: e.target.value }))} style={{ fontSize: '0.78rem', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}>
                                    {copyCandidates.map(c => <option key={c.id} value={c.id}>{c.label}{c.subdivision ? ` · ${c.subdivision}` : ''}</option>)}
                                  </select>
                                  <button disabled={copyingId === p.id} onClick={() => copyDecodeConfig(p, selectedSourceId)} style={{ ...actionBtnStyle, borderColor: '#ea580c', color: '#ea580c' }}>
                                    {copyingId === p.id ? <Loader2 size={12} style={{ animation: 'spin 0.7s linear infinite' }} /> : null} Sao chép cấu hình decode & Quét lại
                                  </button>
                                </div>
                              </div>
                            );
                          })()}

                          {index.suggestedAliasRules.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {index.suggestedAliasRules.map(s => (
                                <div key={s.label} style={{ padding: '8px 10px', borderRadius: 6, background: '#eef2ff', border: '1px solid #c7d2fe', fontSize: '0.78rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#3730a3' }}>
                                    <Sparkles size={13} /> Phát hiện quy tắc: {s.label}
                                  </div>
                                  <div style={{ marginTop: 3, color: 'var(--text-label)' }}>
                                    {s.supportCount}/{s.totalUnmatched} mã chưa tìm thấy khớp phần số chính xác qua quy tắc này
                                    {s.examples.length > 0 && ` (VD: ${s.examples.slice(0, 3).map(e => `${e.sheetCode}→${e.pdfCode}`).join(', ')})`}
                                  </div>
                                  <div style={{ marginTop: 6 }}>
                                    <button disabled={busyId === p.id} onClick={() => acceptAliasSuggestion(p, s)} style={{ ...actionBtnStyle, borderColor: '#4f46e5', color: '#4f46e5' }}>
                                      Chấp nhận quy tắc
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {TABS.map(t => (
                              <button key={t.key} onClick={() => setTab(t.key)} style={{
                                ...actionBtnStyle,
                                background: activeTab === t.key ? 'var(--primary)' : 'transparent',
                                color: activeTab === t.key ? '#fff' : 'var(--text-body)',
                                borderColor: activeTab === t.key ? 'var(--primary)' : 'var(--border)',
                              }}>
                                {t.label}: {t.count}
                              </button>
                            ))}
                          </div>

                          <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                              <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--bg-secondary, #f8fafc)' }}>
                                  <th style={{ padding: '5px 8px' }}>Mã căn (Sheet)</th>
                                  <th style={{ padding: '5px 8px' }}>Mã PDF</th>
                                  <th style={{ padding: '5px 8px' }}>Ghi chú</th>
                                  {activeTab === 'unmatched' && <th style={{ padding: '5px 8px' }} />}
                                </tr>
                              </thead>
                              <tbody>
                                {activeTab === 'matched' && index.matchedDirect.map(r => (
                                  <tr key={r.code} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '5px 8px' }}>{r.code}</td>
                                    <td style={{ padding: '5px 8px', color: 'var(--text-label)' }}>=</td>
                                    <td style={{ padding: '5px 8px', color: 'var(--text-label)' }}>Khớp trực tiếp</td>
                                  </tr>
                                ))}
                                {activeTab === 'alias' && index.matchedAlias.map(r => (
                                  <tr key={r.code} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '5px 8px' }}>{r.code}</td>
                                    <td style={{ padding: '5px 8px' }}>{r.resolvedPdfCode}</td>
                                    <td style={{ padding: '5px 8px', color: 'var(--text-label)' }}>{r.aliasRuleLabel}</td>
                                  </tr>
                                ))}
                                {activeTab === 'unmatched' && index.unmatched.map(r => (
                                  <tr key={r.code} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '5px 8px' }}>{r.code}</td>
                                    <td style={{ padding: '5px 8px', color: 'var(--text-label)' }}>—</td>
                                    <td style={{ padding: '5px 8px', color: 'var(--text-label)' }}>Chưa có trong PDF</td>
                                    <td style={{ padding: '5px 8px' }}>
                                      <button onClick={() => { toggleTechnical(p.id); setManualForm({ profileId: p.id, unitCode: r.code, x: '', y: '' }); }} style={actionBtnStyle}>
                                        Nhập toạ độ
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {activeTab === 'ambiguous' && index.ambiguous.map(r => (
                                  <tr key={r.code} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '5px 8px' }}>{r.code}</td>
                                    <td style={{ padding: '5px 8px', color: 'var(--text-label)' }}>—</td>
                                    <td style={{ padding: '5px 8px', color: 'var(--text-label)' }}>{r.reason} ({r.sheetRowCount} dòng Sheet)</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}

                    <button onClick={() => toggleTechnical(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 0, border: 'none', background: 'none', color: 'var(--text-label)', cursor: 'pointer', fontSize: '0.75rem', textAlign: 'left', marginTop: 4 }}>
                      {technicalOpenIds.has(p.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Chi tiết kỹ thuật
                    </button>

                    {technicalOpenIds.has(p.id) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 4, borderLeft: '2px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'analyze')} style={actionBtnStyle}>Phân tích</button>
                          <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'optimize')} style={actionBtnStyle}>Tối ưu</button>
                          <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'index')} style={actionBtnStyle}>Quét mã căn (làm mới review)</button>
                        </div>

                        <div style={{ fontSize: '0.72rem', color: 'var(--text-label)' }}>
                          master_asset_ref: <code>{p.master_asset_ref}</code>{p.web_asset_ref && <> · web_asset_ref: <code>{p.web_asset_ref}</code></>}
                        </div>

                        {analysis && (
                          <div style={{ fontSize: '0.78rem' }}>
                            <strong>Phân tích gần nhất:</strong> {analysis.pageCount} trang · Text layer: {analysis.hasTextLayer ? 'Có' : 'Không'} ({analysis.textItemCount} items) · Phân loại: {analysis.classification} · {analysis.images.length} ảnh raster
                          </div>
                        )}
                        {index && (
                          <div style={{ fontSize: '0.78rem' }}>
                            <strong>Quét mã căn gần nhất:</strong> Bảng hàng {index.sheetInventoryCount} dòng ({index.sheetInventoryCountNormalized} mã duy nhất) ·
                            Matched trực tiếp: {index.summary.matchedDirect} · Matched qua alias: {index.summary.matchedAlias} · Ambiguous: {index.summary.ambiguous} · Unmatched: {index.summary.unmatched} ·
                            Tự tạo mapping: {index.autoCreated} (bỏ qua {index.autoSkippedManual} đã có MANUAL)
                          </div>
                        )}

                        <div>
                          <strong style={{ fontSize: '0.78rem' }}>Cấu hình decode/alias (glyph_remap):</strong>
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-label)', margin: '4px 0' }}>
                            JSON, áp dụng CHỈ cho profile này. Rỗng ({'{}'}) = dùng text layer PDF nguyên bản. Dùng khi PDF có font mã căn bị lỗi encoding (charRemap) và/hoặc Bảng hàng dùng mã kinh doanh khác mã lưới kỹ thuật trong PDF (unitAliasRules) — bình thường nên dùng "Chấp nhận quy tắc" ở Review thay vì gõ tay ở đây.
                          </p>
                          <textarea
                            value={glyphRemapText(p)}
                            onChange={e => setGlyphRemapDraft(m => ({ ...m, [p.id]: e.target.value }))}
                            rows={6}
                            spellCheck={false}
                            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.75rem', padding: 8, borderRadius: 6, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                          />
                          {glyphRemapError[p.id] && (
                            <div style={{ marginTop: 4, padding: '6px 10px', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem' }}>{glyphRemapError[p.id]}</div>
                          )}
                          <div style={{ marginTop: 6 }}>
                            <button disabled={glyphRemapSavingId === p.id} onClick={() => saveGlyphRemap(p)} style={actionBtnStyle}>
                              {glyphRemapSavingId === p.id ? 'Đang lưu...' : 'Lưu cấu hình'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <strong style={{ fontSize: '0.78rem' }}>Mapping thủ công (Section 8):</strong>
                          {manualForm?.profileId === p.id ? (
                            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                              <input placeholder="Mã căn" value={manualForm.unitCode} onChange={e => setManualForm(f => f && ({ ...f, unitCode: e.target.value }))} style={smallInputStyle} />
                              <input placeholder="x (pdf user-space)" value={manualForm.x} onChange={e => setManualForm(f => f && ({ ...f, x: e.target.value }))} style={smallInputStyle} />
                              <input placeholder="y (pdf user-space)" value={manualForm.y} onChange={e => setManualForm(f => f && ({ ...f, y: e.target.value }))} style={smallInputStyle} />
                              <button onClick={saveManualMapping} style={actionBtnStyle}><CheckCircle size={12} /> Lưu</button>
                              <button onClick={() => setManualForm(null)} style={actionBtnStyle}>Huỷ</button>
                            </div>
                          ) : (
                            <button onClick={() => setManualForm({ profileId: p.id, unitCode: '', x: '', y: '' })} style={{ ...actionBtnStyle, marginLeft: 8 }}>+ Thêm mapping</button>
                          )}
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-label)', marginTop: 4 }}>
                            v1: nhập toạ độ số trực tiếp (đơn vị PDF user-space, trang chưa xoay/scale — cùng hệ TmbMap.tsx đang dùng). Click-to-place trên canvas là cải tiến tương lai (Phase B).
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    {previewMapProfile && (
      // z-index 1000 > 900 (overlay chính panel này) — TmbMap PHẢI nổi lên
      // trên, không phải khuất phía sau (xem TmbMap.tsx Props.zIndex comment).
      // listRows=previewListRows (Bảng hàng SỐNG, xem fetchPreviewListRows) —
      // để "Còn hàng"/marker phản ánh ĐÚNG trạng thái thật (trước fix này
      // luôn [] cứng, khiến mọi mapping resolve "unmatched" dù toạ độ đúng,
      // xem audit "TMB_OLD_VS_NEW_ROOT_CAUSE"). onOpenUnit VẪN no-op — preview
      // vẫn đọc-only tuyệt đối, KHÔNG mở popup chi tiết/điều hướng nghiệp vụ
      // như luồng Sale (page.tsx) — chỉ thêm đúng 1 thứ: số liệu Còn hàng +
      // marker available đúng thật, không thêm bất kỳ hành động ghi/điều
      // hướng nào khác.
      <TmbMap
        profile={previewMapProfile}
        listRows={previewListRows}
        onOpenUnit={() => {}}
        onClose={() => { setPreviewMapProfile(null); setPreviewListRows([]); }}
        zIndex={1000}
      />
    )}
    </>
  );
}

const actionBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.72rem',
};
const smallInputStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.78rem', width: 120,
};
