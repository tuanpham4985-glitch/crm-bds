/** Formatter dùng chung cho module Bảng hàng (Grid mode, List mode popup,
 * Tổng mặt bằng preview) — tách khỏi page.tsx vì Next.js App Router chỉ cho
 * page.tsx export các route convention export (default/generateMetadata/...),
 * không cho export hàm tuỳ ý. */
export function fmtGia(gia: number) { return gia ? (gia / 1e9).toFixed(3).replace(/\.?0+$/, '') : '—'; }
export function fmtArea(area: number) { return area ? area.toFixed(1) + ' m²' : '—'; }
export function fmtGiaFull(gia: number) { return gia ? gia.toLocaleString('vi-VN') + ' đ' : '—'; }
