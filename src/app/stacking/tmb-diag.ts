// ═══════════════════════════════════════════════════════════════════════
// TEMPORARY DIAGNOSTIC — TMB_HLX_MOBILE_FAILURE_STAGE audit
// Thêm để xác định CHÍNH XÁC bước nào HLX thất bại trên mobile thật (Saigon
// Park mở/đóng bình thường trên CÙNG máy, HLX vẫn thoát TMB/app dù 2 fix
// trước — DPR + initial-render-cap — đã release). KHÔNG đổi hành vi cho BẤT
// KỲ User nào theo mặc định — chỉ kích hoạt khi URL có ?tmbdiag=1 (giống hệt
// cơ chế tmb-search-diagnostic.ts đã dùng ở 1 audit trước, ĐÃ XOÁ sau khi
// dùng xong — file này CŨNG PHẢI xoá sau khi có kết luận, KHÔNG được commit).
//
// Log MỌI mốc trong vòng đời load/render TMB (xem TMB_HLX_MOBILE_FAILURE_STAGE
// audit) + lắng nghe beforeunload/pagehide/pageshow/visibilitychange (phân
// biệt "React đóng modal" (log unmount THẤY được) với "cả tab/app bị OS/
// browser reload vì hết bộ nhớ" (log unmount KHÔNG BAO GIỜ thấy — mất log
// giữa chừng, tab tự load lại từ đầu)) + mount/unmount của CHÍNH TmbMap.
// Không gọi preventDefault/stopPropagation, không đổi state/props, không gọi
// onClose/navigation/setSelectedConfig — CHỈ console.log + addEventListener +
// đọc/ghi sessionStorage (đệm log riêng của module này, KHÔNG đụng key nào
// khác của app) + tạo 1 <div> overlay hiển thị thuần text.
//
// PERSISTENCE (đúng yêu cầu "evidence phải sống sót qua 1 lượt reload/restore
// bình thường — sessionStorage sống sót qua đó"): mỗi dòng log ghi ra được
// APPEND vào 1 buffer bounded trong sessionStorage NGAY LẬP TỨC (không đợi
// unload — nếu tab bị OS/browser kill thật, sẽ KHÔNG có cơ hội chạy bất kỳ
// code nào lúc đó, nên phải ghi tăng dần trong lúc còn sống). Lần mount lại
// SAU (F5 bình thường HOẶC bị OS/browser tự tải lại) đọc lại buffer cũ, chèn
// dòng phân cách "=== NEW PAGE LOAD ===", rồi mới ghi tiếp — cho phép so sánh
// TRỰC TIẾP "dòng log cuối cùng của lượt trước" với "lượt mới bắt đầu thế
// nào" (navigation type + pageshow persisted) trong CÙNG 1 overlay/console.

const STORAGE_KEY = 'tmb-diag-log-v1';
// Bounded — KHÔNG log vô hạn. 200 dòng đủ phủ toàn bộ vòng đời 1 lần mở TMB
// (mount → fetch → render → lỗi/đóng) VÀ 1 lượt trước đó liền kề để so sánh,
// mà không phình sessionStorage (mỗi dòng ngắn, JSON nhỏ — 200 dòng ~ vài chục KB).
// EXPORTED để test kiểm tra đúng số bound thật (không lặp lại magic number).
export const TMB_DIAG_MAX_STORED_LINES = 200;
const MAX_STORED_LINES = TMB_DIAG_MAX_STORED_LINES;
// Overlay trên màn hình chỉ hiện N dòng CUỐI (đủ đọc trong 1 khung hình chụp
// màn hình) — tách riêng khỏi MAX_STORED_LINES (buffer đầy đủ hơn, phục vụ
// đọc lại qua Console/sessionStorage nếu có remote debug).
const MAX_OVERLAY_LINES = 30;

export function isTmbDiagEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('tmbdiag') === '1';
  } catch {
    return false;
  }
}

let seq = 0;
function ts(): string {
  return typeof performance !== 'undefined' ? performance.now().toFixed(1) + 'ms' : String(Date.now());
}

/** Đệm log trong bộ nhớ (mirror của sessionStorage, dùng cho overlay — tránh
 * đọc lại sessionStorage mỗi lần render overlay). Khởi tạo rỗng, được nạp lại
 * từ sessionStorage bởi initTmbDiagSessionOnce() nếu có log của lượt trước. */
let diagLines: string[] = [];
let overlayEl: HTMLDivElement | null = null;
let sessionInitialized = false;
let globalListenersAttached = false;

/** Đọc buffer log ĐÃ LƯU (lượt tải trang TRƯỚC, nếu sessionStorage còn sống —
 * sessionStorage sống sót qua reload/restore bình thường trong CÙNG tab,
 * KHÔNG sống sót qua đóng tab thật/mở tab mới). Hỏng/thiếu quyền (private
 * mode Safari cũ, quota) -> coi như không có gì, KHÔNG throw. */
function readStoredLines(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((l): l is string => typeof l === 'string') : [];
  } catch {
    return [];
  }
}

