'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { X, Loader2, AlertCircle, Plus, Minus, RefreshCw, Maximize2, Locate, Search } from 'lucide-react';
import type { StackingListRow } from '@/lib/types';
import { fmtGia, fmtArea } from './format';
import { TMB_PDF_WORKER_URL, tmbShortLabel, type TmbMapProfile } from './tmb-map-data';
import { buildMaCanIndex, resolveTmbUnitState, resolveTrimmedUnitSearch, type TmbUnitState } from './tmb-map-matching';
import { buildTmbPreview } from './tmb-map-preview';
import { applyWheelZoom, screenPointToContentPoint, contentPointToScroll, touchDistance, touchMidpoint, applyPinchZoom } from './tmb-map-zoom';
import { exceedsDragThreshold, applyPanScroll, computeScaledContentSize, computeCenteringMargin } from './tmb-map-pan';
import {
  computeRenderQuality, shouldUpgradeRenderQuality, computeInitialRenderScale, VIEWPORT_RENDER_QUALITY_CAPS,
} from './tmb-map-render-quality';
import { mapPdfPointToStaticImagePoint } from './tmb-map-static-background';
import {
  computeVisibleContentRect, applyOverscan, clampRectToPageBounds, rectSize, rectContains, rectToDisplayBox,
  OVERSCAN_FRACTION, type Rect,
} from './tmb-map-viewport';
import type { PDFPageProxy, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
// TEMPORARY — TMB_HLX_MOBILE_FAILURE_STAGE audit (xoá sau khi có kết luận,
// xem tmb-diag.ts): chỉ log khi ?tmbdiag=1, không đổi hành vi mặc định.
// CỐ Ý KHÔNG import từ './tmb-map-load-watchdog' — đó là 1 candidate THAY ĐỔI
// HÀNH VI timeout riêng (progress-aware watchdog), tách biệt hoàn toàn khỏi
// candidate diagnostic-only này (xem tmb-map-load-watchdog.ts, vẫn còn trong
// working tree nhưng KHÔNG được dùng ở đây — giữ nguyên LOAD_TIMEOUT_MS phẳng
// cũ bên dưới, đúng hành vi đã release, để diagnostic không lẫn với 1 thay đổi
// hành vi chưa được duyệt riêng).
import { isTmbDiagEnabled, diagMark, canvasMB, attachGlobalDiagListenersOnce, mountDiagOverlayOnce } from './tmb-diag';

/** Tổng mặt bằng (TMB) — render trang TMB (PDF thật) làm nền + marker theo
 * toạ độ text layer, click marker -> lookup Mã căn trong Bảng hàng hiện có
 * (đúng authority effectiveDotStatus) -> mở CHÍNH popup chi tiết căn
 * (ListUnitDetailModal, truyền vào qua onOpenUnit).
 *
 * PROJECT-AGNOSTIC: component này KHÔNG hard-code PDF/unit của bất kỳ dự án
 * nào — nhận toàn bộ qua prop `profile` (TmbMapProfile, xem tmb-map-data.ts).
 * Nhiều dự án (VD Vinhomes Sài Gòn Park, Vinhomes Global Gate HLX · VBM1)
 * dùng CHUNG renderer này, chỉ khác `profile` truyền vào — caller
 * (stacking/page.tsx) resolve đúng profile theo StackingConfig.id đang chọn
 * (resolveTmbMapProfile) TRƯỚC khi mount component.
 *
 * AVAILABLE-ONLY: chỉ căn "Còn hàng" (effectiveDotStatus === 'con_hang')
 * mới hiển thị + clickable/hoverable. Đã bán/Đang xem/unmatched/ambiguous
 * KHÔNG bao giờ hiển thị trên bản đồ.
 *
 * Map CHỈ mang unitCode + toạ độ (profile.units) — không chứa business data
 * (giá/diện tích/trạng thái); toàn bộ business data + trạng thái lookup SỐNG
 * từ `listRows` (Bảng hàng) mỗi lần render, đúng nguyên tắc PDF = spatial
 * authority, Bảng hàng = business/status authority. Đổi trạng thái 1 căn ở
 * Bảng hàng (VD Còn hàng -> Đã bán) tự phản ánh ở đây, không cần sửa spatial map.
 *
 * ── Fit-to-view & zoom ───────────────────────────────────────────────────
 * pdf.js vẽ canvas 1 lần ở BASE_SCALE=1 (độ phân giải gốc, cố định — không
 * đổi theo zoom). Hiển thị dùng 2 tầng scale nhân với nhau:
 *   - fitScale: tự tính = kích thước container / kích thước canvas gốc, để
 *     TOÀN BỘ trang vừa khung. Đổi khi container resize (ResizeObserver).
 *   - zoomMultiplier: hệ số User điều chỉnh qua +/-, TƯƠNG ĐỐI so với
 *     fitScale (mặc định 1.0x = đúng bằng fit, không phải 1.0x = độ phân
 *     giải gốc — tránh gọi sai "1.0x" là fit khi thực tế không vừa khung).
 * effectiveScale = fitScale * zoomMultiplier dùng để CSS-scale canvas VÀ
 * tính vị trí marker từ CÙNG 1 toạ độ gốc (viewX/viewY ở BASE_SCALE=1) ->
 * canvas và marker luôn khớp tuyệt đối ở MỌI mức zoom/pan/resize.
 *
 * ── Adaptive whole-page rendering (canvasRef — FALLBACK/background) ──────
 * Canvas backing store (canvas.width/height, độ phân giải RASTER thật) ban
 * đầu vẽ 1 lần ở `initialRenderScale` — THƯỜNG = BASE_SCALE=1 (VD Sài Gòn
 * Park, ~3370×2384px, đo thật bằng pdf.js), nhưng bị kẹp XUỐNG DƯỚI 1 (dùng
 * lại computeMaxRenderScale) nếu trang PDF native đủ lớn để vượt ngân sách
 * canvas an toàn (root cause mobile OOM đã audit trên PDF raster nặng, xem
 * TMB_MOBILE_HLX_ROOT_CAUSE_PROVEN) — viewport BASE_SCALE=1 vẫn LUÔN là
 * geometry authority (marker/canvasSize), hoàn toàn tách biệt khỏi renderScale
 * raster này. CSS width/height (scaledSize, hiển thị) phóng bitmap CỐ ĐỊNH đó lên tới 20x,
 * gây mờ ở zoom sâu (browser upscale, không có thêm điểm ảnh). Sau khi zoom
 * ổn định (debounce, xem RENDER_DEBOUNCE_MS), gọi lại pdf.js page.render()
 * (page giữ trong pageRef, KHÔNG re-fetch/re-parse PDF) ở renderScale cao
 * hơn — xem tmb-map-render-quality.ts cho công thức + hard cap tránh canvas
 * khổng lồ/OOM (bị giới hạn ~2.23x cho TOÀN trang vì phải đủ lớn phủ hết
 * trang). renderScale này CHỈ quyết định độ phân giải raster của canvas —
 * KHÔNG BAO GIỜ được dùng cho vị trí marker hay CSS display size, cả 2 vẫn
 * 100% dựa trên effectiveScale + viewport BASE_SCALE=1 như cũ.
 *
 * ── Viewport high-resolution overlay (viewportOverlayCanvasRef) ──────────
 * Ở zoom sâu (5x/10x/20x), cap ~2.23x của whole-page KHÔNG đủ — nền vẫn mờ.
 * Vùng NGƯỜI DÙNG ĐANG NHÌN luôn nhỏ hơn nhiều so với toàn trang nên render
 * ĐƯỢC ở scale cao hơn NHIỀU mà canvas vẫn nhỏ (tỉ lệ theo khung nhìn, không
 * theo trang) — dùng CHÍNH pageRef + kỹ thuật offsetX/offsetY NATIVE của
 * pdf.js (page.getViewport({scale, offsetX, offsetY})) để chỉ RASTERIZE vùng
 * cần, KHÔNG render toàn trang rồi crop (xem tmb-map-viewport.ts +
 * renderViewportHighRes). Overlay là 1 <canvas> RIÊNG, đè lên đúng vị trí
 * tương ứng trên canvas nền qua rectToDisplayBox (CÙNG công thức
 * `contentCoord * effectiveScale` marker đã dùng — không tạo hệ toạ độ thứ
 * 2). Canvas nền (whole-page) LUÔN tiếp tục tồn tại làm fallback — nếu
 * overlay render fail/cancel/timeout, map vẫn dùng được bình thường qua nền.
 */

const BASE_SCALE = 1;
const MIN_ZOOM_MULT = 1;   // không cho zoom nhỏ hơn fit — dưới fit chỉ thừa viền trống, không có ích
// Canvas raster cố định ở BASE_SCALE=1 (độ phân giải gốc trang PDF, ~3370px
// rộng) — 1 nhãn mã căn trên bản vẽ chỉ rộng ~2-3px NGAY CẢ ở độ phân giải
// gốc (font CAD export rất nhỏ so với khổ trang), nên vượt quá 1:1 pixel là
// điều BẮT BUỘC để đọc được mã căn trực tiếp trên nền PDF, không phải lỗi.
// Label DOM riêng (crisp, không phụ thuộc canvas) đã đảm bảo đọc được mã căn
// dù nền PDF có hơi mờ ở zoom sâu — tradeoff đã biết, chấp nhận cho v1 (xem
// architecture guard: không mở tile/CAD rendering pipeline trong milestone này).
const MAX_ZOOM_MULT = 20;
const ZOOM_STEP = 0.25;        // bước nút +/- (giữ nguyên hành vi cũ)
const WHEEL_ZOOM_FACTOR = 0.08; // bước wheel — nhân, nhỏ/mượt hơn nút +/-
const DEFAULT_ZOOM_MULT = 1; // mở TMB = fit-to-view mặc định, KHÔNG auto-zoom vào khu Còn hàng
const MARKER_SIZE_PX = 12;   // marker cố định theo pixel màn hình (không theo scale) — gọn để không đè lên căn sát cạnh
// Chỉ hiện label Mã căn thường trực khi đã zoom đủ gần — tránh chữ chồng
// chéo che bản đồ lúc xem toàn cảnh (yêu cầu "không che quá nhiều bản đồ").
// Ở zoom thấp hơn, vẫn xem được mã căn qua hover/focus (preview card).
const LABEL_VISIBLE_AT_ZOOM = 2;
const FOCUS_PADDING = 1.6;   // "Tới khu Còn hàng": chừa viền quanh bounding box khu vực
// Ô tìm mã căn: zoom TỐI THIỂU khi nhảy tới 1 căn cụ thể (đủ gần để marker đỏ
// nổi bật, không cần zoom hết cỡ) — CHỈ zoom LÊN nếu đang thấp hơn mức này,
// giữ nguyên zoom hiện tại nếu User đã zoom sâu hơn (không zoom lùi lại).
const SEARCH_FOCUS_ZOOM = 6;
// Không được spinner vô hạn — nếu pdf.js (network/worker) treo quá lâu, tự
// chuyển sang error state thay vì chờ mãi. 20s đủ rộng cho file 13MB trên
// mạng chậm, đủ hẹp để không làm User nghĩ app bị đứng. (Giữ NGUYÊN hành vi
// đã release — candidate diagnostic-only này KHÔNG đổi timeout, xem import ở
// đầu file: progress-aware watchdog trong tmb-map-load-watchdog.ts là 1
// candidate khác, chưa dùng ở đây.)
const LOAD_TIMEOUT_MS = 20000;
// Kéo dưới ngưỡng này vẫn coi là click (mở popup căn) — vượt ngưỡng mới
// khoá thành drag/pan và chặn click phát sinh ngoài ý muốn trên marker.
const DRAG_THRESHOLD_PX = 4;
// Đợi zoom "đứng yên" bao lâu mới bắt đầu render high-res — tránh render lại
// canvas (tốn CPU đáng kể ở resolution cao) cho từng tick wheel riêng lẻ
// trong lúc User còn đang zoom liên tục.
const RENDER_DEBOUNCE_MS = 220;

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('[TmbMap]', ...args);
}

