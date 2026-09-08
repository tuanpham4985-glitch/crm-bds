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
 * id không có rủi ro này -> dùng làm stable identity, xem resolveTmbMapProfile. */
export const TMB_MAP_CONFIG_ID = 'SC_1788152955557';

export const TMB_PDF_URL = '/tmb-poc/tmb-khu-1-2-vhsgp.pdf';

/** pdf.js worker — serve dưới dạng static asset public/ với path string cố
 * định, KHÔNG dùng `new URL('pdfjs-dist/.../pdf.worker.min.mjs', import.meta.url)`.
 * Pattern đó phụ thuộc webpack resolve import.meta.url đúng cách, vốn không
 * ổn định giữa `next dev` (HMR/dev chunk) và `next build` — build pass
 * không đảm bảo dev cũng chạy đúng, và khi worker không load được, pdf.js
 * có thể treo vô hạn ở getDocument() thay vì throw lỗi rõ ràng. Static path
 * public/ hoạt động giống hệt nhau ở cả dev lẫn production. DÙNG CHUNG cho
 * MỌI profile (worker là runtime pdf.js chung, KHÔNG phải data riêng dự án
 * nào) — không lặp lại field này trong từng TmbMapProfile. */
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

// ─── Multi-project TMB profile registry ────────────────────────────────────
// Renderer (TmbMap.tsx) dùng CHUNG cho mọi dự án — dữ liệu riêng từng dự án
// (PDF + spatial mapping) tách hẳn ra đây thành 1 TmbMapProfile/dự án, KHÔNG
// hard-code if/else theo project trong component. Thêm dự án mới = thêm 1
// entry vào TMB_MAP_PROFILES bên dưới (sau khi đã audit PDF thật + verify
// từng mã căn — xem tmb-map-matching.ts cho exact-match, KHÔNG fuzzy), KHÔNG
// đụng renderer.

export interface TmbMapProfile {
  /** Identity ỔN ĐỊNH của CHÍNH 1 profile/map này (KHÔNG PHẢI luôn luôn bằng
   * StackingConfig.id — xem `stackingConfigId` bên dưới cho việc đó). TmbMap.tsx
   * CHỈ dùng field này làm dependency key khi re-fetch/render (đổi profile ->
   * load lại đúng PDF/unit mới) + nhãn phân biệt log diagnostic, KHÔNG dùng để
   * resolve gì khác — an toàn để 2 profile CÙNG 1 project (VD nhiều phân khu,
   * xem HLX_TDND1_TMB_PROFILE/HLX_VBM_TMB_PROFILE) có `configId` KHÁC NHAU
   * (mỗi profile 1 identity riêng, giống hệt cách profile DB-managed đã làm —
   * xem `configId: row.id` trong tmb-map-registry.ts, KHÔNG PHẢI stacking_config_id). */
  configId: string;
  /** StackingConfig.id của PROJECT (nguồn) mà profile này thuộc về — dùng để
   * resolve "project đang chọn có (những) map nào" (xem resolveTmbMapProfiles).
   * 1 project CÓ THỂ có NHIỀU profile cùng `stackingConfigId` (nhiều phân khu,
   * VD HLX có cả TĐNĐ1 lẫn VBM1) — identity DUY NHẤT quyết định asset nào hiện
   * cho project nào, KHÔNG BAO GIỜ suy đoán/fallback qua tên hay thứ tự mảng. */
  stackingConfigId: string;
  /** Tên hiển thị trong header TmbMap khi có >1 profile (phân biệt đang xem
   * TMB của dự án nào). */
  label: string;
  /** Optional — CHỈ profile dùng đường pdf.js client-side (render trực tiếp
   * PDF trong browser) mới cần pdfUrl/pdfPageNumber. Profile dùng
   * `staticBackgroundImageUrl` (bên dưới) KHÔNG cần 2 field này — TmbMap.tsx
   * không bao giờ fetch/parse PDF cho profile đó (xem HLX_TDND1_TMB_PROFILE:
   * PDF ~207K operator gây crash mobile thật, đã audit + thay bằng ảnh raster
   * offline). 1 profile LUÔN CHỈ dùng ĐÚNG 1 trong 2 đường — không đồng thời. */
  pdfUrl?: string;
  pdfPageNumber?: number;
  /** Ảnh nền TĨNH (rasterize offline 1 lần, WebP/PNG/JPEG — xem comment tại
   * TMB_HLX_TDND1_STATIC_IMAGE_URL bên dưới cho quy trình rasterize đã dùng)
   * thay cho render pdf.js client-side. Khi set (kèm `nativeSize` bên dưới),
   * TmbMap.tsx bỏ qua HOÀN TOÀN pdf.js (không getDocument/getPage/render) —
   * chỉ tải ảnh + vẽ 1 lần lên canvas, xem tmb-map-static-background.ts cho
   * cách marker pdfX/pdfY vẫn map đúng dù không còn pdf.js. */
  staticBackgroundImageUrl?: string;
  /** Kích thước content-space (BASE_SCALE=1, ĐÚNG kích thước trang PDF gốc đã
   * audit lúc rasterize — KHÔNG PHẢI kích thước pixel thật của ảnh raster,
   * ảnh có thể render ở scale cao hơn để nét hơn) — dùng cho canvasSize/
   * fitScale/marker, giữ NGUYÊN cùng hệ toạ độ pdfX/pdfY hiện có (xem
   * tmb-map-static-background.ts). BẮT BUỘC đi kèm staticBackgroundImageUrl. */
  nativeSize?: { w: number; h: number };
  units: TmbMapUnit[];
}