/** Ghi buffer đã bound xuống sessionStorage — lỗi ghi (quota/private mode)
 * CHỈ ảnh hưởng tới việc log có sống sót qua reload hay không, KHÔNG BAO GIỜ
 * được phép làm hỏng luồng TMB thật -> nuốt lỗi im lặng. */
function writeStoredLines(lines: string[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines.slice(-MAX_STORED_LINES)));
  } catch {
    // quota exceeded hoặc sessionStorage bị chặn (private mode) — diagnostic-only, bỏ qua.
  }
}

function renderOverlay(): void {
  if (!overlayEl) return;
  overlayEl.textContent = diagLines.slice(-MAX_OVERLAY_LINES).join('\n');
}

/** Thêm 1 dòng vào buffer (bound + persist + cập nhật overlay nếu có) — điểm
 * ghi DUY NHẤT, mọi hàm log khác (diagMark, các global listener) đều đi qua
 * đây để buffer/sessionStorage/overlay luôn nhất quán. */
function pushLine(line: string): void {
  diagLines.push(line);
  if (diagLines.length > MAX_STORED_LINES) diagLines = diagLines.slice(-MAX_STORED_LINES);
  writeStoredLines(diagLines);
  renderOverlay();
}

function diagLog(line: string): void {
  // eslint-disable-next-line no-console
  console.log(`[TMB-DIAG] ${line}`);
  pushLine(line);
}

/** Gắn overlay text cố định góc dưới màn hình — CHỈ khi ?tmbdiag=1, không có
 * ảnh hưởng gì tới layout/tương tác TMB thật (position:fixed, pointer-events:
 * none, z-index cao hơn TmbMap để luôn thấy được kể cả modal đang mở). */
export function mountDiagOverlayOnce(): void {
  if (overlayEl || typeof document === 'undefined') return;
  overlayEl = document.createElement('div');
  overlayEl.setAttribute('data-tmb-diag-overlay', '1');
  overlayEl.style.cssText =
    'position:fixed;left:4px;right:4px;bottom:4px;max-height:40vh;overflow:hidden;' +
    'background:rgba(0,0,0,0.82);color:#0f0;font:9px/1.3 monospace;padding:6px;border-radius:6px;' +
    'z-index:999999;pointer-events:none;white-space:pre-wrap;word-break:break-all;';
  document.body.appendChild(overlayEl);
  renderOverlay();
}

/** Log 1 mốc trong vòng đời TMB — luôn kèm profile.configId để phân biệt
 * Saigon Park vs HLX khi so log 2 lượt test cạnh nhau. Ghi CẢ vào console.log
 * (cho remote debug/USB) LẪN overlay + sessionStorage (cho screenshot trực
 * tiếp trên điện thoại không có debug tools, hoặc đọc lại SAU 1 lượt reload). */
export function diagMark(profileConfigId: string, stage: string, data?: Record<string, unknown>): void {
  seq += 1;
  diagLog(`#${seq} +${ts()} [${profileConfigId}] ${stage} ${data ? JSON.stringify(data) : ''}`);
}

/** Kích thước canvas ước lượng ra MB RGBA — dùng để so canvas thật cấp phát
 * cho Saigon Park vs HLX (đã bị cap bởi computeInitialRenderScale, nhưng vẫn
 * cần xem SỐ THẬT trên máy — cap hiện tại có thể vẫn quá lớn cho 1 thiết bị
 * cụ thể, hoặc vấn đề nằm ở chỗ khác ngoài canvas). */
export function canvasMB(w: number, h: number): string {
  return ((w * h * 4) / (1024 * 1024)).toFixed(1) + 'MB';
}

/** navigator.serviceWorker.controller — đọc AN TOÀN (SSR/browser cũ không có
 * navigator.serviceWorker), KHÔNG BAO GIỜ throw. presence=false + scriptURL
 * 'n/a' là kết quả HỢP LỆ (không có SW nào controll trang này), không phải lỗi. */
function readServiceWorkerControllerInfo(): { present: boolean; scriptURL: string } {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return { present: false, scriptURL: 'n/a' };
    const controller = navigator.serviceWorker.controller;
    return controller ? { present: true, scriptURL: controller.scriptURL } : { present: false, scriptURL: 'n/a' };
  } catch {
    return { present: false, scriptURL: 'n/a' };
  }
}

/** PerformanceNavigationTiming.type của LẦN TẢI TRANG HIỆN TẠI — 'navigate'
 * (link/gõ URL/mở app bình thường), 'reload' (F5/pull-to-refresh), 'back_forward'
 * (nút back/forward — có thể liên quan bfcache), 'prerender'. 'unknown' nếu API
 * không có (browser rất cũ) — đọc qua getEntriesByType, KHÔNG BAO GIỜ throw. */
