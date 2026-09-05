/** TMB Manager — repository cho TmbMapProfile/TmbUnitMapping (Postgres, xem
 * prisma/schema.prisma). Dùng chung 1 Prisma client singleton (`src/lib/db/client.ts`)
 * như phần còn lại của app, KHÔNG tự tạo PrismaClient riêng.
 *
 * QUYẾT ĐỊNH THIẾT KẾ: bảng KHÔNG lưu cache kết quả "Phân tích"/"Quét mã căn"
 * (image list, text item count, matched/ambiguous/unmatched...) — những kết
 * quả này tính LẠI on-demand mỗi lần Admin mở review (xem tmb-optimizer.ts,
 * tmb-indexer.ts, đều đủ nhanh: ~1-2s cho file 200MB thật đã đo). Bảng chỉ
 * lưu STATE bền: identity, asset ref, dimensions đã biết, status, mapping đã
 * chốt. Tránh cache-staleness (đổi Bảng hàng sống thì lần review sau tự thấy
 * số mới, không cần nút "làm mới cache" riêng) và tránh phải thêm cột/migration
 * cho từng loại dữ liệu phái sinh.
 */
import { prisma } from '@/lib/db/client';
import type { Prisma } from '../generated/prisma/client';

export type TmbSourceType = 'PDF' | 'IMAGE';
export type TmbMapProfileStatus = 'DRAFT' | 'ANALYZED' | 'READY_FOR_REVIEW' | 'ACTIVE' | 'ERROR';
export type TmbMappingSource = 'AUTO_TEXT' | 'MANUAL';

export interface CreateTmbMapProfileInput {
  stacking_config_id: string;
  label: string;
  subdivision?: string | null;
  source_type?: TmbSourceType;
  master_asset_ref: string;
  page_number?: number;
  unit_code_field?: string | null;
  glyph_remap?: Record<string, string> | null;
}

export interface UpdateTmbMapProfileInput {
  label?: string;
  subdivision?: string | null;
  unit_code_field?: string | null;
  glyph_remap?: Record<string, string> | null;
  status?: TmbMapProfileStatus;
  error_message?: string | null;
  master_asset_ref?: string;
  web_asset_ref?: string | null;
  page_number?: number;
  page_width?: number | null;
  page_height?: number | null;
  rotation?: number;
  master_size_bytes?: number | null;
  web_size_bytes?: number | null;
}

export async function listTmbMapProfiles(stackingConfigId?: string) {
  return prisma.tmbMapProfile.findMany({
    where: stackingConfigId ? { stacking_config_id: stackingConfigId } : undefined,
    orderBy: { created_at: 'asc' },
  });
}

export async function getTmbMapProfile(id: string) {
  return prisma.tmbMapProfile.findUnique({ where: { id } });
}

export async function createTmbMapProfile(input: CreateTmbMapProfileInput) {
  return prisma.tmbMapProfile.create({
    data: {
      stacking_config_id: input.stacking_config_id,
      label: input.label,
      subdivision: input.subdivision ?? null,
      source_type: input.source_type ?? 'PDF',
      master_asset_ref: input.master_asset_ref,
      page_number: input.page_number ?? 1,
      unit_code_field: input.unit_code_field ?? null,
      glyph_remap: input.glyph_remap ?? undefined,
      status: 'DRAFT',
    },
  });
}

export async function updateTmbMapProfile(id: string, patch: UpdateTmbMapProfileInput) {
  return prisma.tmbMapProfile.update({
    where: { id },
    data: {
      ...patch,
      glyph_remap: patch.glyph_remap === undefined ? undefined : (patch.glyph_remap ?? undefined),
    },
  });
}

/** Xoá map profile — chỉ xoá bản ghi profile + mapping của NÓ (cascade DB),
 * KHÔNG bao giờ động tới Bảng hàng/Google Sheet hay dữ liệu CRM khác (Section
 * 15 "Deletion safety"). Asset vật lý (PDF) dọn riêng ở route (best-effort,
 * không chặn việc xoá record nếu dọn file lỗi). */
export async function deleteTmbMapProfile(id: string) {
  return prisma.tmbMapProfile.delete({ where: { id } });
}

export async function listTmbUnitMappings(mapProfileId: string) {
  return prisma.tmbUnitMapping.findMany({ where: { map_profile_id: mapProfileId } });
}

export interface UpsertMappingInput {
  unitCode: string;
  normalizedUnitCode: string;
  x: number;
  y: number;
  source: TmbMappingSource;
  confidence?: number | null;
  provenance?: Record<string, unknown> | null;
}

/** Tạo/thay thế mapping cho 1 mã căn — "audit-safe" bằng update-in-place:
 * bump updated_at + đổi source (xem comment schema.prisma tmb_unit_mapping),
 * KHÔNG cần bảng lịch sử riêng cho v1. MANUAL luôn được phép ghi đè AUTO_TEXT
 * (Admin sửa tay là authority — Section 8), ngược lại route gọi hàm này phải
 * tự kiểm tra trước khi cho AUTO_TEXT ghi đè MANUAL (xem tmb-profiles/[id]/index route). */
export async function upsertTmbUnitMapping(mapProfileId: string, input: UpsertMappingInput) {
  return prisma.tmbUnitMapping.upsert({
    where: { map_profile_id_normalized_unit_code: { map_profile_id: mapProfileId, normalized_unit_code: input.normalizedUnitCode } },
    create: {
      map_profile_id: mapProfileId,
      unit_code: input.unitCode,
      normalized_unit_code: input.normalizedUnitCode,
      x: input.x,
      y: input.y,
      source: input.source,
      confidence: input.confidence ?? null,
      provenance: (input.provenance ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    update: {
      unit_code: input.unitCode,
      x: input.x,
      y: input.y,
      source: input.source,
      confidence: input.confidence ?? null,
      provenance: (input.provenance ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function deleteTmbUnitMapping(mapProfileId: string, normalizedUnitCode: string) {
  return prisma.tmbUnitMapping.deleteMany({
    where: { map_profile_id: mapProfileId, normalized_unit_code: normalizedUnitCode },
  });
}
