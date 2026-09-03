/** Tổng mặt bằng (TMB) — spatial map cho nguồn "Vinhomes Sài Gòn Park".
 *
 * Toạ độ dưới đây được trích xuất TRỰC TIẾP từ text layer thật của file
 * "TMB Khu 1&2_DA VH Sagon Park.pdf" (đơn vị: PDF user-space units của trang
 * 1, KHÔNG xoay/scale) bằng pdfjs-dist — mỗi mã căn là 1 text run nguyên vẹn
 * trên trang, xuất hiện đúng 1 lần (đã kiểm tra không trùng lặp trên toàn bộ
 * 5143 mã căn tìm được trong file).
 *
 * Danh sách 22 mã dưới đây = TOÀN BỘ tab "Bảng hàng độc quyền" của nguồn này
 * (đã audit trực tiếp qua getStackingListRows với credentials thật, KHÔNG
 * qua HTTP) — 22/22 mã đều tồn tại trong PDF (giao 100%, không fuzzy-match).
 *
 * GIỚI HẠN v1 (có chủ đích, xem architecture guards): map này CHỈ phủ 22 mã
 * đã audit, KHÔNG tự mở rộng ra toàn bộ 5143 mã trong PDF. Nếu Bảng hàng
 * thêm căn mới chưa có trong danh sách này, căn đó sẽ KHÔNG hiện trên TMB
 * cho tới khi map được cập nhật thủ công (không tạo hotspot cho mã không có
 * toạ độ đã biết).
 *
 * Đây CHỈ là spatial authority (căn nằm ở đâu) — KHÔNG chứa giá/diện
 * tích/trạng thái. Business data + trạng thái luôn lookup SỐNG từ Bảng hàng
 * (StackingListRow) theo đúng unitCode, theo authority đã thống nhất trong audit.
 */
export interface TmbMapUnit {
  unitCode: string;
  /** Vị trí neo của label mã căn trên trang PDF gốc (chưa xoay/scale). */
  pdfX: number;
  pdfY: number;
}

/** id ổn định (StackingConfig.id, dạng "SC_<timestamp>") của nguồn "Vinhomes
 * Sài Gòn Park" mà TMB map này áp dụng — audit trực tiếp qua getStackingConfigs()
 * với credentials thật (KHÔNG qua HTTP), id sinh 1 LẦN DUY NHẤT lúc tạo nguồn
 * (addStackingConfig) và KHÔNG BAO GIỜ đổi qua bất kỳ update nào sau đó.
 *
 * TRƯỚC ĐÂY gate bằng sheet_id (mutable — từ khi cho phép Admin đổi Google
 * Sheet backing 1 nguồn qua "Quản lý Sheet" → "Sửa", sheet_id có thể đổi bất
 * kỳ lúc nào mà VẪN LÀ cùng 1 nguồn/dự án), khiến nút "Tổng mặt bằng" biến
 * mất sai ngay khi đổi Sheet dù spatial mapping bên dưới vẫn hoàn toàn đúng.
 * id không có rủi ro này -> dùng làm stable identity, xem isTmbAvailableForConfig. */
export const TMB_MAP_CONFIG_ID = 'SC_1788152955557';

/** TMB chỉ hiện cho ĐÚNG nguồn đã audit spatial mapping (v1 chỉ phủ Vinhomes
 * Sài Gòn Park) — so theo config.id (ổn định), KHÔNG so theo sheet_id (mutable,
 * xem TMB_MAP_CONFIG_ID). Tách hàm riêng để 3 nơi gọi (nút mở TMB, margin
 * layout, mount TmbMap) luôn dùng CHUNG 1 điều kiện, không lệch nhau. */
export function isTmbAvailableForConfig(config: { id: string } | null | undefined): boolean {
  return config?.id === TMB_MAP_CONFIG_ID;
}

export const TMB_PDF_URL = '/tmb-poc/tmb-khu-1-2-vhsgp.pdf';

/** pdf.js worker — serve dưới dạng static asset public/ với path string cố
 * định, KHÔNG dùng `new URL('pdfjs-dist/.../pdf.worker.min.mjs', import.meta.url)`.
 * Pattern đó phụ thuộc webpack resolve import.meta.url đúng cách, vốn không
 * ổn định giữa `next dev` (HMR/dev chunk) và `next build` — build pass
 * không đảm bảo dev cũng chạy đúng, và khi worker không load được, pdf.js
 * có thể treo vô hạn ở getDocument() thay vì throw lỗi rõ ràng. Static path
 * public/ hoạt động giống hệt nhau ở cả dev lẫn production. */
export const TMB_PDF_WORKER_URL = '/tmb-poc/pdf.worker.min.mjs';
export const TMB_PDF_PAGE_NUMBER = 1;

// 22 mã = TOÀN BỘ tab "Bảng hàng độc quyền" (IVY PARK 14 mã "AS...", GLOBAL
// PARK 8 mã "TL..."), trích xuất nguyên văn từ PDF, KHÔNG chỉnh sửa.
export const TMB_MAP_UNITS: TmbMapUnit[] = [
  { unitCode: 'AS80-08', pdfX: 835.34, pdfY: 2170.37 },
  { unitCode: 'AS80-12', pdfX: 830.74, pdfY: 2166.91 },
  { unitCode: 'AS72-02', pdfX: 930.96, pdfY: 2060.21 },
  { unitCode: 'AS72-04', pdfX: 928.80, pdfY: 2058.05 },
  { unitCode: 'AS71-02', pdfX: 943.49, pdfY: 2044.08 },
  { unitCode: 'AS71-09', pdfX: 942.77, pdfY: 2025.36 },
  { unitCode: 'AS48A-10', pdfX: 1230.34, pdfY: 1649.81 },
  { unitCode: 'AS48A-20', pdfX: 1215.94, pdfY: 1638.86 },
  { unitCode: 'AS85-22', pdfX: 752.40, pdfY: 2239.63 },
  { unitCode: 'AS73-16', pdfX: 895.25, pdfY: 2062.37 },
  { unitCode: 'AS73-18', pdfX: 892.94, pdfY: 2060.64 },
  { unitCode: 'AS52-38', pdfX: 1155.46, pdfY: 1669.10 },
  { unitCode: 'AS52-40', pdfX: 1153.15, pdfY: 1667.38 },
  { unitCode: 'AS77-52', pdfX: 800.93, pdfY: 2092.75 },
  { unitCode: 'TL11-128', pdfX: 1218.82, pdfY: 1903.25 },
  { unitCode: 'TL11-06', pdfX: 1452.67, pdfY: 1912.90 },
  { unitCode: 'TL12-67', pdfX: 1340.50, pdfY: 1914.34 },
  { unitCode: 'TL12-79', pdfX: 1321.06, pdfY: 1913.47 },
  { unitCode: 'TL12-31', pdfX: 1411.06, pdfY: 1917.79 },
  { unitCode: 'TL12-33', pdfX: 1408.18, pdfY: 1917.65 },
  { unitCode: 'TL12-35', pdfX: 1405.30, pdfY: 1917.50 },
  { unitCode: 'TL12-45', pdfX: 1378.51, pdfY: 1916.21 },
];
