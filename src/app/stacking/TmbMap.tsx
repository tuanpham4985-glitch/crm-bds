'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { X, Loader2, AlertCircle, Plus, Minus, Eye, EyeOff, RefreshCw, Maximize2, Locate } from 'lucide-react';
import type { StackingListRow } from '@/lib/types';
import { fmtGia, fmtArea } from './format';
import { TMB_PDF_URL, TMB_PDF_WORKER_URL, TMB_PDF_PAGE_NUMBER, TMB_MAP_UNITS } from './tmb-map-data';
import { buildMaCanIndex, resolveTmbUnitState, summarizeTmbInventory, type TmbUnitState } from './tmb-map-matching';
import { buildTmbPreview } from './tmb-map-preview';
import { applyWheelZoom, screenPointToContentPoint, contentPointToScroll } from './tmb-map-zoom';
import { exceedsDragThreshold, applyPanScroll, computeScaledContentSize, computeCenteringMargin } from './tmb-map-pan';
import { computeRenderQuality, shouldUpgradeRenderQuality, VIEWPORT_RENDER_QUALITY_CAPS } from './tmb-map-render-quality';
import {
  computeVisibleContentRect, applyOverscan, clampRectToPageBounds, rectSize, rectContains, rectToDisplayBox,
  OVERSCAN_FRACTION, type Rect,
} from './tmb-map-viewport';
import type { PDFPageProxy, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/** Tổng mặt bằng (TMB) — render trang TMB (PDF thật) làm nền + marker theo
 * toạ độ text layer, click marker -> lookup Mã căn trong Bảng hàng hiện có
 * (đúng authority effectiveDotStatus) -> mở CHÍNH popup chi tiết căn
 * (ListUnitDetailModal, truyền vào qua onOpenUnit).
 *
 * AVAILABLE-ONLY: chỉ căn "Còn hàng" (effectiveDotStatus === 'con_hang')
 * mới hiển thị nổi bật + clickable/hoverable. Đã bán/Đang xem/unmatched/
 * ambiguous mặc định ẨN — Debug mới hiện dạng mờ, không bao giờ clickable.
 *
 * Map CHỈ mang unitCode + toạ độ (TMB_MAP_UNITS) — không chứa business data
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
 * đầu chỉ vẽ 1 lần ở BASE_SCALE=1 (~3370×2384px, đo thật bằng pdf.js) — CSS
 * width/height (scaledSize, hiển thị) phóng bitmap CỐ ĐỊNH đó lên tới 20x,
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
// Không được spinner vô hạn — nếu pdf.js (network/worker) treo quá lâu, tự
// chuyển sang error state thay vì chờ mãi. 20s đủ rộng cho file 13MB trên
// mạng chậm, đủ hẹp để không làm User nghĩ app bị đứng.
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
  listRows: StackingListRow[];
  onOpenUnit: (row: StackingListRow) => void;
  onClose: () => void;
}

interface RenderedUnit extends TmbUnitState {
  viewX: number;
  viewY: number;
}

export default function TmbMap({ listRows, onOpenUnit, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [zoomMultiplier, setZoomMultiplier] = useState(DEFAULT_ZOOM_MULT);
  const [showDebug, setShowDebug] = useState(false);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
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

    const timeoutId = setTimeout(() => {
      timedOut = true;
      log('TIMEOUT sau', LOAD_TIMEOUT_MS, 'ms — pdf.js không phản hồi (khả năng cao: worker không load được)');
      if (!cancelled) {
        setError(`Quá thời gian chờ (${LOAD_TIMEOUT_MS / 1000}s) khi tải bản vẽ TMB — kiểm tra Console (log "[TmbMap]") và tab Network cho "${TMB_PDF_URL}" / "${TMB_PDF_WORKER_URL}".`);
        setLoading(false);
      }
    }, LOAD_TIMEOUT_MS);

    (async () => {
      try {
        log('bước 1/5: import pdfjs-dist...');
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

        pdfjs.GlobalWorkerOptions.workerSrc = TMB_PDF_WORKER_URL;
        log('bước 2/5: workerSrc =', TMB_PDF_WORKER_URL, '— fetch toàn bộ PDF:', TMB_PDF_URL);

        // Vercel phục vụ PDF với Accept-Ranges; pdf.js đôi khi đọc range/stream
        // bị lệch offset ("Bad end offset") trên asset lớn. Với file TMB ~13MB,
        // tải trọn file rồi truyền bytes cho pdf.js ổn định hơn và vẫn đủ nhanh.
        const pdfResponse = await fetch(TMB_PDF_URL, { cache: 'no-store' });
        if (!pdfResponse.ok) throw new Error(`Không tải được file TMB (${pdfResponse.status})`);
        const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
        log('tải PDF hoàn tất:', pdfBytes.byteLength, 'bytes');

        const loadingTask = pdfjs.getDocument({ data: pdfBytes });
        const doc = await loadingTask.promise;
        if (timedOut || cancelled) return;
        loadedDoc = doc;
        log('bước 3/5: getDocument() OK, numPages =', doc.numPages);

        const page = await doc.getPage(TMB_PDF_PAGE_NUMBER);
        if (timedOut || cancelled) return;
        const viewport = page.getViewport({ scale: BASE_SCALE, rotation: page.rotate });
        log('bước 4/5: getPage() OK, viewport =', viewport.width, 'x', viewport.height, 'rotation', viewport.rotation);

        const canvas = canvasRef.current;
        if (!canvas || cancelled || timedOut) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Không khởi tạo được canvas context (getContext("2d") trả về null)');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        log('bước 5/5: page.render() bắt đầu...');
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled || timedOut) return;
        log('bước 5/5: page.render() hoàn tất');

        const points = TMB_MAP_UNITS.map(h => {
          const [vx, vy] = viewport.convertToViewportPoint(h.pdfX, h.pdfY);
          return { unitCode: h.unitCode, viewX: vx, viewY: vy };
        });

        // Giữ page SỐNG (không .cleanup() ở đây) để adaptive high-res render
        // sau này gọi lại CHÍNH page này ở scale cao hơn khi zoom sâu — không
        // re-fetch/re-parse file 13MB. renderedRenderScaleRef đã reset =
        // BASE_SCALE ở đầu effect, đúng bằng scale vừa render.
        pageRef.current = page;

        clearTimeout(timeoutId);
        setCanvasSize({ w: canvas.width, h: canvas.height });
        setViewportPoints(points);
        setZoomMultiplier(DEFAULT_ZOOM_MULT); // mở ở fit-to-view, không auto-zoom khu Còn hàng
        setLoading(false);
      } catch (err) {
        clearTimeout(timeoutId);
        const msg = err instanceof Error ? err.message : String(err);
        log('LỖI:', msg, err);
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
  }, [retryKey]);

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

    setSharpening(true);
    const task = page.render({ canvasContext: offCtx, viewport });
    activeRenderTaskRef.current = task;
    try {
      await task.promise;
    } catch {
      // RenderingCancelledException do bị .cancel() bởi lượt render mới hơn
      // — hành vi bình thường, không phải lỗi, im lặng bỏ qua.
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
    }
    if (activeRenderTaskRef.current === task) activeRenderTaskRef.current = null;
    setSharpening(false);
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
    if (!shouldUpgradeRenderQuality(target, renderedRenderScaleRef.current)) return;
    const timer = setTimeout(() => { void renderHighRes(target); }, RENDER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
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
    () => TMB_MAP_UNITS.map(h => resolveTmbUnitState(h.unitCode, maCanIndex)),
    [maCanIndex]
  );
  const summary = useMemo(() => summarizeTmbInventory(unitStates), [unitStates]);

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
  // nhau trong DOM nên không cần guard riêng), nên click Debug/Vừa khung/
  // Tới khu Còn hàng và tương tác popup (render tách biệt, z-index cao hơn)
  // không bao giờ chạm handler này.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (loading || error || !canvasSize) return;
    if (e.button !== 0) return; // chỉ chuột trái (touch/pen primary cũng = 0)
    const container = scrollRef.current;
    if (!container) return;
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
      dragged: false,
    };
    container.setPointerCapture(e.pointerId);
  }, [loading, error, canvasSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const container = scrollRef.current;
    if (!drag || !container || drag.pointerId !== e.pointerId) return;
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
  }, []);

  // Dùng chung cho pointerup/pointercancel/pointerleave — PHẢI dọn state ở
  // cả 3 để không bao giờ kẹt "đang kéo" (VD chuột rời khỏi cửa sổ trình
  // duyệt giữa lúc kéo). Nếu lượt kéo đã vượt ngưỡng (dragged=true), khoá
  // suppressNextClickRef để click phát sinh ngay sau đó trên marker (nếu có)
  // không vô tình mở popup ngoài ý muốn.
  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const container = scrollRef.current;
    if (container?.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
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

  const availableCount = units.filter(u => u.available).length;
  const showLabels = zoomMultiplier >= LABEL_VISIBLE_AT_ZOOM;

  // Kích thước content đã scale + margin canh giữa khi content nhỏ hơn
  // container (0 khi đã tràn khung) — xem giải thích đầy đủ ở
  // computeCenteringMargin trong tmb-map-pan.ts (thay flex-center cũ, vốn
  // khiến browser chỉ cho scroll được ~nửa phạm vi cần, không tới được góc).
  const scaledSize = canvasSize ? computeScaledContentSize(canvasSize, effectiveScale) : { w: 0, h: 0 };
  const centeringMargin = containerSize ? computeCenteringMargin(containerSize, scaledSize) : { marginX: 0, marginY: 0 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div
        style={{ width: '100%', maxWidth: 1100, height: '85vh', background: 'var(--bg-card)', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-title)' }}>Tổng mặt bằng</div>
            <div style={{ fontSize: '0.8rem', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: '#15803d', fontWeight: 700 }}>Còn hàng: {availableCount} căn</span>
              {showDebug && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  (debug — tổng {summary.total} · khớp {summary.matched} · trạng thái khác {summary.otherStatus} · không khớp {summary.unmatched} · mơ hồ {summary.ambiguous})
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setShowDebug(v => !v)} title="Debug: hiện số liệu chẩn đoán + các căn không phải Còn hàng dạng mờ (vẫn không click được)" style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
              border: '1px solid var(--border)', background: showDebug ? 'var(--bg-secondary, #f1f5f9)' : 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer',
            }}>
              {showDebug ? <Eye size={13} /> : <EyeOff size={13} />} Debug
            </button>
            <button onClick={handleFocusAvailable} disabled={loading || availableCount === 0} title="Zoom/pan tới khu vực có căn Còn hàng" style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)',
              cursor: loading || availableCount === 0 ? 'default' : 'pointer', opacity: loading || availableCount === 0 ? 0.5 : 1,
            }}>
              <Locate size={13} /> Tới khu Còn hàng
            </button>
            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
            <button onClick={handleFitToView} disabled={loading} title="Vừa khung — thấy toàn bộ TMB" style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
              border: '1px solid var(--border)', background: zoomMultiplier === DEFAULT_ZOOM_MULT ? 'var(--bg-secondary, #f1f5f9)' : 'var(--bg-card)',
              color: 'var(--text-muted)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
            }}>
              <Maximize2 size={13} /> Vừa khung
            </button>
            <button onClick={() => setZoomMultiplier(z => Math.max(MIN_ZOOM_MULT, +(z - ZOOM_STEP).toFixed(2)))} disabled={loading || zoomMultiplier <= MIN_ZOOM_MULT} title="Thu nhỏ" style={zoomBtnStyle(loading || zoomMultiplier <= MIN_ZOOM_MULT)}>
              <Minus size={15} />
            </button>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', minWidth: 40, textAlign: 'center' }} title="Zoom tương đối so với Vừa khung (1.0x = đúng bằng fit)">{zoomMultiplier.toFixed(1)}x</span>
            <button onClick={() => setZoomMultiplier(z => Math.min(MAX_ZOOM_MULT, +(z + ZOOM_STEP).toFixed(2)))} disabled={loading || zoomMultiplier >= MAX_ZOOM_MULT} title="Phóng to" style={zoomBtnStyle(loading || zoomMultiplier >= MAX_ZOOM_MULT)}>
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
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)', borderRadius: 8, marginLeft: 6 }}>
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
                  // Ẩn hoàn toàn nếu không phải Còn hàng, TRỪ khi bật Debug (khi đó
                  // hiện rất mờ, non-interactive — không bao giờ trộn với Còn hàng).
                  if (!u.available && !showDebug) return null;

                  // Marker cố định theo pixel màn hình — vị trí (tâm) vẫn scale
                  // TUYỆT ĐỐI theo effectiveScale nên không bao giờ lệch khi zoom/pan.
                  const left = u.viewX * effectiveScale - MARKER_SIZE_PX / 2;
                  const top = u.viewY * effectiveScale - MARKER_SIZE_PX / 2;
                  const isHovered = hoveredCode === u.unitCode;

                  const debugLabel = u.match.kind === 'matched' ? 'Trạng thái khác'
                    : u.match.kind === 'ambiguous' ? `Mơ hồ (${u.match.count} dòng trùng mã)`
                    : 'Không khớp Bảng hàng';

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
                      title={u.available ? u.unitCode : `${u.unitCode} — ${debugLabel}`}
                      style={{
                        position: 'absolute', left, top, width: MARKER_SIZE_PX, height: MARKER_SIZE_PX, borderRadius: '50%',
                        border: `2px solid ${u.available ? '#16a34a' : '#9ca3af'}`,
                        background: u.available ? '#22c55e' : 'rgba(156,163,175,0.32)',
                        boxShadow: u.available ? (isHovered ? '0 0 0 3px rgba(34,197,94,0.28), 0 2px 5px rgba(0,0,0,0.24)' : '0 2px 5px rgba(0,0,0,0.24)') : 'none',
                        opacity: u.available ? 1 : 0.5,
                        cursor: u.available ? 'pointer' : 'not-allowed',
                        padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: isHovered ? 3 : 1, transition: 'box-shadow 0.1s',
                      }}
                    >
                      {/* Label mã căn — chỉ thường trực khi đã zoom đủ gần (tránh
                          chữ chồng chéo che bản đồ ở toàn cảnh); căn Debug-mờ vẫn
                          luôn hiện label để dễ chẩn đoán vị trí. */}
                      {(showLabels || !u.available) && (
                        <span style={{
                          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 3,
                          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                          color: u.available ? '#15803d' : '#6b7280',
                          background: 'rgba(255,255,255,0.9)', padding: '1px 5px', borderRadius: 3,
                        }}>
                          {u.available ? u.unitCode : `${u.unitCode} (${debugLabel})`}
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
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function zoomBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-body)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  };
}