const SAIGON_PARK_TMB_PROFILE: TmbMapProfile = {
  configId: TMB_MAP_CONFIG_ID,
  stackingConfigId: TMB_MAP_CONFIG_ID,
  label: 'Vinhomes Sài Gòn Park',
  pdfUrl: TMB_PDF_URL,
  pdfPageNumber: TMB_PDF_PAGE_NUMBER,
  units: TMB_MAP_UNITS,
};

/** id ổn định (StackingConfig.id) của nguồn "Vinhomes Global Gate HLX" — audit
 * trực tiếp qua getStackingConfigs() với credentials thật (KHÔNG qua HTTP),
 * CÙNG lý do dùng config.id (không phải sheet_id) với TMB_MAP_CONFIG_ID. */
export const TMB_HLX_VBM_CONFIG_ID = 'SC_1788510325994';

/** PDF authoritative gốc của VBM1 (10,261,927 bytes, chưa optimize — GIỮ LẠI
 * trên đĩa public/tmb-poc/tmb-hlx-vbm1.pdf làm nguồn tham chiếu/để rasterize
 * lại nếu cần chất lượng khác sau này) — KHÔNG CÒN được TmbMap.tsx fetch/
 * render ở production. Đường pdf.js client-side cho VBM1 đã xác nhận GÂY
 * CRASH THẬT trên cùng iPhone production đã crash với TĐNĐ1 (page.render()
 * không hoàn tất — đã audit trực tiếp: PDF nhúng 1 ảnh raster nền 12000×7978px
 * (~96MP, gấp đôi tổng số qua 1 XObject thứ 2 không được
 * src/lib/tmb-optimizer.ts phát hiện vì nằm ngoài page.Resources) khiến
 * page.render() không hoàn tất được ngay cả trên desktop mạnh, thử nhiều
 * scale/đã downsample ảnh vẫn không giải quyết được — xem
 * TMB_HLX_VBM_STATIC_IMAGE_URL cho hướng thay thế đã dùng). Không gắn field
 * pdfUrl vào profile nữa, giữ hằng số này chỉ để tham chiếu. */
export const TMB_HLX_VBM_PDF_URL = '/tmb-poc/tmb-hlx-vbm1.pdf';

/** Ảnh nền TĨNH của VBM1 — rasterize OFFLINE (do page.render() không hoàn tất
 * được cho PDF này qua pdf.js client-side dù đã thử downsample ảnh nhúng, xem
 * comment TMB_HLX_VBM_PDF_URL) — nguồn chính xác từ CHÍNH file
 * TMB_HLX_VBM_PDF_URL (đã verify checksum khớp bản trên đĩa của User), 3200×
 * 2400px (gấp đôi trang gốc 1600×1200, cùng thông số đã dùng cho TĐNĐ1) WebP
 * 899,472 bytes. TmbMap.tsx chỉ tải + vẽ 1 lần lên canvas — KHÔNG chạy bất kỳ
 * pdf.js API nào cho profile này, cùng kiến trúc TĐNĐ1 (xem
 * tmb-map-static-background.ts cho cách marker pdfX/pdfY vẫn map đúng). */
