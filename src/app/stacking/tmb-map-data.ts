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
  pdfUrl: string;
  pdfPageNumber: number;
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

export const TMB_HLX_VBM_PDF_URL = '/tmb-poc/tmb-hlx-vbm1.pdf';

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
  pdfUrl: TMB_HLX_VBM_PDF_URL,
  pdfPageNumber: 1,
  units: TMB_HLX_VBM_UNITS,
};

/** Identity ỔN ĐỊNH của CHÍNH profile TĐNĐ1 (KHÔNG PHẢI StackingConfig.id —
 * "Vinhomes Global Gate HLX" là 1 project DUY NHẤT có NHIỀU phân khu/map, xem
 * `TmbMapProfile.configId` vs `stackingConfigId`). Không dùng format "SC_..."
 * (dành riêng cho StackingConfig.id thật) để không bao giờ nhầm lẫn 2 loại id. */
export const TMB_HLX_TDND1_PROFILE_ID = 'tmb-static-hlx-tdnd1';

/** Asset TĐNĐ1 SERVE STATIC — audit chọn (HLX_STATIC_TMB, xem Final Report):
 * cùng pattern Saigon Park/VBM1 (file public/ commit sẵn vào git, serve trực
 * tiếp, KHÔNG qua route proxy/object storage) thay vì DB-managed profile cũ
 * (Vercel Blob Private + buffer toàn bộ trong serverless function) — ổn định
 * hơn trên mobile (không cold-start Vercel function + Prisma + Blob fetch có
 * xác thực trước khi byte đầu tiên tới client) VÀ khớp đúng yêu cầu "TMB static
 * ổn định tương tự Saigon Park".
 *
 * File này là derivative ĐÃ TẠO SẴN từ commit fef868b ("feat(stacking): add
 * optimized TĐNĐ1 web asset for HLX TMB Manager fixture", 2026-09-05) —
 * downsampled/re-encoded từ PDF authoritative gốc "VHGG Hạ Long_TMB Tiện
 * ích&mã căn TĐNĐ1(1).pdf" (206.6MB, page 1, 1600×1200pt) bằng optimizer sẵn
 * có (src/lib/tmb-optimizer.ts) — giảm 95.3% dung lượng (206.6MB -> 9.76MB,
 * 10,238,869 bytes thực đo trên disk), text layer (mã căn) đã verify BYTE-
 * IDENTICAL trước/sau optimize (quality gate của chính optimizer, xem
 * tmb-optimizer.test.ts) — KHÔNG crop/move/redraw nội dung, KHÔNG sửa mã căn,
 * KHÔNG OCR/reconstruct, giữ nguyên toàn bộ extent + aspect ratio trang gốc.
 * File PDF authoritative gốc KHÔNG bị overwrite/mutate — optimizer luôn ĐỌC
 * nguồn, GHI derivative riêng, KHÔNG BAO GIỜ ghi đè ngược lại. */
export const TMB_HLX_TDND1_PDF_URL = '/tmb-poc/tmb-hlx-tdnd1.pdf';

/** CHƯA CÓ toạ độ marker/unit mapping authoritative cho TĐNĐ1 — DB-managed
 * profile cũ (nếu còn) giữ unit_mappings riêng trong Postgres, KHÔNG mang
 * theo được sang registry tĩnh này (không có quyền truy cập production DB từ
 * audit này để trích xuất, xem HLX_STATIC_TMB Final Report). ĐÃ CỐ TÌNH để
 * rỗng thay vì suy đoán/tự tạo toạ độ — TmbMap.tsx render nền PDF bình thường
 * dù `units: []` (đã verify hành vi này qua dbProfileToTmbMapProfile, xem
 * tmb-map-registry.ts). Đây là gap CÓ CHỦ ĐÍCH, tách biệt hoàn toàn khỏi việc
 * fix nền TMB (background rendering) — bổ sung mapping unit là 1 audit/task
 * RIÊNG (cần lại quyền truy cập DB hoặc audit PDF trực tiếp bằng pdfjs-dist,
 * CÙNG phương pháp đã dùng cho TMB_HLX_VBM_UNITS/TMB_MAP_UNITS). */
export const TMB_HLX_TDND1_UNITS: TmbMapUnit[] = [];

const HLX_TDND1_TMB_PROFILE: TmbMapProfile = {
  configId: TMB_HLX_TDND1_PROFILE_ID,
  stackingConfigId: TMB_HLX_VBM_CONFIG_ID,
  label: 'Vinhomes Global Gate HLX · TĐNĐ1',
  pdfUrl: TMB_HLX_TDND1_PDF_URL,
  pdfPageNumber: 1,
  units: TMB_HLX_TDND1_UNITS,
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