// SSR-safe — TmbMap chỉ mount client-side ('use client') nhưng window vẫn có
// thể chưa sẵn sàng ở lần render đầu; fallback 1 (không nhân DPR) an toàn hơn NaN.
function getDevicePixelRatio(): number {
  return typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
}

interface Props {
  /** Dữ liệu riêng dự án (PDF + spatial mapping) — xem TmbMapProfile trong
   * tmb-map-data.ts. Renderer này KHÔNG hard-code PDF/unit nào, hoàn toàn
   * project-agnostic — đổi profile (VD Saigon Park <-> HLX VBM1) chỉ đổi
   * PROP này, không đụng logic zoom/pan/render bên dưới. */
  profile: TmbMapProfile;
  listRows: StackingListRow[];
  onOpenUnit: (row: StackingListRow) => void;
  onClose: () => void;
  /** z-index của lớp overlay ngoài cùng — mặc định 700 (hành vi hiện có,
   * dùng bởi page.tsx cho luồng xem TMB của Sale). Cho phép override khi
   * TmbMap được mount LỒNG bên trong 1 modal khác đã có z-index cao hơn (VD
   * TmbManagerPanel.tsx dùng z-index 900 cho "Xem TMB" — Admin preview 1
   * profile READY_FOR_REVIEW trước khi Kích hoạt) — KHÔNG đổi gì về
   * zoom/pan/render, chỉ đổi lớp stacking context ngoài cùng. */
  zIndex?: number;
}

interface RenderedUnit extends TmbUnitState {
  viewX: number;
  viewY: number;
}

