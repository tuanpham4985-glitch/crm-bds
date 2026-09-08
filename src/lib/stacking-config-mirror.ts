/** PROPOSED — audit STACKING_CONFIG_QUOTA_INDEPENDENCE. Postgres READ MIRROR
 * cho StackingConfig ("nguồn"/dự án Bảng hàng) — loại bỏ live Google Sheets
 * read khỏi critical path GET /api/stacking/configs (root cause: Sheets
 * "Read requests per minute per user" 429 khiến /stacking không tải được cả
 * danh sách nguồn, xem Final Report).
 *
 * AUTHORITY: Google Sheets (getStackingConfigs/add/update/deleteStackingConfig
 * trong google-sheets.ts) VẪN LÀ WRITE AUTHORITY DUY NHẤT. Module này THUẦN
 * TUÝ là 1 Postgres CRUD wrapper — KHÔNG tự quyết định KHI NÀO được gọi (gate
 * theo feature flag 'stacking' — xem src/lib/db/feature-flags.ts — nằm ở
 * src/lib/data-access.ts, nơi DUY NHẤT gọi các hàm ở đây), giống ĐÚNG pattern
 * postgresql/*.repo.ts hiện có (repo class không tự biết flag, factory ở
 * repository/index.ts mới quyết định). CHỈ 1 write path duy nhất được phép
 * gọi các hàm write ở đây: data-access.ts, NGAY SAU KHI Sheets write đã
 * THÀNH CÔNG — không nơi nào khác được ghi bảng này trực tiếp, tránh 2 nguồn
 * ghi độc lập gây phân kỳ không kiểm soát được.
 *
 * NOTE ⚠️ Prisma model `StackingConfig` (schema.prisma) hiện là PROPOSED —
 * migration prisma/migrations/20260908103342_add_stacking_config/migration.sql
 * CHƯA được apply lên database nào (chỉ đã chạy `prisma generate` — codegen
 * thuần cục bộ, không cần kết nối DB — để type-check sạch). Mọi hàm dưới đây
 * sẽ THẬT SỰ throw (bảng "stacking_config" chưa tồn tại) nếu gọi trước khi
 * migration được duyệt + apply — nhưng vì gate 'stacking' mặc định TẮT (rỗng
 * trong PG_ENABLED_MODULES/SHADOW_WRITE_MODULES), các hàm này KHÔNG được gọi
 * trong runtime hiện tại, an toàn deploy trước khi migration chạy. */

import { prisma } from './db/client';
import { Prisma } from '../generated/prisma/client';
import type { StackingConfig } from './types';

type PgStackingConfig = Awaited<ReturnType<typeof prisma.stackingConfig.findFirst>>;

// Prisma yêu cầu sentinel Prisma.JsonNull (KHÔNG PHẢI `null` JS thuần) khi
// muốn ghi giá trị JSON NULL thật sự vào cột Json? — `null` JS trần bị TypeScript
// từ chối (ngữ nghĩa khác nhau giữa "không set field" vs "set = SQL NULL").
function toJsonInput(columns: string[] | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return columns && columns.length > 0 ? columns : Prisma.JsonNull;
}

// Exported thuần cho test (round-trip fidelity, pure function — không chạm
// Prisma/DB) — pattern giống fromKhachHang trong postgresql/customer.repo.ts.
export function toStackingConfig(row: NonNullable<PgStackingConfig>): StackingConfig {
  const visibleColumns = Array.isArray(row.visible_columns)
    ? row.visible_columns.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    id: row.id,
    ten_hien_thi: row.ten_hien_thi,
    sheet_id: row.sheet_id,
    project_code: row.project_code ?? undefined,
    trang_thai: row.trang_thai === 'inactive' ? 'inactive' : 'active',
    ngay_tao: row.ngay_tao,
    loai: row.loai === 'list' ? 'list' : 'grid',
    sheet_tab: row.sheet_tab ?? undefined,
    visible_columns: visibleColumns,
  };
}

/** Đọc TOÀN BỘ mirror — thứ tự theo created_at (tương đương thứ tự dòng tự
 * nhiên của Sheets, KHÔNG phải id/tên) để giữ đúng UX dropdown hiện có
 * (Sheets trả về theo thứ tự dòng, không sort lại). */
