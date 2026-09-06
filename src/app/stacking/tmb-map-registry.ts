/** TMB Manager — cầu nối giữa registry TĨNH (tmb-map-data.ts, KHÔNG đổi) và
 * profile ADMIN-MANAGED lưu Postgres (TmbMapProfile/TmbUnitMapping). Mục
 * tiêu: 1 project có thể có 0..N map (Section 10), TmbMap.tsx (renderer)
 * KHÔNG cần biết profile đến từ đâu — CHỈ nhận đúng shape `TmbMapProfile` đã
 * có sẵn (configId/label/pdfUrl/pdfPageNumber/units), xem tmb-map-data.ts.
 *
 * KHÔNG migrate 2 profile tĩnh (Saigon Park, HLX VBM1) vào DB — giữ nguyên
 * để zero rủi ro regression (Section 12 cho phép migrate "chỉ nếu an toàn",
 * ở đây chọn KHÔNG migrate vì không cần thiết cho mục tiêu hiện tại). Hook
 * này CHỈ cộng thêm profile DB-managed (status ACTIVE) vào danh sách.
 */
import { useEffect, useState } from 'react';
import type { TmbMapProfile, TmbMapUnit } from './tmb-map-data';

export interface TmbDbProfileRow {
  id: string;
  stacking_config_id: string;
  label: string;
  subdivision: string | null;
  web_asset_ref: string | null;
  page_number: number;
  status: string;
}
export interface TmbDbUnitMapping {
  unit_code: string;
  x: number;
  y: number;
}

function resolveWebAssetUrl(ref: string): string {
  // path public/ (đã commit git, dùng cho production khi chưa có object
  // storage thật) bắt đầu bằng "/" -> dùng thẳng; ngược lại là storage-ref,
  // qua route serve riêng (xem tmb-storage.ts + api/stacking/tmb-assets).
  return ref.startsWith('/') ? ref : `/api/stacking/tmb-assets/${encodeURIComponent(ref)}`;
}

/** `configId` ở đây dùng DB profile `id` (KHÔNG phải StackingConfig.id) —
 * TmbMap.tsx CHỈ dùng field này làm key phụ thuộc của effect (re-fetch/render
 * khi đổi profile), không dùng để resolve gì khác (xem TmbMap.tsx:336) nên an
 * toàn khi tái sử dụng làm định danh DUY NHẤT của map profile này.
 *
 * EXPORTED (TMB Review Preview — Admin xem trước 1 profile READY_FOR_REVIEW
 * trước khi Kích hoạt, xem TmbManagerPanel.tsx "Xem TMB"): cùng converter DUY
 * NHẤT dùng cho CẢ runtime ACTIVE-only registry (useDbTmbMapProfiles bên
 * dưới) lẫn preview Admin — không viết converter thứ 2. Preview gọi hàm này
 * TRỰC TIẾP với đúng 1 profile Admin vừa chọn (KHÔNG qua useDbTmbMapProfiles,
 * hook đó CỐ Ý lọc status==='ACTIVE' — xem comment hook, KHÔNG nới lỏng điều
 * kiện đó cho mục đích preview). `mappings` rỗng vẫn hợp lệ (trả về
 * `units: []`) — TmbMap.tsx render nền PDF bình thường dù không có marker
 * nào, đúng yêu cầu "visual fidelity review phải hoạt động dù mapped = 0". */
export function dbProfileToTmbMapProfile(row: TmbDbProfileRow, mappings: TmbDbUnitMapping[]): TmbMapProfile | null {
  if (!row.web_asset_ref) return null; // chưa optimize xong -> chưa có gì render được
  const units: TmbMapUnit[] = mappings.map(m => ({ unitCode: m.unit_code, pdfX: m.x, pdfY: m.y }));
  return {
    configId: row.id,
    label: row.subdivision ? `${row.label} · ${row.subdivision}` : row.label,
    pdfUrl: resolveWebAssetUrl(row.web_asset_ref),
    pdfPageNumber: row.page_number,
    units,
  };
}

/** Danh sách profile DB-managed đang ACTIVE cho 1 StackingConfig — rỗng nếu
 * chưa Admin nào Kích hoạt map nào cho project này (KHÔNG lỗi, KHÔNG giả vờ
 * generic). Non-admin chỉ nhận ACTIVE (đã enforce server-side ở API route,
 * hook này không lặp lại kiểm tra quyền). */
export function useDbTmbMapProfiles(stackingConfigId: string | undefined | null): TmbMapProfile[] {
  const [profiles, setProfiles] = useState<TmbMapProfile[]>([]);

  useEffect(() => {
    if (!stackingConfigId) { setProfiles([]); return; }
    let cancelled = false;

    (async () => {
      try {
        const listRes = await fetch(`/api/stacking/tmb-profiles?stacking_config_id=${encodeURIComponent(stackingConfigId)}`).then(r => r.json());
        if (cancelled || !listRes.success) return;
        const activeRows = (listRes.data as TmbDbProfileRow[]).filter(p => p.status === 'ACTIVE');
        if (activeRows.length === 0) { setProfiles([]); return; }

        const detailed = await Promise.all(activeRows.map(async row => {
          const detailRes = await fetch(`/api/stacking/tmb-profiles/${row.id}`).then(r => r.json());
          if (!detailRes.success) return null;
          return dbProfileToTmbMapProfile(detailRes.data.profile, detailRes.data.mappings);
        }));
        if (!cancelled) setProfiles(detailed.filter((p): p is TmbMapProfile => p !== null));
      } catch {
        if (!cancelled) setProfiles([]);
      }
    })();

    return () => { cancelled = true; };
  }, [stackingConfigId]);

  return profiles;
}