export default function TmbMap({ profile, listRows, onOpenUnit, onClose, zIndex = 700 }: Props) {
  // TEMPORARY — TMB_HLX_MOBILE_FAILURE_STAGE audit: log mount/unmount CỦA
  // CHÍNH component này + gắn listener beforeunload/pagehide/pageshow/
  // visibilitychange 1 lần (attachGlobalDiagListenersOnce cũng tự log 1 dòng
  // "=== NEW PAGE LOAD ===" kèm navigationType/pathname/search/serviceWorker
  // controller lần đầu tiên được gọi trong phiên tải trang này, xem tmb-diag.ts)
  // — nếu log unmount KHÔNG BAO GIỜ xuất hiện trước khi mất kết nối Console,
  // đó là bằng chứng cả TAB bị OS/browser reload/kill (không phải React tự
  // đóng modal). Xoá khối này sau khi có kết luận.
  useEffect(() => {
    if (!isTmbDiagEnabled()) return;
    attachGlobalDiagListenersOnce();
    mountDiagOverlayOnce();
    diagMark(profile.configId, 'MOUNT', {
      label: profile.label, pdfUrl: profile.pdfUrl, pdfPageNumber: profile.pdfPageNumber, unitsCount: profile.units.length,
      pathname: window.location.pathname, search: window.location.search,
    });
    return () => diagMark(profile.configId, 'UNMOUNT');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [zoomMultiplier, setZoomMultiplier] = useState(DEFAULT_ZOOM_MULT);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  // Ô tìm mã căn IME-safe (gõ tiếng Việt/Telex, xem resolveTrimmedUnitSearch
  // trong tmb-map-matching.ts) — true trong khoảng compositionstart..compositionend,
  // KHÔNG chặn/biến đổi gì input, chỉ trì hoãn lúc search/zoom được phép chạy.
  const [unitSearch, setUnitSearch] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [viewportPoints, setViewportPoints] = useState<{ unitCode: string; viewX: number; viewY: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Adaptive high-res render — giữ page pdf.js SỐNG sau lần render đầu để
  // render lại CÙNG page ở scale cao hơn khi zoom sâu, không re-fetch/re-parse
  // file 13MB (doc chỉ cần sống tới lúc getPage() xong nên không giữ ref riêng
  // — destroy trực tiếp qua biến `loadedDoc` trong closure effect load PDF).
  // renderedRenderScaleRef theo dõi renderScale ĐANG hiển thị trên canvas
  // (khởi tạo lại = BASE_SCALE mỗi lần load PDF mới/retry); renderVersionRef +
  // activeRenderTaskRef là cancellation/stale guard — 1 lượt render high-res
  // cũ hoàn tất SAU 1 lượt mới hơn phải bị bỏ qua, không được ghi đè kết quả mới.
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderedRenderScaleRef = useRef(BASE_SCALE);
  const renderVersionRef = useRef(0);
  const activeRenderTaskRef = useRef<RenderTask | null>(null);
  const [sharpening, setSharpening] = useState(false); // "Đang làm nét…" — chỉ hiện khi thật sự đang re-render high-res, không chặn tương tác
  // Viewport high-res overlay — canvas RIÊNG, chỉ chứa đúng vùng đang nhìn
  // (đã overscan) render ở scale cao hơn NHIỀU so với whole-page cap. State
  // viewportOverlayRect (content-space, KHÔNG đổi theo effectiveScale) điều
  // khiển JSX hiện/định vị overlay; các ref bên dưới là sổ sách nội bộ cho
  // quyết định "có cần render lại không" + cancellation/stale guard riêng,
  // độc lập hoàn toàn với renderVersionRef/activeRenderTaskRef của whole-page.
  const viewportOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportOverlayRect, setViewportOverlayRect] = useState<Rect | null>(null);
  const viewportRenderedRectRef = useRef<Rect | null>(null);
  const viewportRenderedScaleRef = useRef(BASE_SCALE);
  const viewportRenderVersionRef = useRef(0);
  const viewportActiveTaskRef = useRef<RenderTask | null>(null);
  const viewportDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Toạ độ (ở BASE_SCALE=1) cần cuộn tới SAU khi effectiveScale/layout đổi —
  // set bởi nút "Vừa khung"/"Tới khu Còn hàng" (anchorX/Y mặc định = giữa
  // container) hoặc wheel zoom (anchorX/Y = đúng vị trí con trỏ, để điểm dưới
  // cursor giữ nguyên vị trí màn hình sau zoom) — tiêu thụ 1 lần trong effect riêng.
  const pendingScrollTargetRef = useRef<{ x: number; y: number; anchorX?: number; anchorY?: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // State kéo hiện tại (null = không kéo) — pointerId để lọc đúng pointer
  // (bỏ qua nếu 1 pointer khác bắt đầu trong lúc đang kéo), dragged=true chỉ
  // khi đã vượt DRAG_THRESHOLD_PX (phân biệt click ngắn vs kéo thật).
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; startScrollLeft: number; startScrollTop: number; dragged: boolean } | null>(null);
  // Tiêu thụ 1 lần bởi onClick của marker ngay sau khi 1 lượt kéo (dragged)
  // kết thúc — pointerup xảy ra TRƯỚC click nên không thể đọc dragStateRef
  // (đã bị xoá) tại thời điểm click; ref riêng này sống sót qua khoảng đó.
  const suppressNextClickRef = useRef(false);
  // Pinch-to-zoom (2 ngón tay, mobile) — theo dõi TẤT CẢ pointer đang chạm
  // (Pointer Events: mỗi ngón có pointerId riêng biệt, không cần lib gesture
  // riêng). pinchStateRef chỉ set khi đúng 2 ngón đang chạm CÙNG LÚC.
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{ startDistance: number; startZoom: number } | null>(null);

  // Đo kích thước container liên tục — bắt buộc để fit-to-view đúng khi
  // resize modal/browser (yêu cầu: "resize modal/browser → fit vẫn đúng").
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render PDF (không phụ thuộc listRows — spatial data cố định). retryKey
  // đổi khi bấm "Thử lại" -> effect chạy lại từ đầu.
  useEffect(() => {
    const diagOn = isTmbDiagEnabled(); // TEMPORARY — TMB_HLX_MOBILE_FAILURE_STAGE audit
    let cancelled = false;
    let timedOut = false;
    let loadedDoc: PDFDocumentProxy | null = null;
    setLoading(true);
    setError('');

    // Reset adaptive-render state cho lượt load PDF mới (mount lần đầu hoặc
    // "Thử lại") — canvas sắp được vẽ lại từ đầu ở BASE_SCALE, không được giữ
    // renderScale/page của lượt trước; bump version để mọi render high-res cũ
    // còn đang bay (hiếm, chỉ xảy ra nếu bấm "Thử lại" giữa lúc đang zoom sâu)
    // tự coi mình là stale khi hoàn tất.
    pageRef.current = null;
    renderedRenderScaleRef.current = BASE_SCALE;
    renderVersionRef.current += 1;
    activeRenderTaskRef.current?.cancel();
    activeRenderTaskRef.current = null;
    setSharpening(false);
    // Cùng lý do — reset toàn bộ sổ sách viewport overlay, huỷ debounce/render
    // đang bay của lượt trước (nếu có), ẩn overlay cũ (rect content-space của
    // PDF cũ không còn ý nghĩa với PDF mới).
    viewportRenderedRectRef.current = null;
    viewportRenderedScaleRef.current = BASE_SCALE;
    viewportRenderVersionRef.current += 1;
    viewportActiveTaskRef.current?.cancel();
    viewportActiveTaskRef.current = null;
    if (viewportDebounceTimerRef.current) { clearTimeout(viewportDebounceTimerRef.current); viewportDebounceTimerRef.current = null; }
    setViewportOverlayRect(null);

    // assetUrl + assetHint: thông báo lỗi timeout phải nêu đúng asset đang
    // tải cho ĐÚNG đường (ảnh tĩnh KHÔNG liên quan pdf.js worker, xem 2 nhánh
    // trong effect bên dưới) — KHÔNG hard-code theo tên dự án.
    const assetUrl = profile.staticBackgroundImageUrl ?? profile.pdfUrl ?? '(không rõ)';
    const assetHint = profile.staticBackgroundImageUrl ? '' : ` / "${TMB_PDF_WORKER_URL}"`;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      log('TIMEOUT sau', LOAD_TIMEOUT_MS, 'ms — tải/dựng TMB không phản hồi');
      if (diagOn) diagMark(profile.configId, 'LOAD-TIMEOUT', { afterMs: LOAD_TIMEOUT_MS });
      if (!cancelled) {
        setError(`Quá thời gian chờ (${LOAD_TIMEOUT_MS / 1000}s) khi tải bản vẽ TMB — kiểm tra Console (log "[TmbMap]") và tab Network cho "${assetUrl}"${assetHint}.`);
        setLoading(false);
      }
    }, LOAD_TIMEOUT_MS);

    (async () => {
      try {
        // ── STATIC-IMAGE PATH ──────────────────────────────────────────────
        // Profile có staticBackgroundImageUrl (hiện chỉ TĐNĐ1, xem tmb-map-
        // data.ts) — KHÔNG chạm pdf.js API NÀO (không import pdfjs-dist,
        // không getDocument/getPage/render) — chỉ tải 1 ảnh raster đã
        // rasterize OFFLINE sẵn rồi vẽ 1 lần lên canvas. Loại bỏ hoàn toàn
        // rủi ro thực thi PDF content-stream operator list nặng (TĐNĐ1 ~207K
        // operator, đã audit + xác nhận gây crash thật trên iPhone production
        // qua ?tmbdiag=1 — dừng đúng tại page.render:start). canvasSize dùng
        // profile.nativeSize (content-space BASE_SCALE=1, ĐÚNG kích thước
        // trang PDF gốc — KHÔNG PHẢI kích thước pixel ảnh thật, xem
        // tmb-map-data.ts) nên fitScale/zoom/pan/marker phía dưới hoạt động Y
        // HỆT đường pdf.js, không cần đổi logic downstream nào. pageRef.current
        // CỐ Ý không bao giờ được gán ở nhánh này — renderHighRes/
        // renderViewportHighRes (đường nâng cấp DPR/zoom) đã có sẵn guard
        // `if (!page) return;`, tự động no-op, không cần thêm điều kiện riêng.
        if (profile.staticBackgroundImageUrl && profile.nativeSize) {
          const imageUrl = profile.staticBackgroundImageUrl;
          const nativeSize = profile.nativeSize;
          log('bước 1/2: tải ảnh nền tĩnh...', imageUrl);
          if (diagOn) diagMark(profile.configId, 'static-image:start', { url: imageUrl, nativeSize });

          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`Không tải được ảnh nền TMB ("${imageUrl}")`));
            img.src = imageUrl;
          });
          if (timedOut || cancelled) return;
          if (diagOn) diagMark(profile.configId, 'static-image:loaded', { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });

          const canvas = canvasRef.current;
          if (!canvas || cancelled || timedOut) return;
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Không khởi tạo được canvas context (getContext("2d") trả về null)');
          ctx.drawImage(img, 0, 0);
          log('bước 2/2: đã vẽ ảnh nền tĩnh lên canvas', canvas.width, 'x', canvas.height);
          if (diagOn) diagMark(profile.configId, 'static-image:drawn', { width: canvas.width, height: canvas.height });

          // Marker dùng phép Y-flip thuần đã verify khớp pdf.js.
          // convertToViewportPoint() cho ĐÚNG trang PDF gốc này (xem
          // tmb-map-static-background.ts) — KHÔNG dùng pdf.js ở nhánh này.
          const points = profile.units.map(h => {
            const { viewX, viewY } = mapPdfPointToStaticImagePoint(h.pdfX, h.pdfY, nativeSize.h);
            return { unitCode: h.unitCode, viewX, viewY };
          });
          if (diagOn) diagMark(profile.configId, 'marker-overlay-computed', { pointsCount: points.length });

          clearTimeout(timeoutId);
          setCanvasSize({ w: nativeSize.w, h: nativeSize.h });
          setViewportPoints(points);
          setZoomMultiplier(DEFAULT_ZOOM_MULT);
          setLoading(false);
          if (diagOn) diagMark(profile.configId, 'STABLE-OPEN-STATE-REACHED', { canvasNativeSize: `${nativeSize.w}x${nativeSize.h}` });
          return;
        }

        // ── pdf.js PATH (VBM1, Saigon Park, mọi profile DB-managed) ─────────
        if (!profile.pdfUrl || profile.pdfPageNumber === undefined) {
          throw new Error(`TmbMapProfile "${profile.configId}" thiếu cả pdfUrl lẫn staticBackgroundImageUrl — dữ liệu profile không hợp lệ`);
        }
        const pdfUrl = profile.pdfUrl;
        const pdfPageNumber = profile.pdfPageNumber;

        if (diagOn) diagMark(profile.configId, 'profile-resolved', { pdfUrl, pdfPageNumber });
        log('bước 1/5: import pdfjs-dist...');
        if (diagOn) diagMark(profile.configId, 'pdfjs-import:start');
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (diagOn) diagMark(profile.configId, 'pdfjs-import:done');
        if (timedOut || cancelled) return;

        pdfjs.GlobalWorkerOptions.workerSrc = TMB_PDF_WORKER_URL;
        log('bước 2/5: workerSrc =', TMB_PDF_WORKER_URL, '— fetch toàn bộ PDF:', pdfUrl);

        // Vercel phục vụ PDF với Accept-Ranges; pdf.js đôi khi đọc range/stream
        // bị lệch offset ("Bad end offset") trên asset lớn. Với file TMB ~13MB,
        // tải trọn file rồi truyền bytes cho pdf.js ổn định hơn và vẫn đủ nhanh.
        if (diagOn) diagMark(profile.configId, 'asset-fetch:start', { url: pdfUrl });
        const pdfResponse = await fetch(pdfUrl, { cache: 'no-store' });
        if (diagOn) diagMark(profile.configId, 'asset-fetch:response-headers', {
          status: pdfResponse.status, ok: pdfResponse.ok,
          contentLength: pdfResponse.headers.get('content-length'),
          contentType: pdfResponse.headers.get('content-type'),
          cacheControl: pdfResponse.headers.get('cache-control'),
        });
        if (!pdfResponse.ok) throw new Error(`Không tải được file TMB (${pdfResponse.status})`);
        const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
        if (diagOn) diagMark(profile.configId, 'asset-fetch:full-bytes-received', { byteLength: pdfBytes.byteLength, MB: (pdfBytes.byteLength / (1024 * 1024)).toFixed(2) });
        if (timedOut || cancelled) return;
        log('tải PDF hoàn tất:', pdfBytes.byteLength, 'bytes');

        if (diagOn) diagMark(profile.configId, 'getDocument:start');
        const loadingTask = pdfjs.getDocument({ data: pdfBytes });
        const doc = await loadingTask.promise;
        if (diagOn) diagMark(profile.configId, 'getDocument:done', { numPages: doc.numPages });
        if (timedOut || cancelled) return;
        loadedDoc = doc;
        log('bước 3/5: getDocument() OK, numPages =', doc.numPages);

        if (diagOn) diagMark(profile.configId, 'getPage:start', { pageNumber: pdfPageNumber });
        const page = await doc.getPage(pdfPageNumber);
        if (diagOn) diagMark(profile.configId, 'getPage:done');
        if (timedOut || cancelled) return;
        // GEOMETRY AUTHORITY — LUÔN ở BASE_SCALE=1, KHÔNG BAO GIỜ đổi. Marker
        // (points bên dưới) + canvasSize (content-space cho fitScale/effectiveScale)
        // đều lấy từ viewport NÀY, độc lập hoàn toàn với renderViewport (raster
        // thật) bên dưới — cùng "geometry guard" đã áp dụng cho renderHighRes.
        const viewport = page.getViewport({ scale: BASE_SCALE, rotation: page.rotate });
        log('bước 4/5: getPage() OK, viewport =', viewport.width, 'x', viewport.height, 'rotation', viewport.rotation);
        if (diagOn) diagMark(profile.configId, 'geometry-viewport', { w: viewport.width, h: viewport.height, rotation: viewport.rotation, nativeMP: ((viewport.width * viewport.height) / 1_000_000).toFixed(2) });

        // Root cause đã audit (TMB_MOBILE_HLX_ROOT_CAUSE_PROVEN) — canvas RASTER
        // (backing store) ban đầu TRƯỚC ĐÂY luôn = kích thước NATIVE trang PDF ở
        // BASE_SCALE=1, KHÔNG hề có cap, bất kể trang PDF lớn/nhỏ thế nào. Với
        // PDF trang nhỏ (VD Sài Gòn Park, ~3370×2384 ≈ 8MP) canvas ~30MB — an
        // toàn mọi thiết bị. Với PDF raster nặng (VD HLX/TĐNĐ1, trang native lớn
        // hơn nhiều) canvas ban đầu có thể vượt xa ngân sách bộ nhớ canvas an
        // toàn trên mobile — XẢY RA TRƯỚC CẢ khi chạm tới renderHighRes/DPR
        // (fix trước đó chỉ sửa đường nâng cấp DPR, KHÔNG chạm bước render ban
        // đầu này). computeInitialRenderScale (tmb-map-render-quality.ts) tính
        // scale raster AN TOÀN cho lượt render ĐẦU TIÊN — thuần theo kích thước
        // trang THẬT, KHÔNG hard-code theo tên dự án/profile, KHÔNG detect
        // mobile/UA (KHÔNG dùng computeMaxRenderScale trực tiếp ở đây — hàm đó
        // sàn ở 1, không phù hợp cho việc HẠ scale xuống dưới native).
        const initialRenderScale = computeInitialRenderScale({ w: viewport.width, h: viewport.height });
        // renderViewport CHỈ dùng để rasterize canvas (canvas.width/height +
        // page.render()) — KHÔNG BAO GIỜ dùng để tính marker/points hay
        // canvasSize (2 việc đó luôn dùng `viewport` ở BASE_SCALE=1 phía trên).
        const renderViewport = initialRenderScale === BASE_SCALE
          ? viewport
          : page.getViewport({ scale: initialRenderScale, rotation: page.rotate });
        if (initialRenderScale < BASE_SCALE) {
          log('bước 4/5: trang PDF lớn hơn ngân sách canvas an toàn — render ban đầu ở scale', initialRenderScale,
            '(', Math.ceil(renderViewport.width), 'x', Math.ceil(renderViewport.height), 'px) thay vì scale 1 gốc');
        }
        if (diagOn) diagMark(profile.configId, 'initial-raster-scale', {
          initialRenderScale, renderW: Math.ceil(renderViewport.width), renderH: Math.ceil(renderViewport.height),
          estimatedCanvasMB: canvasMB(Math.ceil(renderViewport.width), Math.ceil(renderViewport.height)),
        });

        const canvas = canvasRef.current;
        if (!canvas || cancelled || timedOut) return;
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Không khởi tạo được canvas context (getContext("2d") trả về null)');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (diagOn) diagMark(profile.configId, 'canvas-allocated', { width: canvas.width, height: canvas.height, estimatedMB: canvasMB(canvas.width, canvas.height) });

        log('bước 5/5: page.render() bắt đầu...');
        if (diagOn) diagMark(profile.configId, 'page.render:start');
        await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
        if (diagOn) diagMark(profile.configId, 'page.render:complete');
        if (cancelled || timedOut) return;
        log('bước 5/5: page.render() hoàn tất');

        // Marker luôn tính từ `viewport` (BASE_SCALE=1, KHÔNG PHẢI renderViewport)
        // — vị trí marker hoàn toàn độc lập với renderScale raster thật, đúng
        // geometry guard của file này.
        const points = profile.units.map(h => {
          const [vx, vy] = viewport.convertToViewportPoint(h.pdfX, h.pdfY);
          return { unitCode: h.unitCode, viewX: vx, viewY: vy };
        });
        if (diagOn) diagMark(profile.configId, 'marker-overlay-computed', { pointsCount: points.length });

        // Giữ page SỐNG (không .cleanup() ở đây) để adaptive high-res render
        // sau này gọi lại CHÍNH page này ở scale cao hơn khi zoom sâu — không
        // re-fetch/re-parse file 13MB. renderedRenderScaleRef PHẢI ghi ĐÚNG
        // initialRenderScale vừa dùng (KHÔNG PHẢI luôn BASE_SCALE như trước) —
        // nếu không, renderHighRes sau này (shouldUpgradeRenderQuality so với
        // giá trị SAI) có thể nghĩ canvas đã ở scale=1 dù thực tế đang thấp
        // hơn, bỏ lỡ lượt nâng chất lượng cần thiết khi User zoom vào.
        pageRef.current = page;
        renderedRenderScaleRef.current = initialRenderScale;

        clearTimeout(timeoutId);
        // canvasSize LUÔN là kích thước NATIVE (viewport BASE_SCALE=1) — content-
        // space authority cho fitScale/effectiveScale/marker, KHÔNG PHẢI kích
        // thước raster thật (canvas.width/height, có thể nhỏ hơn nếu bị cap ở
        // trên). Tách 2 khái niệm này đúng như renderHighRes đã làm cho lượt
        // nâng cấp sau — canvas hiển thị (CSS scaledSize) tự phóng bitmap nhỏ
        // hơn lên đúng kích thước cần, trình duyệt tự làm, không cần code thêm.
        setCanvasSize({ w: Math.ceil(viewport.width), h: Math.ceil(viewport.height) });
        setViewportPoints(points);
        setZoomMultiplier(DEFAULT_ZOOM_MULT); // mở ở fit-to-view, không auto-zoom khu Còn hàng
        setLoading(false);
        if (diagOn) diagMark(profile.configId, 'STABLE-OPEN-STATE-REACHED', { canvasNativeSize: `${Math.ceil(viewport.width)}x${Math.ceil(viewport.height)}` });
      } catch (err) {
        clearTimeout(timeoutId);
        const msg = err instanceof Error ? err.message : String(err);
        log('LỖI:', msg, err);
        if (diagOn) diagMark(profile.configId, 'CAUGHT-ERROR', { message: msg, cancelled, timedOut });
        if (!cancelled && !timedOut) {
          setError(msg || 'Lỗi tải/dựng TMB (không rõ nguyên nhân)');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      // Dọn đúng doc/render task của LƯỢT NÀY (unmount hoặc bấm "Thử lại")
      // — tránh leak bộ nhớ pdf.js khi mở/đóng TMB nhiều lần trong 1 phiên.
      activeRenderTaskRef.current?.cancel();
      viewportActiveTaskRef.current?.cancel();
      if (viewportDebounceTimerRef.current) clearTimeout(viewportDebounceTimerRef.current);
      loadedDoc?.destroy();
    };
    // profile.configId (KHÔNG phải cả object profile) — theo dõi tường minh
    // theo configId thay vì dựa ngầm vào identity ổn định của object profile
    // (dù resolveTmbMapProfile luôn trả về CÙNG reference cho 1 configId từ
    // registry module-level cố định). Đổi dự án (configId khác) trong lúc
    // TmbMap đang mount phải load lại đúng PDF/unit mới, giống retryKey.
    // profile.pdfUrl/pdfPageNumber/units cố ý KHÔNG liệt kê riêng — cả 3 đổi
    // CÙNG LÚC với configId (1 profile = 1 bộ dữ liệu bất biến).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, profile.configId]);

  // fitScale = scale để TOÀN BỘ canvas vừa khung container, giữ đúng aspect
  // ratio (không crop) — luôn tính lại khi container hoặc canvas đổi kích
  // thước (khớp yêu cầu "resize → fit vẫn đúng").
  const fitScale = useMemo(() => {
    if (!containerSize || !canvasSize || canvasSize.w === 0 || canvasSize.h === 0) return 1;
    return Math.min(containerSize.w / canvasSize.w, containerSize.h / canvasSize.h);
  }, [containerSize, canvasSize]);

  const effectiveScale = fitScale * zoomMultiplier;

  // Render lại CHÍNH page pdf.js (pageRef, không re-fetch/re-parse PDF) vào 1
  // canvas OFFSCREEN ở renderScale cao hơn rồi mới blit sang canvas hiển thị
  // (canvasRef) — tránh canvas hiển thị bị xoá trắng/nháy trong lúc đang vẽ
  // (gán canvas.width/height xoá nội dung NGAY LẬP TỨC). CSS width/height của
  // canvas hiển thị KHÔNG đụng tới ở đây (vẫn do scaledSize/effectiveScale
  // quyết định như cũ) — chỉ đổi canvas.width/height (backing store, số pixel
  // RASTER thật) + vẽ đè nội dung mới, nên marker/pan/zoom hoàn toàn không bị
  // ảnh hưởng (xem geometry guard ở đầu file).
  const renderHighRes = useCallback(async (targetScale: number) => {
    const page = pageRef.current;
    const canvas = canvasRef.current;
    if (!page || !canvas) return;

    // Huỷ lượt render high-res cũ đang bay (nếu có) — không để nó hoàn tất
    // sau lượt này rồi ghi đè kết quả mới hơn. myVersion là guard thứ 2 (phòng
    // trường hợp cancel() không kịp chặn promise đã resolve).
    activeRenderTaskRef.current?.cancel();
    const myVersion = ++renderVersionRef.current;

    const viewport = page.getViewport({ scale: targetScale, rotation: page.rotate });
    const off = document.createElement('canvas');
    off.width = Math.ceil(viewport.width);
    off.height = Math.ceil(viewport.height);
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, off.width, off.height);

    if (isTmbDiagEnabled()) diagMark(profile.configId, 'renderHighRes:start', { targetScale, offW: off.width, offH: off.height, estimatedMB: canvasMB(off.width, off.height) });
    setSharpening(true);
    const task = page.render({ canvasContext: offCtx, viewport });
    activeRenderTaskRef.current = task;
    try {
      await task.promise;
    } catch (err) {
      // RenderingCancelledException do bị .cancel() bởi lượt render mới hơn
      // — hành vi bình thường, không phải lỗi, im lặng bỏ qua.
      if (isTmbDiagEnabled()) diagMark(profile.configId, 'renderHighRes:caught', { message: err instanceof Error ? err.message : String(err) });
      if (renderVersionRef.current === myVersion) setSharpening(false);
      return;
    }
    if (renderVersionRef.current !== myVersion) return; // đã có lượt mới hơn bắt đầu sau đó — bỏ kết quả này (stale guard)

    const ctx = canvas.getContext('2d');
    if (ctx) {
      canvas.width = off.width;
      canvas.height = off.height;
      ctx.drawImage(off, 0, 0);
      renderedRenderScaleRef.current = targetScale;
      log('adaptive render: đã render lại canvas ở scale', targetScale, '(', off.width, 'x', off.height, 'px)');
      if (isTmbDiagEnabled()) diagMark(profile.configId, 'renderHighRes:complete', { targetScale, width: off.width, height: off.height });
    }
    if (activeRenderTaskRef.current === task) activeRenderTaskRef.current = null;
    setSharpening(false);
    // profile.configId cố ý KHÔNG thêm vào deps (chỉ dùng cho diagMark, TEMPORARY
    // — renderHighRes phải giữ NGUYÊN reference ổn định [] vì được dùng làm
    // dependency của effect khác, đổi deps ở đây sẽ đổi hành vi effect đó).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce theo effectiveScale — chỉ render high-res SAU KHI zoom đứng yên
  // RENDER_DEBOUNCE_MS (mỗi thay đổi effectiveScale mới sẽ clear timer cũ,
  // đúng cơ chế debounce chuẩn của useEffect cleanup), tránh render lại canvas
  // (tốn CPU ở resolution cao) cho từng tick wheel riêng lẻ khi đang zoom
  // liên tục. shouldUpgradeRenderQuality đảm bảo KHÔNG downgrade khi zoom ra
  // (giữ nguyên bitmap nét đã có, CSS tự scale xuống vẫn nét).
  useEffect(() => {
    if (!canvasSize || !pageRef.current) return;
    const target = computeRenderQuality(effectiveScale, getDevicePixelRatio(), canvasSize);
    if (isTmbDiagEnabled()) {
      diagMark(profile.configId, 'post-render-upgrade-check', {
        effectiveScale, dpr: getDevicePixelRatio(), canvasSize, target, current: renderedRenderScaleRef.current,
        willUpgrade: shouldUpgradeRenderQuality(target, renderedRenderScaleRef.current),
      });
    }
    if (!shouldUpgradeRenderQuality(target, renderedRenderScaleRef.current)) return;
    const timer = setTimeout(() => { void renderHighRes(target); }, RENDER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // profile.configId cố ý KHÔNG thêm vào deps (chỉ dùng cho diagMark, TEMPORARY
    // — thêm vào sẽ đổi thời điểm effect chạy lại, vi phạm "no behavior change").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveScale, canvasSize, renderHighRes]);

  // ── Viewport high-resolution overlay ─────────────────────────────────────
  // Render CHỈ vùng đang nhìn (đã overscan, kẹp trong biên trang) ở scale cao
  // hơn NHIỀU so với whole-page cap — dùng offsetX/offsetY NATIVE của pdf.js
  // (KHÔNG render toàn trang rồi crop, xem tmb-map-viewport.ts). Overlay là
  // FALLBACK-cộng-thêm: canvas nền (whole-page, phía trên) luôn tiếp tục hiển
  // thị bình thường dù overlay chưa render/render fail — không có trạng thái
  // "map hỏng" nào phụ thuộc overlay.
  const renderViewportHighRes = useCallback(async (rect: Rect, targetScale: number) => {
    const page = pageRef.current;
    if (!page) return;

    viewportActiveTaskRef.current?.cancel();
    const myVersion = ++viewportRenderVersionRef.current;

    const size = rectSize(rect);
    const w = Math.max(1, Math.ceil(size.w * targetScale));
    const h = Math.max(1, Math.ceil(size.h * targetScale));
    // offsetX/offsetY (API pdf.js gốc, KHÔNG phải hack) dịch transform để
    // content-space (rect.minX, rect.minY) rơi đúng vào pixel (0,0) của canvas
    // MỚI này — pdf.js chỉ rasterize trong đúng bounds canvas (w×h nhỏ), không
    // vẽ toàn trang rồi cắt. Đã verify công thức bằng convertToViewportPoint
    // round-trip (sai số chỉ ở mức dấu phẩy động ~1e-12) trước khi implement.
    const viewport = page.getViewport({
      scale: targetScale, rotation: page.rotate,
      offsetX: -rect.minX * targetScale, offsetY: -rect.minY * targetScale,
    });

    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, w, h);

    const task = page.render({ canvasContext: offCtx, viewport });
    viewportActiveTaskRef.current = task;
    try {
      await task.promise;
    } catch {
      // Cancelled (lượt mới hơn supersede) hoặc lỗi render — im lặng bỏ qua,
      // canvas nền whole-page vẫn hiển thị bình thường (failure fallback).
      return;
    }
    if (viewportRenderVersionRef.current !== myVersion) return; // stale guard

    const canvas = viewportOverlayCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = w; canvas.height = h;
    ctx.drawImage(off, 0, 0);

    viewportRenderedRectRef.current = rect;
    viewportRenderedScaleRef.current = targetScale;
    setViewportOverlayRect(rect); // trigger reposition/hiện overlay (rectToDisplayBox trong JSX)
    if (viewportActiveTaskRef.current === task) viewportActiveTaskRef.current = null;
    log('viewport render: scale', targetScale, '(', w, 'x', h, 'px) rect', JSON.stringify(rect));
  }, []);

  // Quyết định có cần render lại overlay không: (a) vùng visible HIỆN TẠI
  // (không overscan) không còn nằm trọn trong vùng đã render (đã overscan) —
  // đã pan ra ngoài; HOẶC (b) quality cần thiết cao hơn đáng kể quality đã
  // render (đã zoom sâu hơn). Luôn tính TỪ SCROLL/SIZE THẬT tại thời điểm gọi
  // (không dựa vào closure cũ) để không ra quyết định lỗi thời sau debounce.
  const evaluateAndRenderViewport = useCallback(() => {
    const container = scrollRef.current;
    if (!container || !canvasSize) return;
    const visible = computeVisibleContentRect(
      container.scrollLeft, container.scrollTop, { w: container.clientWidth, h: container.clientHeight }, effectiveScale
    );
    const overscanned = clampRectToPageBounds(applyOverscan(visible, OVERSCAN_FRACTION), canvasSize);
    const regionSize = rectSize(overscanned);
    if (regionSize.w <= 0 || regionSize.h <= 0) return;

    const targetScale = computeRenderQuality(effectiveScale, getDevicePixelRatio(), regionSize, VIEWPORT_RENDER_QUALITY_CAPS);
    const renderedRect = viewportRenderedRectRef.current;
    const covered = renderedRect ? rectContains(renderedRect, visible) : false;
    const needsUpgrade = shouldUpgradeRenderQuality(targetScale, viewportRenderedScaleRef.current);
    if (covered && !needsUpgrade) return; // đã đủ nét + đã phủ đủ vùng đang nhìn — không cần render lại

    void renderViewportHighRes(overscanned, targetScale);
  }, [canvasSize, effectiveScale, renderViewportHighRes]);

  // Debounce dùng chung cho CẢ zoom (effectiveScale đổi) lẫn pan (scroll đổi)
  // — mỗi lần gọi clear timer cũ, chỉ thực sự đánh giá/render sau khi tương
  // tác đứng yên RENDER_DEBOUNCE_MS. Trong lúc đang wheel/kéo liên tục, canvas
  // nền whole-page tiếp tục phục vụ hiển thị (yêu cầu "giữ renderer hiện có
  // phục vụ tương tác" — không đổi hành vi zoom/pan hiện tại).
  const scheduleViewportRender = useCallback(() => {
    if (viewportDebounceTimerRef.current) clearTimeout(viewportDebounceTimerRef.current);
    viewportDebounceTimerRef.current = setTimeout(() => {
      viewportDebounceTimerRef.current = null;
      evaluateAndRenderViewport();
    }, RENDER_DEBOUNCE_MS);
  }, [evaluateAndRenderViewport]);

  // Trigger 1: zoom đổi (effectiveScale) hoặc canvasSize đổi (PDF vừa load xong).
  useEffect(() => {
    if (!canvasSize || !pageRef.current) return;
    scheduleViewportRender();
  }, [effectiveScale, canvasSize, scheduleViewportRender]);

  // Trigger 2: pan — 'scroll' native fire cả khi User kéo chuột (drag-to-pan,
  // applyPanScroll set trực tiếp scrollLeft/Top) lẫn khi wheel-zoom tự cuộn
  // lại theo cursor-anchor (pendingScrollTargetRef effect) — 1 listener phủ
  // đủ mọi nguồn thay đổi scroll, không cần móc riêng vào từng handler.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', scheduleViewportRender, { passive: true });
    return () => el.removeEventListener('scroll', scheduleViewportRender);
  }, [scheduleViewportRender]);

  // Matching + trạng thái Còn hàng — derive SỐNG từ listRows mỗi lần đổi
  // (đúng authority effectiveDotStatus, không tạo công thức riêng cho TMB,
  // không hard-code danh sách Còn hàng nào).
  const maCanIndex = useMemo(() => buildMaCanIndex(listRows), [listRows]);
  const unitStates = useMemo(
    () => profile.units.map(h => resolveTmbUnitState(h.unitCode, maCanIndex)),
    [maCanIndex, profile.units]
  );

  const units: RenderedUnit[] = useMemo(() => {
    const byCode = new Map(unitStates.map(s => [s.unitCode, s]));
    return viewportPoints
      .map(p => {
        const state = byCode.get(p.unitCode);
        return state ? { ...state, viewX: p.viewX, viewY: p.viewY } : null;
      })
      .filter((h): h is RenderedUnit => h !== null);
  }, [viewportPoints, unitStates]);

  // Tiêu thụ pendingScrollTargetRef SAU KHI effectiveScale (và do đó kích
  // thước wrapper trong DOM) đã đổi theo zoomMultiplier mới. anchorX/Y mặc
  // định = giữa container (nút "Vừa khung"/"Tới khu Còn hàng"); wheel zoom
  // truyền đúng vị trí con trỏ để điểm dưới cursor giữ nguyên trên màn hình.
  useEffect(() => {
    const target = pendingScrollTargetRef.current;
    const container = scrollRef.current;
    if (!target || !container || !canvasSize) return;
    const anchorX = target.anchorX ?? container.clientWidth / 2;
    const anchorY = target.anchorY ?? container.clientHeight / 2;
    const { scrollLeft, scrollTop } = contentPointToScroll(target.x, target.y, effectiveScale, anchorX, anchorY);
    container.scrollLeft = scrollLeft;
    container.scrollTop = scrollTop;
    pendingScrollTargetRef.current = null;
  }, [effectiveScale, canvasSize]);

  // Wheel zoom quanh vị trí con trỏ — tính điểm content-space (BASE_SCALE=1)
  // đang nằm dưới cursor TRƯỚC khi đổi zoom (dựa trên scrollLeft/scrollTop +
  // vị trí cursor trong container hiện tại), rồi nhờ effect ở trên cuộn lại
  // đúng điểm đó về đúng vị trí màn hình SAU khi effectiveScale đổi.
  // Giả định content đã >= container (không còn margin canh giữa) — đúng với
  // mọi mức zoom > fit (MIN_ZOOM_MULT=1 nên chỉ có sai số rất nhỏ đúng lúc
  // đang ở fit hệt tại 1 trục còn dư viền — chấp nhận được, không ảnh hưởng
  // thực tế vì lúc đó đã thấy toàn cảnh, không cần neo cursor chính xác).
  const handleWheelZoom = useCallback((e: WheelEvent) => {
    if (loading || error || !canvasSize) return;
    e.preventDefault();
    const container = scrollRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const { x: nativeX, y: nativeY } = screenPointToContentPoint(container.scrollLeft, container.scrollTop, cursorX, cursorY, effectiveScale);

    pendingScrollTargetRef.current = { x: nativeX, y: nativeY, anchorX: cursorX, anchorY: cursorY };
    setZoomMultiplier(z => applyWheelZoom(z, e.deltaY, WHEEL_ZOOM_FACTOR, { min: MIN_ZOOM_MULT, max: MAX_ZOOM_MULT }));
  }, [loading, error, canvasSize, effectiveScale]);

  // Native (không passive) để preventDefault() chặn scroll trang/modal khi
  // wheel trên vùng map — React onWheel không đảm bảo preventDefault hoạt
  // động do passive listener mặc định. Chỉ gắn trên scrollRef (đúng vùng
  // map) nên wheel ngoài map không bị ảnh hưởng.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheelZoom, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelZoom);
  }, [handleWheelZoom]);

  // Drag-to-pan bằng Pointer Events trên chính scrollRef (dùng lại
  // scrollLeft/scrollTop hiện có — không tạo map engine thứ hai). Gắn TRỰC
  // TIẾP trên vùng body/scroll (không phải toolbar/header — 2 khu vực khác
  // nhau trong DOM nên không cần guard riêng), nên click Vừa khung/Tới khu
  // Còn hàng và tương tác popup (render tách biệt, z-index cao hơn) không
  // bao giờ chạm handler này.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (loading || error || !canvasSize) return;
    if (e.button !== 0) return; // chỉ chuột trái (touch/pen primary cũng = 0)
    const container = scrollRef.current;
    if (!container) return;
    container.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2) {
      // Ngón thứ 2 vừa chạm xuống -> chuyển từ pan 1 ngón sang pinch 2 ngón.
      // Huỷ drag 1 ngón đang dở (nếu có) để tránh 2 cơ chế cùng ghi scroll.
      dragStateRef.current = null;
      setIsDragging(false);
      const pts = Array.from(activePointersRef.current.values());
      pinchStateRef.current = { startDistance: touchDistance(pts[0], pts[1]), startZoom: zoomMultiplier };
      return;
    }
    if (activePointersRef.current.size > 2) return; // ngón thứ 3+ — bỏ qua, giữ pinch 2 ngón đang có

    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
      dragged: false,
    };
  }, [loading, error, canvasSize, zoomMultiplier]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    const pinch = pinchStateRef.current;
    if (pinch && activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = touchDistance(pts[0], pts[1]);
      if (dist <= 0) return; // dữ liệu lỗi/ngón trùng vị trí — bỏ qua lần đọc này
      const mid = touchMidpoint(pts[0], pts[1]);
      const rect = container.getBoundingClientRect();
      const midX = mid.x - rect.left;
      const midY = mid.y - rect.top;
      const { x: nativeX, y: nativeY } = screenPointToContentPoint(container.scrollLeft, container.scrollTop, midX, midY, effectiveScale);
      pendingScrollTargetRef.current = { x: nativeX, y: nativeY, anchorX: midX, anchorY: midY };
      setZoomMultiplier(applyPinchZoom(pinch.startZoom, pinch.startDistance, dist, { min: MIN_ZOOM_MULT, max: MAX_ZOOM_MULT }));
      return;
    }

    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.dragged && exceedsDragThreshold(dx, dy, DRAG_THRESHOLD_PX)) {
      drag.dragged = true;
      setIsDragging(true);
    }
    if (drag.dragged) {
      const { scrollLeft, scrollTop } = applyPanScroll(drag.startScrollLeft, drag.startScrollTop, dx, dy);
      container.scrollLeft = scrollLeft;
      container.scrollTop = scrollTop;
    }
  }, [effectiveScale]);

  // Dùng chung cho pointerup/pointercancel/pointerleave — PHẢI dọn state ở
  // cả 3 để không bao giờ kẹt "đang kéo" (VD chuột rời khỏi cửa sổ trình
  // duyệt giữa lúc kéo). Nếu lượt kéo đã vượt ngưỡng (dragged=true), khoá
  // suppressNextClickRef để click phát sinh ngay sau đó trên marker (nếu có)
  // không vô tình mở popup ngoài ý muốn.
  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (container?.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    const wasTracked = activePointersRef.current.delete(e.pointerId);

    if (pinchStateRef.current) {
      if (activePointersRef.current.size < 2) {
        // Kết thúc pinch (1 hoặc cả 2 ngón nhấc lên). CỐ Ý không "hồi sinh"
        // pan 1 ngón cho ngón còn lại — bắt buộc chạm mới — để tránh giật
        // scroll đột ngột do lệch startX/startY (yêu cầu "avoid accidental
        // pan jump after pinch finishes").
        pinchStateRef.current = null;
        suppressNextClickRef.current = true;
      }
      return;
    }

    if (!wasTracked) return;
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.dragged) suppressNextClickRef.current = true;
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  const handleFitToView = useCallback(() => {
    pendingScrollTargetRef.current = null;
    setZoomMultiplier(DEFAULT_ZOOM_MULT);
    const container = scrollRef.current;
    if (container) { container.scrollLeft = 0; container.scrollTop = 0; }
  }, []);

  // "Tới khu Còn hàng" — zoom/pan tới bounding box của các căn Còn hàng
  // hiện tại (derive sống, không hard-code). CHỈ chạy khi User bấm, KHÔNG
  // tự động lúc mở (yêu cầu: mặc định phải thấy toàn TMB trước).
  const handleFocusAvailable = useCallback(() => {
    const available = units.filter(u => u.available);
    if (available.length === 0 || !containerSize) return;
    const xs = available.map(h => h.viewX), ys = available.map(h => h.viewY);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const bboxW = Math.max(maxX - minX, 1) * FOCUS_PADDING;
    const bboxH = Math.max(maxY - minY, 1) * FOCUS_PADDING;
    const targetScale = Math.min(containerSize.w / bboxW, containerSize.h / bboxH);
    const nextMultiplier = Math.min(MAX_ZOOM_MULT, Math.max(MIN_ZOOM_MULT, targetScale / fitScale));

    pendingScrollTargetRef.current = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    setZoomMultiplier(+nextMultiplier.toFixed(2));
  }, [units, containerSize, fitScale]);

  // ── Ô tìm mã căn (Còn hàng) ────────────────────────────────────────────
  // Chỉ khớp căn "Còn hàng" (u.available) — cùng rule "chỉ Còn hàng mới
  // hiển thị/tương tác" của toàn bộ map (xem đầu file). So khớp CHÍNH XÁC
  // (trim + không phân biệt hoa/thường) — mã căn là định danh cố định, không
  // cần fuzzy/partial match, tránh nhảy tới nhầm căn khi đang gõ dở.
  // resolveTrimmedUnitSearch: trong lúc IME đang composition (gõ tiếng Việt/
  // Telex, VD "TĐ55-11"), giá trị input có thể tạm ở dạng trung gian chưa
  // hoàn chỉnh — coi như "" (chưa tìm gì) tới khi compositionend, tránh tự
  // zoom/pan hoặc flash "Không tìm thấy" giữa chừng lúc User còn đang gõ.
  const trimmedUnitSearch = resolveTrimmedUnitSearch(unitSearch, isComposing);
  const matchedUnit = useMemo(() => {
    if (!trimmedUnitSearch) return null;
    const norm = trimmedUnitSearch.toLowerCase();
    return units.find(u => u.available && u.unitCode.toLowerCase() === norm) ?? null;
  }, [units, trimmedUnitSearch]);
  const unitSearchNotFound = trimmedUnitSearch.length > 0 && !matchedUnit;

  // Tự động zoom/pan tới marker NGAY khi tìm thấy đúng 1 căn khớp — chỉ chạy
  // lại khi ĐỔI SANG căn khác (dep theo unitCode, không theo effectiveScale/
  // matchedUnit object) để không kéo màn hình về mỗi khi User tự zoom/pan đi
  // chỗ khác sau đó mà vẫn giữ nguyên ô tìm kiếm. Set scroll TRỰC TIẾP bằng
  // effectiveScale hiện tại (cùng lúc set pendingScrollTargetRef) — nếu
  // SEARCH_FOCUS_ZOOM không làm đổi zoom (đã zoom sâu hơn từ trước) thì effect
  // tiêu thụ pendingScrollTargetRef (keyed theo effectiveScale) sẽ không tự
  // chạy lại, nên phải tự cuộn ở đây làm fallback (cùng lý do dùng cho
  // handleFitToView tự set scrollLeft/Top thay vì chỉ dựa vào effect đó).
  useEffect(() => {
    if (!matchedUnit) return;
    const container = scrollRef.current;
    if (!container) return;
    pendingScrollTargetRef.current = { x: matchedUnit.viewX, y: matchedUnit.viewY };
    const { scrollLeft, scrollTop } = contentPointToScroll(
      matchedUnit.viewX, matchedUnit.viewY, effectiveScale, container.clientWidth / 2, container.clientHeight / 2
    );
    container.scrollLeft = scrollLeft;
    container.scrollTop = scrollTop;
    setZoomMultiplier(z => Math.max(z, SEARCH_FOCUS_ZOOM));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedUnit?.unitCode]);

  const availableCount = units.filter(u => u.available).length;
  const showLabels = zoomMultiplier >= LABEL_VISIBLE_AT_ZOOM;

  // Kích thước content đã scale + margin canh giữa khi content nhỏ hơn
  // container (0 khi đã tràn khung) — xem giải thích đầy đủ ở
  // computeCenteringMargin trong tmb-map-pan.ts (thay flex-center cũ, vốn
  // khiến browser chỉ cho scroll được ~nửa phạm vi cần, không tới được góc).
  const scaledSize = canvasSize ? computeScaledContentSize(canvasSize, effectiveScale) : { w: 0, h: 0 };
  const centeringMargin = containerSize ? computeCenteringMargin(containerSize, scaledSize) : { marginX: 0, marginY: 0 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => { if (isTmbDiagEnabled()) diagMark(profile.configId, 'onClose:backdrop-click'); onClose(); }}>
      <div
        style={{ width: '100%', maxWidth: 1100, height: '85vh', background: 'var(--bg-card)', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border, var(--border-light))', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <div>
            {/* profile.label đầy đủ (VD "Vinhomes Global Gate HLX · VBM1") vẫn
                giữ nguyên qua title= (không mất thông tin) — hiển thị RÚT GỌN
                bằng tmbShortLabel (phần sau " · " cuối, xem tmb-map-data.ts)
                để tránh lặp "Tổng mặt bằng ... Tổng mặt bằng ..." khi profile
                admin-managed đặt label dạng "Tổng mặt bằng <tên> · <phân khu>". */}
            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-title)' }} title={profile.label}>
              Tổng mặt bằng · {tmbShortLabel(profile.label)}
            </div>
            <div style={{ fontSize: '0.8rem', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: '#15803d', fontWeight: 700 }}>Còn hàng: {availableCount} căn</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                className="tmb-search-input"
                value={unitSearch}
                onChange={e => setUnitSearch(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={e => {
                  // Đồng bộ lại state từ ĐÚNG giá trị DOM hiện có (thay vì tin
                  // e.data — không phải mọi engine IME đều điền field đó đúng
                  // ý nghĩa "chuỗi cuối cùng") NGAY trước khi cho phép
                  // search/zoom chạy lại (isComposing=false) — compositionend
                  // luôn là sự kiện CUỐI của 1 lượt gõ tiếng Việt.
                  setIsComposing(false);
                  setUnitSearch(e.currentTarget.value);
                }}
                disabled={loading}
                placeholder="Tìm mã căn..."
                title="Nhập ĐÚNG mã căn Còn hàng để tự động phóng tới vị trí, marker sẽ đổi màu đỏ"
                style={{
                  padding: '6px 26px 6px 28px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, width: 180,
                  borderColor: unitSearchNotFound ? '#dc2626' : undefined, color: 'var(--text-title)', outline: 'none',
                }}
              />
              {unitSearch && (
                <button onClick={() => setUnitSearch('')} title="Xoá tìm kiếm" style={{
                  position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex',
                }}>
                  <X size={12} />
                </button>
              )}
            </div>
            {unitSearchNotFound && (
              <span style={{ fontSize: '0.7rem', color: '#dc2626', whiteSpace: 'nowrap' }}>Không tìm thấy căn Còn hàng</span>
            )}
            <div style={{ width: 1, height: 20, background: 'var(--border, var(--border-light))' }} />
            <button onClick={handleFocusAvailable} disabled={loading || availableCount === 0} title="Zoom/pan tới khu vực có căn Còn hàng" className="tmb-toolbar-btn" style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
              border: '1px solid var(--border, var(--border-light))', background: 'var(--bg-card)',
              color: loading || availableCount === 0 ? 'var(--text-muted)' : 'var(--text-body)',
              cursor: loading || availableCount === 0 ? 'default' : 'pointer', opacity: loading || availableCount === 0 ? 0.55 : 1,
            }}>
              <Locate size={13} /> Tới khu Còn hàng
            </button>
            <div style={{ width: 1, height: 20, background: 'var(--border, var(--border-light))' }} />
            <button onClick={handleFitToView} disabled={loading} title="Vừa khung — thấy toàn bộ TMB" className="tmb-toolbar-btn" style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
              border: '1px solid var(--border, var(--border-light))', background: zoomMultiplier === DEFAULT_ZOOM_MULT ? 'var(--bg-secondary, #f1f5f9)' : 'var(--bg-card)',
              color: loading ? 'var(--text-muted)' : 'var(--text-body)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.55 : 1,
            }}>
              <Maximize2 size={13} /> Vừa khung
            </button>
            <button onClick={() => setZoomMultiplier(z => Math.max(MIN_ZOOM_MULT, +(z - ZOOM_STEP).toFixed(2)))} disabled={loading || zoomMultiplier <= MIN_ZOOM_MULT} title="Thu nhỏ" className="tmb-toolbar-btn" style={zoomBtnStyle(loading || zoomMultiplier <= MIN_ZOOM_MULT)}>
              <Minus size={15} />
            </button>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', minWidth: 40, textAlign: 'center' }} title="Zoom tương đối so với Vừa khung (1.0x = đúng bằng fit)">{zoomMultiplier.toFixed(1)}x</span>
            <button onClick={() => setZoomMultiplier(z => Math.min(MAX_ZOOM_MULT, +(z + ZOOM_STEP).toFixed(2)))} disabled={loading || zoomMultiplier >= MAX_ZOOM_MULT} title="Phóng to" className="tmb-toolbar-btn" style={zoomBtnStyle(loading || zoomMultiplier >= MAX_ZOOM_MULT)}>
              <Plus size={15} />
            </button>
            {/* Indicator nhỏ, không chặn tương tác — chỉ hiện khi đang re-render
                canvas ở resolution cao hơn (sau khi zoom đứng yên), tự ẩn khi
                xong hoặc bị lượt zoom mới hơn huỷ giữa chừng. */}
            {sharpening && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Đang làm nét…
              </span>
            )}
            <button onClick={() => { if (isTmbDiagEnabled()) diagMark(profile.configId, 'onClose:X-button-click'); onClose(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)', borderRadius: 8, marginLeft: 6 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Đang dựng bản vẽ TMB...
            </div>
          )}
          {error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#dc2626', padding: 24, textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 480 }}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} /> <span>{error}</span>
              </div>
              <button
                onClick={() => setRetryKey(k => k + 1)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
              >
                <RefreshCw size={14} /> Thử lại
              </button>
            </div>
          )}

          {/* Layout block bình thường (KHÔNG dùng flex alignItems/justifyContent:
              center — flex-center + overflow:auto với content tràn khung khiến
              browser chỉ cho scroll ĐƯỢC ~nửa phạm vi cần, không tới được góc,
              xem chi tiết + số đo thực tế ở computeCenteringMargin trong
              tmb-map-pan.ts). Margin JS-computed (centeringMargin) canh giữa
              content khi nhỏ hơn container, tự về 0 khi đã tràn khung — nhờ đó
              scrollWidth/Height luôn phản ánh ĐÚNG kích thước scaled thật. */}
          <div
            ref={scrollRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={endDrag}
            style={{
              width: '100%', height: '100%', overflow: 'auto', background: '#e5e7eb',
              visibility: loading || error ? 'hidden' : 'visible',
              cursor: loading || error ? 'default' : isDragging ? 'grabbing' : 'grab', touchAction: 'none',
            }}
          >
            {/* QUAN TRỌNG: <canvas> phải LUÔN mount, không được gate theo
                canvasSize — canvasSize chỉ được set SAU KHI đã vẽ vào canvas
                (đo canvas.width/height lúc đó), nên nếu gate theo nó thì
                canvasRef.current luôn null ở lần load đầu tiên -> pdf.js
                "render" xong nhưng code sau đó return sớm trong nhánh
                `if (!canvas ...) return;`, treo vô hạn không throw lỗi gì.
                Ẩn bằng width/height=0 thay vì unmount hẳn. */}
            <div style={{
              position: 'relative', width: scaledSize.w, height: scaledSize.h,
              marginLeft: centeringMargin.marginX, marginRight: centeringMargin.marginX,
              marginTop: centeringMargin.marginY, marginBottom: centeringMargin.marginY,
            }}>
              <canvas
                ref={canvasRef}
                style={{ width: scaledSize.w, height: scaledSize.h, display: 'block' }}
              />
              {/* Viewport high-res overlay — đè lên đúng vị trí tương ứng trên
                  canvas nền qua rectToDisplayBox (CÙNG công thức effectiveScale
                  marker/canvas nền dùng, không lệch dù chưa render kịp zoom
                  mới nhất). pointerEvents:'none' — thuần hiển thị, không bao
                  giờ chặn click marker hay drag-to-pan (handler gắn trên
                  scrollRef, cần sự kiện xuyên qua overlay để bubble lên đúng). */}
              {viewportOverlayRect && (() => {
                const box = rectToDisplayBox(viewportOverlayRect, effectiveScale);
                return (
                  <canvas
                    ref={viewportOverlayCanvasRef}
                    style={{
                      position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height,
                      display: 'block', pointerEvents: 'none',
                    }}
                  />
                );
              })()}
              {canvasSize && units.map(u => {
                  // Ẩn hoàn toàn nếu không phải Còn hàng — chỉ căn Còn hàng mới
                  // hiển thị/clickable trên bản đồ.
                  if (!u.available) return null;

                  // Marker cố định theo pixel màn hình — vị trí (tâm) vẫn scale
                  // TUYỆT ĐỐI theo effectiveScale nên không bao giờ lệch khi zoom/pan.
                  const left = u.viewX * effectiveScale - MARKER_SIZE_PX / 2;
                  const top = u.viewY * effectiveScale - MARKER_SIZE_PX / 2;
                  const isHovered = hoveredCode === u.unitCode;
                  // Ô tìm mã căn — căn đang khớp đổi màu đỏ + viền pulse để nổi
                  // bật rõ giữa các marker xanh còn lại (yêu cầu "đổi icon hình
                  // tròn xanh thành đỏ để nổi bật").
                  const isSearchMatch = matchedUnit?.unitCode === u.unitCode;

                  const preview = u.available && u.match.kind === 'matched' ? buildTmbPreview(u.match.row) : null;

                  return (
                    <button
                      key={u.unitCode}
                      onPointerDown={e => {
                        // Marker là target tương tác riêng; không để pointerdown
                        // bubble lên scroll container rồi bị hiểu thành pan.
                        e.stopPropagation();
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        // Vừa kết thúc 1 lượt kéo (pan) chạm qua marker này —
                        // không coi là click, tránh mở popup ngoài ý muốn.
                        if (suppressNextClickRef.current) { suppressNextClickRef.current = false; return; }
                        if (u.available && u.match.kind === 'matched') onOpenUnit(u.match.row);
                      }}
                      onMouseEnter={() => u.available && setHoveredCode(u.unitCode)}
                      onMouseLeave={() => setHoveredCode(c => c === u.unitCode ? null : c)}
                      onFocus={() => u.available && setHoveredCode(u.unitCode)}
                      onBlur={() => setHoveredCode(c => c === u.unitCode ? null : c)}
                      disabled={!u.available}
                      title={u.unitCode}
                      className={isSearchMatch ? 'tmb-search-match' : undefined}
                      style={{
                        position: 'absolute', left, top, width: MARKER_SIZE_PX, height: MARKER_SIZE_PX, borderRadius: '50%',
                        border: `2px solid ${isSearchMatch ? '#b91c1c' : u.available ? '#16a34a' : '#9ca3af'}`,
                        background: isSearchMatch ? '#ef4444' : u.available ? '#22c55e' : 'rgba(156,163,175,0.32)',
                        boxShadow: isSearchMatch
                          ? '0 0 0 4px rgba(239,68,68,0.3), 0 2px 6px rgba(0,0,0,0.3)'
                          : u.available ? (isHovered ? '0 0 0 3px rgba(34,197,94,0.28), 0 2px 5px rgba(0,0,0,0.24)' : '0 2px 5px rgba(0,0,0,0.24)') : 'none',
                        opacity: u.available ? 1 : 0.5,
                        cursor: u.available ? 'pointer' : 'not-allowed',
                        padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: isSearchMatch ? 4 : isHovered ? 3 : 1, transition: 'box-shadow 0.1s',
                      }}
                    >
                      {/* Label mã căn — chỉ thường trực khi đã zoom đủ gần (tránh
                          chữ chồng chéo che bản đồ ở toàn cảnh), TRỪ căn đang khớp
                          tìm kiếm luôn hiện label bất kể mức zoom (dễ xác nhận
                          đúng căn vừa tìm). */}
                      {(showLabels || isSearchMatch) && (
                        <span style={{
                          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 3,
                          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                          color: isSearchMatch ? '#b91c1c' : '#15803d',
                          background: 'rgba(255,255,255,0.9)', padding: '1px 5px', borderRadius: 3,
                        }}>
                          {u.unitCode}
                        </span>
                      )}

                      {/* Compact preview khi hover/focus — chỉ căn Còn hàng. */}
                      {isHovered && preview && (
                        <div style={{
                          position: 'absolute', bottom: `calc(100% + 8px)`, left: '50%', transform: 'translateX(-50%)',
                          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', padding: '8px 12px', minWidth: 160,
                          fontSize: '0.75rem', color: 'var(--text-body)', textAlign: 'left', zIndex: 5, cursor: 'default',
                        }}>
                          <div style={{ fontWeight: 800, color: 'var(--text-title)', marginBottom: 4, fontSize: '0.8rem' }}>{preview.maCan}</div>
                          {preview.giaValue !== null && (
                            <div>Giá: <strong>{fmtGia(preview.giaValue)} tỷ</strong></div>
                          )}
                          {preview.areaValue !== null && (
                            <div>Diện tích: <strong>{fmtArea(preview.areaValue)}</strong></div>
                          )}
                          {preview.loaiHinh && <div>Loại hình: <strong>{preview.loaiHinh}</strong></div>}
                          {preview.huong && <div>Hướng: <strong>{preview.huong}</strong></div>}
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes tmbSearchPulse {
          0% { box-shadow: 0 0 0 4px rgba(239,68,68,0.35), 0 2px 6px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 9px rgba(239,68,68,0.12), 0 2px 6px rgba(0,0,0,0.3); }
          100% { box-shadow: 0 0 0 4px rgba(239,68,68,0.35), 0 2px 6px rgba(0,0,0,0.3); }
        }
        .tmb-search-match { animation: tmbSearchPulse 1.4s ease-in-out infinite; }
        .tmb-search-input {
          border: 1px solid var(--border, var(--border-light));
          background: var(--bg-secondary, #f8fafc);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .tmb-search-input::placeholder { color: var(--text-muted); opacity: 1; }
        .tmb-search-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-ring, rgba(99,102,241,0.25));
        }
        .tmb-search-input:disabled { cursor: default; opacity: 0.7; }
        .tmb-toolbar-btn:not(:disabled):hover { background: var(--bg-secondary, #f1f5f9) !important; }
      `}</style>
    </div>
  );
}

function zoomBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, border: '1px solid var(--border, var(--border-light))', background: 'var(--bg-card)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-body)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
  };
}
