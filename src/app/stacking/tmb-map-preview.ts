import type { StackingListRow } from '@/lib/types';
import { isPriceColumn } from '@/lib/stacking-list';

/** Chọn field compact preview (Giá/Diện tích/Loại hình/Hướng) khi hover/focus
 * 1 căn Còn hàng trên Tổng mặt bằng. Không tạo query mới — chỉ đọc lại
 * `row.values` (đã có sẵn từ listRows). Reuse `isPriceColumn` (stacking-list.ts,
 * cùng logic tách cột Giá đang dùng cho bảng chính) thay vì viết lại. */

function normHeader(h: string): string {
  return h.trim().toLowerCase();
}

function findColumn(row: StackingListRow, matcher: (norm: string) => boolean): string | undefined {
  return Object.keys(row.values).find(col => matcher(normHeader(col)));
}

export interface TmbPreviewData {
  maCan: string;
  giaValue: number | null;
  /** header gốc của cột diện tích tìm được, VD "DT Đất (m2)" — null nếu
   * nguồn này không có cột diện tích nào khớp. */
  areaLabel: string | null;
  areaValue: number | null;
  loaiHinh: string | null;
  huong: string | null;
}

export function buildTmbPreview(row: StackingListRow): TmbPreviewData {
  const giaCol = findColumn(row, isPriceColumn);
  const areaCol = findColumn(row, n => n.startsWith('dt') || n.includes('diện tích'));
  const loaiHinhCol = findColumn(row, n => n === 'loại hình' || n === 'loại căn');
  const huongCol = findColumn(row, n => n === 'hướng');

  const giaRaw = giaCol ? row.values[giaCol] : null;
  const areaRaw = areaCol ? row.values[areaCol] : null;
  const loaiHinhRaw = loaiHinhCol ? row.values[loaiHinhCol] : null;
  const huongRaw = huongCol ? row.values[huongCol] : null;

  return {
    maCan: row.maCan,
    giaValue: typeof giaRaw === 'number' ? giaRaw : null,
    areaLabel: areaCol ?? null,
    areaValue: typeof areaRaw === 'number' ? areaRaw : null,
    loaiHinh: typeof loaiHinhRaw === 'string' && loaiHinhRaw ? loaiHinhRaw : null,
    huong: typeof huongRaw === 'string' && huongRaw ? huongRaw : null,
  };
}