export const TMB_HLX_VBM_STATIC_IMAGE_URL = '/tmb-poc/tmb-hlx-vbm1.webp';

/** Kích thước content-space (BASE_SCALE=1) của VBM1 — ĐÚNG kích thước trang
 * PDF gốc (page.view=[0,0,1600,1200], rotation=0 — SAME geometry đã verify
 * cho TĐNĐ1, cả 2 PDF HLX dùng chung khổ trang), giữ NGUYÊN hệ toạ độ pdfX/
 * pdfY hiện có (TMB_HLX_VBM_UNITS bên dưới, 5 mã đã audit trước đây — công
 * thức mapPdfPointToStaticImagePoint đã verify khớp CHÍNH XÁC pdf.js cho cả 5
 * điểm này, xem tests) — KHÔNG PHẢI kích thước pixel ảnh WebP (3200×2400). */
export const TMB_HLX_VBM_NATIVE_SIZE = { w: 1600, h: 1200 };

/**
 * 5 mã = TOÀN BỘ phân khu "VBM1" hiện có trong Bảng hàng nguồn "Vinhomes
 * Global Gate HLX" (sheet tab "DQ") — audit trực tiếp qua getStackingListRows()
 * với credentials thật (KHÔNG qua HTTP): 16 dòng trong tab DQ, đúng 5 dòng có
 * cột "PHÂN KHU" = "VBM1", KHÔNG có dòng VBM nào khác bị bỏ sót.
 *
 * Toạ độ trích xuất TRỰC TIẾP từ text layer PDF "VHGG Hạ Long_TMB Tiện ích&mã
 * căn VBM1.pdf" bằng pdfjs-dist (CÙNG phương pháp TMB_MAP_UNITS — page 1,
 * rotation=0, đơn vị PDF user-space KHÔNG xoay/scale): PDF có 1 trang, text
 * layer thật (không phải ảnh raster) — mã căn (pattern `BM<số>-<số>`) đọc
 * được sạch dù nhiều label tiếng Việt khác trên cùng trang bị lỗi font
 * encoding (không ảnh hưởng mã căn, chỉ ảnh hưởng nhãn khác không dùng ở đây).
 * Cả 5/5 mã đều match CHÍNH XÁC 1 LẦN DUY NHẤT trong toàn bộ ~2521 text run
 * dạng "BM..." tìm được trên trang (PDF phủ nguyên khu, không chỉ VBM1) —
 * không ambiguous, không cần chọn giữa nhiều vị trí trùng mã.
 */
export const TMB_HLX_VBM_UNITS: TmbMapUnit[] = [
  { unitCode: 'BM34-25', pdfX: 980.4717800000002, pdfY: 731.690335 },
  { unitCode: 'BM17-12', pdfX: 900.1126679000002, pdfY: 610.4550035000001 },
  { unitCode: 'BM6-13', pdfX: 1044.8478556, pdfY: 687.5826086 },
  { unitCode: 'BM54-03', pdfX: 1073.4441127000002, pdfY: 492.8106311 },
  { unitCode: 'BM57-28', pdfX: 975.3666729000005, pdfY: 433.41757970000003 },
];

const HLX_VBM_TMB_PROFILE: TmbMapProfile = {
  configId: TMB_HLX_VBM_CONFIG_ID,
  stackingConfigId: TMB_HLX_VBM_CONFIG_ID,
  label: 'Vinhomes Global Gate HLX · VBM1',
  units: TMB_HLX_VBM_UNITS,
  // STATIC-IMAGE architecture (thay pdf.js client-side) — xác nhận trên
  // production: VBM1 gây crash/reload trên CÙNG iPhone đã crash với TĐNĐ1
  // (page.render() không hoàn tất, xem comment TMB_HLX_VBM_PDF_URL). CÙNG
  // kiến trúc đã dùng cho TĐNĐ1, KHÔNG có đường render pdf.js thứ 2 nào còn
  // lại cho HLX — cả 2 phân khu giờ đều là ảnh tĩnh.
  staticBackgroundImageUrl: TMB_HLX_VBM_STATIC_IMAGE_URL,
  nativeSize: TMB_HLX_VBM_NATIVE_SIZE,
};

