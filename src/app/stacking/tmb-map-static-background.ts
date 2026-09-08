/** Toạ độ pdfX/pdfY (PDF user-space, cùng hệ đã dùng cho TMB_MAP_UNITS/
 * TMB_HLX_*_UNITS hiện có) -> viewport point (BASE_SCALE=1, content-space cho
 * canvasSize/marker) — dùng CHO PROFILE STATIC-IMAGE (TmbMapProfile.
 * staticBackgroundImageUrl, xem tmb-map-data.ts) — TmbMap.tsx KHÔNG chạy
 * pdf.js client-side cho các profile này (KHÔNG getDocument/getPage/render,
 * loại bỏ hoàn toàn rủi ro thực thi operator list nặng gây crash mobile —
 * xem lịch sử: TĐNĐ1 ~207K operator, đã audit + xác nhận crash thật trên
 * iPhone qua ?tmbdiag=1), nên không còn `page.getViewport().
 * convertToViewportPoint()` để dùng — hàm này THAY THẾ đúng phép biến đổi đó
 * bằng 1 công thức thuần, đã verify khớp TUYỆT ĐỐI với pdf.js.
 *
 * CHỈ ĐÚNG cho trang PDF KHÔNG XOAY (rotation=0) VÀ mediabox origin (0,0) —
 * đã verify TRỰC TIẾP bằng pdfjs-dist trên CHÍNH file nguồn TĐNĐ1 trước khi
 * rasterize offline (page.rotate=0, page.view=[0,0,1600,1200], transform=
 * [1,0,0,-1,0,1200] — tương đương viewX=pdfX, viewY=1200-pdfY, đã kiểm tra
 * khớp pdf.js.convertToViewportPoint tại 5 điểm mẫu bao gồm cả 4 góc trang).
 * Công thức dưới đây CHỈ = Y-flip đơn giản vì đã verify CỤ THỂ cho trường hợp
 * này — KHÔNG PHẢI công thức pdf.js tổng quát cho MỌI rotation/mediabox. Nếu
 * sau này thêm profile static-image khác với trang PDF XOAY hoặc mediabox
 * lệch gốc, PHẢI audit lại transform thật bằng pdfjs-dist (như đã làm ở đây)
 * trước khi tái sử dụng hàm này — KHÔNG giả định công thức này đúng chung. */
export function mapPdfPointToStaticImagePoint(
  pdfX: number, pdfY: number, nativeHeight: number
): { viewX: number; viewY: number } {
  return { viewX: pdfX, viewY: nativeHeight - pdfY };
}
