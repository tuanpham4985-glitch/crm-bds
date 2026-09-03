import type { StackingListRow } from '@/lib/types';
import { effectiveDotStatus } from '@/lib/stacking-list';

/** Tổng mặt bằng (TMB) — unitCode (từ spatial map) -> Bảng hàng row matching
 * + trạng thái "Còn hàng" (available-only display). Toàn bộ authority trạng
 * thái reuse NGUYÊN VẸN effectiveDotStatus (stacking-list.ts) — chính công
 * thức đang quyết định chấm màu + số đếm trên bảng chính hiện tại (marker
 * "Đã bán" từ Sheet ưu tiên hơn CRM Pipeline nếu Pipeline chưa cập nhật).
 * KHÔNG tạo công thức trạng thái thứ hai riêng cho TMB. */

/** Normalize AN TOÀN — chỉ trim + uppercase + gộp khoảng trắng thừa. Không
 * fuzzy-match, không đoán căn gần giống, không bỏ dấu/ký tự. */
export function normalizeUnitCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

/** Index Bảng hàng hiện có theo maCan đã normalize — > 1 row cùng khoá =
 * ambiguous (Sheet có 2 dòng trùng mã căn), không tự ý chọn đại 1 dòng. */
export function buildMaCanIndex(rows: readonly StackingListRow[]): Map<string, StackingListRow[]> {
  const idx = new Map<string, StackingListRow[]>();
  for (const r of rows) {
    const key = normalizeUnitCode(r.maCan);
    const bucket = idx.get(key);
    if (bucket) bucket.push(r);
    else idx.set(key, [r]);
  }
  return idx;
}

export type TmbMatchResult =
  | { kind: 'matched'; row: StackingListRow }
  | { kind: 'unmatched' }
  | { kind: 'ambiguous'; count: number };

export function matchTmbUnitCode(unitCode: string, index: ReadonlyMap<string, StackingListRow[]>): TmbMatchResult {
  const rows = index.get(normalizeUnitCode(unitCode)) ?? [];
  if (rows.length === 0) return { kind: 'unmatched' };
  if (rows.length > 1) return { kind: 'ambiguous', count: rows.length };
  return { kind: 'matched', row: rows[0] };
}

export interface TmbUnitState {
  unitCode: string;
  match: TmbMatchResult;
  /** matched && effectiveDotStatus(row) === 'con_hang' — điều kiện DUY NHẤT
   * để marker active/clickable trên TMB. */
  available: boolean;
}

export function resolveTmbUnitState(unitCode: string, index: ReadonlyMap<string, StackingListRow[]>): TmbUnitState {
  const match = matchTmbUnitCode(unitCode, index);
  const available = match.kind === 'matched' && effectiveDotStatus(match.row) === 'con_hang';
  return { unitCode, match, available };
}

export interface TmbInventorySummary {
  total: number;
  matched: number;
  available: number;
  otherStatus: number;
  unmatched: number;
  ambiguous: number;
}

/** Số liệu tổng quan — derive HOÀN TOÀN từ trạng thái đã resolve (runtime
 * data), không hard-code danh sách/con số căn nào. Đổi listRows/status ở
 * Bảng hàng thì số này tự đổi theo, không cần sửa spatial map. */
export function summarizeTmbInventory(states: readonly TmbUnitState[]): TmbInventorySummary {
  let matched = 0, available = 0, otherStatus = 0, unmatched = 0, ambiguous = 0;
  for (const s of states) {
    if (s.match.kind === 'matched') {
      matched++;
      if (s.available) available++;
      else otherStatus++;
    } else if (s.match.kind === 'unmatched') {
      unmatched++;
    } else {
      ambiguous++;
    }
  }
  return { total: states.length, matched, available, otherStatus, unmatched, ambiguous };
}