/** Identity ỔN ĐỊNH của CHÍNH profile TĐNĐ1 (KHÔNG PHẢI StackingConfig.id —
 * "Vinhomes Global Gate HLX" là 1 project DUY NHẤT có NHIỀU phân khu/map, xem
 * `TmbMapProfile.configId` vs `stackingConfigId`). Không dùng format "SC_..."
 * (dành riêng cho StackingConfig.id thật) để không bao giờ nhầm lẫn 2 loại id. */
export const TMB_HLX_TDND1_PROFILE_ID = 'tmb-static-hlx-tdnd1';

/** PDF authoritative gốc của TĐNĐ1 (derivative đã optimize, 10,238,869 bytes —
 * xem lịch sử đầy đủ trong git blame field này trước bản sửa hiện tại) — GIỮ
 * LẠI trên đĩa (public/tmb-poc/tmb-hlx-tdnd1.pdf) làm nguồn tham chiếu/để
 * rasterize lại nếu cần chất lượng khác sau này, nhưng KHÔNG CÒN được
 * TmbMap.tsx fetch/render ở production (xem TMB_HLX_TDND1_STATIC_IMAGE_URL +
 * comment HLX_TDND1_TMB_PROFILE bên dưới cho lý do đổi kiến trúc).
 * Không export field pdfUrl trong profile nữa vì đường pdf.js client-side đã
 * NGỪNG dùng cho TĐNĐ1 — giữ hằng số này chỉ để tham chiếu/tái sử dụng nếu
 * cần rasterize lại, KHÔNG gắn vào bất kỳ TmbMapProfile nào. */
export const TMB_HLX_TDND1_PDF_URL = '/tmb-poc/tmb-hlx-tdnd1.pdf';

/** Ảnh nền TĨNH của TĐNĐ1 — rasterize OFFLINE 1 LẦN bằng CHÍNH pdf.js (cùng
 * renderer TmbMap.tsx vẫn dùng cho profile khác, đảm bảo khớp thị giác) trên
 * TMB_HLX_TDND1_PDF_URL ở scale=2 (3200×2400px, gấp đôi trang gốc 1600×1200 —
 * đủ nét cho zoom thực tế, không phải chất lượng in ấn), export WebP q=0.72 —
 * 1,156,584 bytes thực đo trên đĩa (giảm ~89% so với PDF gốc 10,238,869
 * bytes). TmbMap.tsx chỉ tải + vẽ 1 lần lên canvas — KHÔNG getDocument/
 * getPage/render pdf.js, loại bỏ hoàn toàn rủi ro thực thi ~207,250 PDF
 * content-stream operator (70,426 showText) đã audit + xác nhận gây crash
 * thật trên iPhone production (?tmbdiag=1: log dừng đúng tại
 * page.render:start, không có page.render:complete/STABLE-OPEN-STATE-REACHED
 * sau đó) — xem tmb-map-static-background.ts cho cách marker pdfX/pdfY vẫn
 * map đúng toạ độ dù không còn pdf.js ở đường này.
 *
 * GRAY-WATER FIDELITY FIX (Sep 9 audit): asset đầu tiên (1,543,626 bytes)
 * rasterize từ public/tmb-poc/tmb-hlx-tdnd1.pdf lúc file đó VẪN mang lỗi đã
 * fix ở 80dc042 ("fix(tmb): preserve PDF image colorspace fidelity", Sep 6)
 * — file PDF derivative này được tạo (fef868b, Sep 5) TRƯỚC fix đó và
 * KHÔNG BAO GIỜ được optimize lại sau khi fix, nên vẫn giữ nguyên `/ColorSpace`
 * hỏng (`/#2FDeviceRGB`/`/#2FDeviceGray` do PDFName.of() double-encode dấu
 * "/") trên 2 image XObject nền (ref 199/200, 7757×5157) — pdf.js không
 * resolve được colorspace hỏng nên render ra màu xám/sai (hồ nước, vốn phải
 * xanh dương/xanh lá, thành xám). Fix: sửa TRỰC TIẾP 2 entry `/ColorSpace`
 * hỏng trong CHÍNH file PDF đã commit (chỉ đổi tên dict, KHÔNG đổi/re-encode
 * lại bytes ảnh JPEG — ít rủi ro nhất, không cần chạy lại toàn bộ pipeline
 * downsample) rồi rasterize lại — KHÔNG đổi cách rasterize/scale/quality. */