function readNavigationType(): string {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return 'unknown';
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return entries[0]?.type ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Gọi 1 LẦN mỗi lượt tải trang (module-level guard — 1 lượt tải trang = 1 lần
 * evaluate module JS) — khôi phục log buffer của LƯỢT TRƯỚC từ sessionStorage
 * (nếu có, tức trang vừa reload/restore trong CÙNG tab, KHÔNG phải tab/app mới
 * hoàn toàn — sessionStorage không sống sót qua đó), chèn 1 dòng phân cách RÕ
 * RÀNG, rồi log NGAY navigationType + pathname/search + serviceWorker
 * controller hiện tại của lượt MỚI này (không cần đợi sự kiện pageshow —
 * PerformanceNavigationTiming đã có sẵn ngay khi script này chạy). Đây CHÍNH
 * LÀ bằng chứng "trang vừa được tải lại" nếu overlay/log của lượt TRƯỚC dừng
 * đột ngột giữa chừng (không có UNMOUNT) rồi xuất hiện dòng "=== NEW PAGE
 * LOAD ===" này ngay sau đó. */
export function initTmbDiagSessionOnce(): void {
  if (sessionInitialized || typeof window === 'undefined') return;
  sessionInitialized = true;
  diagLines = readStoredLines();
  renderOverlay();
  const navType = readNavigationType();
  const sw = readServiceWorkerControllerInfo();
  diagLog(
    `=== NEW PAGE LOAD === +${ts()} navigationType=${navType} pathname=${window.location.pathname} ` +
    `search=${window.location.search} swControllerPresent=${sw.present} swScriptURL=${sw.scriptURL}`
  );
}

/** Gắn 4 listener toàn cục 1 LẦN DUY NHẤT (module-level guard) — phân biệt
 * "component unmount bình thường" (log unmount CỦA TmbMap sẽ thấy TRƯỚC các
 * sự kiện này) với "cả trang bị OS/browser reload/kill vì hết bộ nhớ" (log
 * KHÔNG BAO GIỜ thấy unmount — mất dấu vết giữa chừng, rồi thấy dòng "=== NEW
 * PAGE LOAD ===" xuất hiện lại từ đầu ở lượt tải kế tiếp — vì sessionStorage
 * đã lưu tới đúng dòng cuối cùng trước khi mất). pagehide luôn fire trước
 * unload thật SỰ (kể cả khi vào bfcache, persisted=true trên pagehide tương
 * ứng) — thêm vào CÙNG lúc với beforeunload/pageshow/visibilitychange đã có
 * trước đó, không đổi hành vi 3 listener cũ. */
export function attachGlobalDiagListenersOnce(): void {
  if (globalListenersAttached || typeof window === 'undefined') return;
  globalListenersAttached = true;
  initTmbDiagSessionOnce();
  window.addEventListener('beforeunload', () => {
    diagLog(`+${ts()} window beforeunload — trang SẮP unload/reload (tab bị đóng/tải lại)`);
  });
  window.addEventListener('pagehide', (e) => {
    diagLog(`+${ts()} window pagehide — persisted=${(e as PageTransitionEvent).persisted} (persisted=true = có thể vào bfcache, KHÔNG bị huỷ hẳn; persisted=false = trang bị huỷ thật)`);
  });
  window.addEventListener('pageshow', (e) => {
    diagLog(`+${ts()} window pageshow — persisted=${(e as PageTransitionEvent).persisted} (persisted=false thường nghĩa là trang VỪA được tải lại từ đầu, không phải quay lại từ bfcache)`);
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      diagLog(`+${ts()} document visibilitychange — visibilityState=${document.visibilityState}`);
    });
  }
}

// ─── Test-only helpers ───────────────────────────────────────────────────
// KHÔNG dùng trong runtime component — chỉ để test kiểm tra state nội bộ của
// module (buffer/seq/flags) mà không cần parse DOM/sessionStorage thủ công,
// và để reset state module-level giữa các test case (module này giữ state ở
// top-level nên nhiều test trong CÙNG process cần cách reset tường minh).

export function __getDiagLinesForTest(): readonly string[] {
  return diagLines;
}

/** Reset TOÀN BỘ, kể cả sessionStorage — mô phỏng 1 TAB/PHIÊN HOÀN TOÀN MỚI
 * (sessionStorage không sống sót qua đây trong thực tế). Dùng giữa các test
 * case độc lập. */
export function __resetDiagStateForTest(): void {
  seq = 0;
  diagLines = [];
  overlayEl = null;
  sessionInitialized = false;
  globalListenersAttached = false;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op — best-effort cleanup only, giống mọi thao tác sessionStorage khác ở file này.
  }
}

/** Reset CHỈ state trong bộ nhớ (module vừa được re-evaluate), KHÔNG đụng
 * sessionStorage — mô phỏng ĐÚNG 1 lượt RELOAD BÌNH THƯỜNG trong CÙNG tab
 * (module JS chạy lại từ đầu, nhưng sessionStorage của tab vẫn còn nguyên) —
 * dùng để test "previous-session lines restored after reload". */
export function __resetInMemoryStateOnlyForTest(): void {
  seq = 0;
  diagLines = [];
  overlayEl = null;
  sessionInitialized = false;
  globalListenersAttached = false;
}