export async function readStackingConfigMirror(): Promise<StackingConfig[]> {
  const rows = await prisma.stackingConfig.findMany({ orderBy: { created_at: 'asc' } });
  return rows.map(toStackingConfig);
}

/** Upsert 1 row — dùng CHUNG cho cả add (row chưa tồn tại) lẫn update (row đã
 * có) theo ĐÚNG id đã sinh từ Sheets (KHÔNG BAO GIỜ tự sinh id khác — nhiều
 * nơi hard-code id cụ thể, xem TMB_MAP_CONFIG_ID/TMB_HLX_VBM_CONFIG_ID trong
 * tmb-map-data.ts, phải khớp tuyệt đối giữa Sheets và mirror). */
export async function upsertStackingConfigMirror(config: StackingConfig): Promise<void> {
  const data = {
    ten_hien_thi: config.ten_hien_thi,
    sheet_id: config.sheet_id,
    project_code: config.project_code || null,
    trang_thai: config.trang_thai,
    ngay_tao: config.ngay_tao,
    loai: config.loai ?? 'grid',
    sheet_tab: config.sheet_tab || null,
    visible_columns: toJsonInput(config.visible_columns),
  };
  await prisma.stackingConfig.upsert({
    where: { id: config.id },
    create: { id: config.id, ...data },
    update: data,
  });
}

/** Xoá 1 row theo id — im lặng no-op nếu id không tồn tại trong mirror (VD
 * mirror chưa từng sync row này vì lỗi trước đó — không throw, xoá cái không
 * có coi như đã đạt trạng thái mong muốn). */
export async function deleteStackingConfigMirror(id: string): Promise<void> {
  await prisma.stackingConfig.deleteMany({ where: { id } });
}

/** Resync TOÀN BỘ mirror từ 1 danh sách Sheets đã đọc sẵn (caller tự đọc
 * Sheets — module này KHÔNG tự gọi Sheets, giữ đúng ranh giới "1 write path
 * duy nhất qua data-access.ts"). Dùng cho reconciliation THỦ CÔNG (script/
 * route admin-trigger riêng, KHÔNG tự động, KHÔNG nằm trong critical path đọc)
 * khi nghi ngờ mirror lệch khỏi Sheets (VD sau 1 lần mirror sync lỗi đã log).
 * Xoá sạch rồi ghi lại từ đầu trong 1 transaction — tránh trạng thái nửa cũ
 * nửa mới nếu resync bị ngắt giữa chừng. */
export async function resyncStackingConfigMirror(configs: StackingConfig[]): Promise<void> {
  // created_at PHẢI set TƯỜNG MINH theo thứ tự mảng (KHÔNG dựa vào
  // @default(now()) của schema) — Postgres now() trả về CÙNG 1 giá trị cho
  // MỌI statement trong 1 transaction, nên nếu để default, mọi row resync sẽ
  // có created_at GIỐNG HỆT nhau -> readStackingConfigMirror() (ORDER BY
  // created_at ASC) tie-break KHÔNG xác định, có thể đảo thứ tự dropdown so
  // với thứ tự dòng thật của Sheets. +index*1ms đảm bảo thứ tự ổn định tuyệt
  // đối, khớp ĐÚNG thứ tự mảng `configs` (đã là thứ tự Sheets tự nhiên).
  const baseTime = Date.now();
  await prisma.$transaction([
    prisma.stackingConfig.deleteMany({}),
    ...configs.map((config, index) => {
      const data = {
        ten_hien_thi: config.ten_hien_thi,
        sheet_id: config.sheet_id,
        project_code: config.project_code || null,
        trang_thai: config.trang_thai,
        ngay_tao: config.ngay_tao,
        loai: config.loai ?? 'grid',
        sheet_tab: config.sheet_tab || null,
        visible_columns: toJsonInput(config.visible_columns),
        created_at: new Date(baseTime + index),
      };
      return prisma.stackingConfig.create({ data: { id: config.id, ...data } });
    }),
  ]);
}