export const TMB_HLX_TDND1_STATIC_IMAGE_URL = '/tmb-poc/tmb-hlx-tdnd1.webp';

/** Kích thước content-space (BASE_SCALE=1) của TĐNĐ1 — ĐÚNG kích thước trang
 * PDF gốc (page.view=[0,0,1600,1200], rotation=0 — đã verify trực tiếp bằng
 * pdfjs-dist trước khi rasterize), giữ NGUYÊN hệ toạ độ pdfX/pdfY hiện có
 * (TMB_HLX_TDND1_UNITS bên dưới, dù hiện đang rỗng) — KHÔNG PHẢI kích thước
 * pixel thật của ảnh WebP (3200×2400, gấp đôi để nét hơn khi zoom). Tách 2
 * khái niệm này đúng triết lý content-space vs raster đã áp dụng xuyên suốt
 * TmbMap.tsx (canvasSize vs canvas.width/height). */
export const TMB_HLX_TDND1_NATIVE_SIZE = { w: 1600, h: 1200 };

/**
 * 12 mã = TOÀN BỘ mã căn TĐNĐ1 đã audit trực tiếp qua getStackingListRows()
 * với credentials thật (KHÔNG qua HTTP) tại thời điểm audit (tab "DQ", PHÂN
 * KHU bắt đầu bằng "TĐNĐ1" — gồm cả TĐNĐ1.1 lẫn TĐNĐ1.2) — CÙNG phương pháp
 * đã dùng cho TMB_HLX_VBM_UNITS/TMB_MAP_UNITS, dùng lại NGUYÊN pipeline
 * src/lib/tmb-indexer.ts (extractPdfUnitLabels + classifySheetInventoryWithAliases,
 * KHÔNG viết matcher riêng). Đây là spatial mapping TĨNH — KHÔNG mã hoá trạng
 * thái Còn hàng/Đã bán vào đây (kể cả NĐ11-60, tại thời điểm audit là "Đã
 * bán") — trạng thái LUÔN lookup SỐNG từ Bảng hàng lúc render (đúng nguyên
 * tắc PDF/mapping = spatial authority, Bảng hàng = business/status authority,
 * xem TmbMap.tsx đầu file). Bảng hàng thêm căn TĐNĐ1 mới sau audit này sẽ
 * KHÔNG tự có marker cho tới khi mapping được audit bổ sung thủ công (không
 * tạo hotspot cho mã không có toạ độ đã biết — cùng giới hạn v1 đã áp dụng
 * cho TMB_MAP_UNITS).
 *
 * Toạ độ trích xuất TRỰC TIẾP từ text layer PDF public/tmb-poc/tmb-hlx-tdnd1.pdf
 * (page 1, rotation=0, đơn vị PDF user-space KHÔNG xoay/scale — CÙNG hệ toạ
 * độ TMB_HLX_TDND1_NATIVE_SIZE/mapPdfPointToStaticImagePoint đã dùng cho nền
 * ảnh tĩnh) bằng pdfjs-dist qua glyphRemap (font CAD export lỗi ToUnicode —
 * mỗi mã hiện ra dạng ký tự điều khiển thay vì text đọc được, xem
 * tmb-optimizer.ts comment đầu file) + 2 alias rule profile-scoped:
 *
 *   TĐ<n>-<m> (mã kinh doanh, Bảng hàng) -> BM<n>-<m> (mã bản vẽ PDF)
 *   NĐ<n>-<m> (mã kinh doanh, Bảng hàng) -> NM<n>-<m> (mã bản vẽ PDF)
 *
 * Rule "NĐ → NM" xác nhận qua kiểm tra thị giác TRỰC TIẾP trên chính ảnh nền
 * TĐNĐ1 (public/tmb-poc/tmb-hlx-tdnd1.webp, đã rasterize từ CHÍNH file PDF
 * này) tại toạ độ đích của cả 4 mã NĐ — glyph "N" (mã glyph 49) là 1 gia
 * đình prefix hoàn toàn RIÊNG BIỆT với "B" (mã glyph 55, gia đình BM), KHÔNG
 * phải lỗi font/trùng lặp: cùng 1 phần số (VD "11-13") xuất hiện ĐỘC LẬP ở 2
 * vị trí vật lý khác nhau hẳn cho gia đình B và gia đình N — đã verify cả 2
 * gia đình KHÔNG collision toạ độ trên toàn bộ 12 mã (xem test).
 *
 * Cả 12/12 mã Bảng hàng hiện có đều MATCHED CHÍNH XÁC 1 LẦN DUY NHẤT (0
 * unmatched, 0 ambiguous) — double-stroke (label vẽ lặp lại, cùng vị trí
 * trong dung sai 1pt) đã tự loại bởi dedupePositions() trong tmb-indexer.ts,
 * KHÔNG cần xử lý thủ công. KHÔNG fuzzy match — số phải khớp CHÍNH XÁC.
 */
