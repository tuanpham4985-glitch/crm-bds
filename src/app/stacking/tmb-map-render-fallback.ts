/** Quyết định có nên BỎ QUA render nền PDF raster (page.render()) hay không —
 * TÁCH RIÊNG khỏi tmb-map-render-quality.ts (file đó CỐ TÌNH thuần
 * effectiveScale/dpr, KHÔNG device detection — xem test "KHÔNG có device/UA/
 * mobile detection nào được thêm vào" trong tmb-map-render-quality.test.ts).
 * Quyết định NÀY khác bản chất: không phải chọn ĐỘ PHÂN GIẢI raster (luôn an
 * toàn, đã audit ở computeInitialRenderScale — canvas backing store nhỏ,
 * không phải nguyên nhân) mà là "trang PDF này có KHỐI LƯỢNG operator vẽ
 * (showText/moveText/...) lớn tới mức bản thân page.render() — bất kể canvas
 * to/nhỏ — có rủi ro treo/crash trên thiết bị bộ nhớ hạn chế hay không".
 *
 * Đã audit trực tiếp bằng pdfjs-dist (getOperatorList) trên 2 file TMB thật:
 *   VBM1:  96,498 operators (11,332 showText)  — production ổn định.
 *   TĐNĐ1: 207,250 operators (70,426 showText) — xác nhận crash mobile thật
 *          (?tmbdiag=1: log dừng đúng tại page.render:start, không có
 *          page.render:complete/STABLE-OPEN-STATE-REACHED sau đó).
 * Cùng kích thước trang (1600×1200), cùng 10 font gốc, không Type3 font,
 * không OCG layer nào để tắt chọn lọc — chênh lệch DUY NHẤT là volume nội
 * dung vẽ (TĐNĐ1 có nhiều thửa/nhãn hơn hẳn).
 *
 * ĐÃ LOẠI TRỪ (đo thực tế bằng browser bench, KHÔNG suy đoán):
 * - Giảm render scale: KHÔNG giảm chi phí — warm-render đo phẳng ~370-1000ms
 *   bất kể scale 0.25x-2x (pdf.js thực thi TOÀN BỘ operator list mỗi lần
 *   render() dù canvas raster nhỏ, không cull theo pixel/viewport).
 * - `useRequestAnimationFrame` truyền vào page.render(): KHÔNG PHẢI tham số
 *   public trong bản pdfjs-dist đang dùng (verify trực tiếp
 *   node_modules/pdfjs-dist/legacy/build/pdf.mjs — PDFPageProxy.render() tự
 *   set nội bộ `useRequestAnimationFrame: !intentPrint`, đã = true sẵn cho
 *   intent 'display' mặc định) — truyền tham số này là no-op hoàn toàn.
 * - `page.getOperatorList()` làm probe runtime trước khi quyết định render:
 *   đo thật tốn 11-21 GIÂY một mình trên chính 2 file này (CHẬM HƠN cả
 *   page.render() đầy đủ — không share cache/intentState với render(), 2
 *   cacheKey khác nhau) — dùng làm "kiểm tra rẻ" phản tác dụng, gần như gấp
 *   đôi tổng chi phí thay vì giảm rủi ro.
 *
 * => operatorCount PHẢI đo OFFLINE 1 LẦN (cùng triết lý pdfX/pdfY trong
 * tmb-map-data.ts — toạ độ audit sẵn, không tính lại runtime), gắn vào
 * TmbMapProfile.knownOperatorCount làm metadata tĩnh — KHÔNG gọi
 * getOperatorList() trong browser User. */

/** Trên ngưỡng này coi là "workload nặng" — chọn nằm giữa VBM1 (96,498, an
 * toàn) và TĐNĐ1 (207,250, đã xác nhận crash), đủ margin để không false-
 * positive cho profile an toàn nếu số liệu audit sau này lệch nhẹ. */
export const HEAVY_RENDER_OPERATOR_THRESHOLD = 150_000;

/** Ngưỡng navigator.deviceMemory (GB, Device Memory API) coi là thiết bị hạn
 * chế bộ nhớ — 4GB là mốc phổ biến trong khuyến nghị hiệu năng web (cùng mốc
 * Chrome DevTools dùng cho tier "low-end"). API CHỈ có trên Chromium (Android
 * Chrome — đúng nền tảng đã quan sát crash "Không thể mở trang này");
 * Safari/Firefox không expose -> deviceMemoryGB = undefined ở nơi gọi. */
export const CONSTRAINED_DEVICE_MAX_MEMORY_GB = 4;

/** Quyết định DUY NHẤT, thuần hàm — KHÔNG đọc navigator trực tiếp (caller
 * truyền deviceMemoryGB đã đọc sẵn, xem getDeviceMemoryGB trong TmbMap.tsx),
 * giữ file này test được không cần DOM/browser. true CHỈ khi CẢ 2 tín hiệu
 * cùng đúng: (a) profile đã audit là workload nặng (operatorCount vượt
 * ngưỡng) VÀ (b) thiết bị có tín hiệu hạn chế bộ nhớ thật. Thiếu 1 trong 2
 * (operatorCount chưa audit HOẶC deviceMemory API không có) -> false, giữ
 * NGUYÊN hành vi render đầy đủ hiện có — không suy đoán khi thiếu dữ liệu. */
export function shouldSkipPdfBackgroundRender(
  operatorCount: number | undefined,
  deviceMemoryGB: number | undefined,
): boolean {
  if (operatorCount === undefined || operatorCount <= HEAVY_RENDER_OPERATOR_THRESHOLD) return false;
  if (deviceMemoryGB === undefined) return false;
  return deviceMemoryGB <= CONSTRAINED_DEVICE_MAX_MEMORY_GB;
}