export const TMB_HLX_TDND1_UNITS: TmbMapUnit[] = [
  { unitCode: 'NĐ11-60', pdfX: 767.1511116999998, pdfY: 743.5426770999994 },
  { unitCode: 'NĐ11-62', pdfX: 764.5132529999998, pdfY: 744.5825319999996 },
  { unitCode: 'NĐ18-20', pdfX: 1013.067529699998, pdfY: 692.699447600003 },
  { unitCode: 'NĐ19-16', pdfX: 1027.7101925000004, pdfY: 676.7474558000005 },
  { unitCode: 'TĐ19-29', pdfX: 774.0906951000015, pdfY: 580.9916172000022 },
  { unitCode: 'TĐ15-13', pdfX: 696.2600339999995, pdfY: 690.8170223000008 },
  { unitCode: 'TĐ11-13', pdfX: 735.8339384999997, pdfY: 675.7560086000021 },
  { unitCode: 'TĐ55-11', pdfX: 394.3302935000005, pdfY: 499.7263245000001 },
  { unitCode: 'TĐ56-21', pdfX: 366.956706000004, pdfY: 508.42743300000325 },
  { unitCode: 'TĐ56-35', pdfX: 346.7393620000008, pdfY: 496.8061520000003 },
  { unitCode: 'TĐ55-09', pdfX: 399.7699305000003, pdfY: 502.7138575000001 },
  { unitCode: 'TĐ43-19', pdfX: 664.5468919999954, pdfY: 294.5763613999953 },
];

const HLX_TDND1_TMB_PROFILE: TmbMapProfile = {
  configId: TMB_HLX_TDND1_PROFILE_ID,
  stackingConfigId: TMB_HLX_VBM_CONFIG_ID,
  label: 'Vinhomes Global Gate HLX · TĐNĐ1',
  units: TMB_HLX_TDND1_UNITS,
  // STATIC-IMAGE architecture (thay pdf.js client-side) — TĐNĐ1 PDF có
  // 207,250 content-stream operator (70,426 showText, ~2.15x VBM1's 96,498)
  // dù cùng kích thước trang (1600×1200) + cùng font gốc — đã audit + xác
  // nhận GÂY CRASH THẬT trên iPhone production (?tmbdiag=1: log dừng đúng
  // tại page.render:start, browser/tab bị kill/reload trước
  // page.render:complete). Một mitigation trước đó (deviceMemory + operator-
  // count runtime gate, xem git history field knownOperatorCount) KHÔNG giải
  // quyết được case iPhone thật — thay bằng kiến trúc đơn giản hơn: rasterize
  // OFFLINE 1 LẦN thành ảnh WebP tĩnh (xem TMB_HLX_TDND1_STATIC_IMAGE_URL),
  // TmbMap.tsx không còn chạy BẤT KỲ pdf.js API nào (không getDocument/
  // getPage/getOperatorList/render) cho profile này — mobile chỉ tải 1 ảnh
  // tĩnh ~1.5MB, KHÔNG BAO GIỜ thực thi operator list nặng nói trên.
  staticBackgroundImageUrl: TMB_HLX_TDND1_STATIC_IMAGE_URL,
  nativeSize: TMB_HLX_TDND1_NATIVE_SIZE,
};

/** Registry — thêm profile mới ở đây khi mở thêm dự án/phân khu (sau khi đã
 * audit PDF thật + verify từng mã căn, xem comment 2 profile trên). 1 project
 * (stackingConfigId) CÓ THỂ xuất hiện NHIỀU LẦN trong mảng này (nhiều phân
 * khu, VD HLX_VBM_TMB_PROFILE + HLX_TDND1_TMB_PROFILE CÙNG stackingConfigId
 * nhưng configId RIÊNG) — resolveTmbMapProfiles trả về TẤT CẢ, KHÔNG PHẢI 1. */
const TMB_MAP_PROFILES: readonly TmbMapProfile[] = [SAIGON_PARK_TMB_PROFILE, HLX_VBM_TMB_PROFILE, HLX_TDND1_TMB_PROFILE];

/** Resolve TẤT CẢ profile tĩnh thuộc 1 project (theo stackingConfigId, ổn
 * định) — mảng RỖNG (KHÔNG phải fallback/suy đoán) nếu project chưa có TMB
 * tĩnh nào. Đây là authority DUY NHẤT quyết định "project X có (những) map
 * tĩnh nào" — page.tsx merge kết quả này với dbTmbProfiles (DB-managed), KHÔNG
 * BAO GIỜ chọn theo vị trí mảng/state cũ/project khác. */
export function resolveTmbMapProfiles(config: { id: string } | null | undefined): TmbMapProfile[] {
  if (!config) return [];
  return TMB_MAP_PROFILES.filter(p => p.stackingConfigId === config.id);
}

/** Resolve 1 profile "chính" (đầu tiên khai báo trong registry) theo project —
 * null nếu chưa có profile tĩnh nào. Giữ lại cho các call site CHỈ cần biết
 * "project này CÓ TMB tĩnh không" (VD isTmbAvailableForConfig) — với project
 * nhiều phân khu (VD HLX), dùng resolveTmbMapProfiles (số nhiều) để lấy ĐỦ. */
export function resolveTmbMapProfile(config: { id: string } | null | undefined): TmbMapProfile | null {
  return resolveTmbMapProfiles(config)[0] ?? null;
}

/** TMB chỉ hiện cho nguồn ĐÃ CÓ profile (đã audit spatial mapping) — so theo
 * config.id (ổn định), KHÔNG so theo sheet_id (mutable, xem TMB_MAP_CONFIG_ID).
 * Tách hàm riêng để 3 nơi gọi (nút mở TMB, margin layout, mount TmbMap) luôn
 * dùng CHUNG 1 điều kiện, không lệch nhau. */
export function isTmbAvailableForConfig(config: { id: string } | null | undefined): boolean {
  return resolveTmbMapProfiles(config).length > 0;
}

/** Rút gọn `TmbMapProfile.label` để hiển thị ở nơi cần gọn (dropdown chọn TMB
 * khi >1 profile, title toolbar TmbMap) — KHÔNG hard-code theo tên dự án cụ
 * thể nào (VBM1/TĐNĐ1...), suy ra THUẦN TUÝ từ format label sẵn có: mọi label
 * hiện tại (tĩnh lẫn admin-managed, xem SAIGON_PARK/HLX_VBM_TMB_PROFILE ở trên
 * + dbProfileToTmbMapProfile trong tmb-map-registry.ts) đều đặt phần phân biệt
 * dự án ("VBM1", "TĐNĐ1"...) SAU dấu " · " cuối cùng nếu có. Không có " · "
 * (VD "Vinhomes Sài Gòn Park", dự án single-profile) -> trả nguyên label, vì
 * không có phần nào để rút gọn mà không mất thông tin. */
export function tmbShortLabel(label: string): string {
  const idx = label.lastIndexOf(' · ');
  return idx === -1 ? label : label.slice(idx + 3);
}
