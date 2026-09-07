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
import { Prisma } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;

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

/** Retry tối đa 3 lần khi transaction SERIALIZABLE bị Postgres từ chối do
 * write conflict/deadlock (Prisma map thành mã lỗi P2034: "Transaction failed
 * due to a write conflict or a deadlock. Please retry your transaction") —
 * CÙNG pattern đã dùng ở crm-funnel (membership-workflow.ts/transactional-
 * workflow.ts/private-group.ts, mỗi module tự có bản riêng theo convention
 * hiện có, KHÔNG import chung 1 helper). */
async function serializable<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      lastError = error;
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : '';
      if (code !== 'P2034') throw error;
    }
  }
  throw lastError;
}

/** Kích hoạt 1 map profile — ĐỔI status sang ACTIVE, đồng thời tự động
 * chuyển MỌI profile khác CÙNG "slot" (stacking_config_id + subdivision —
 * kể cả subdivision null, Prisma where equality với null map đúng sang
 * "IS NULL" nên vẫn phân biệt đúng slot) đang ACTIVE về lại READY_FOR_REVIEW
 * — CÙNG status mà action "deactivate" thủ công (activate/route.ts) đã dùng
 * từ trước ("Ngừng dùng"), KHÔNG phát minh status mới.
 *
 * Bất biến bảo vệ: TẠI MỌI THỜI ĐIỂM chỉ 1 profile ACTIVE mỗi slot — trước
 * fix này, POST /activate chỉ update ĐÚNG 1 dòng target, không hề biết tới
 * sibling nào khác, nên có thể tồn tại 2 ACTIVE profile cùng project/subdivision
 * (đã audit + chứng minh, xem "TMB_ACTIVATION_INVARIANT_FIX"). Deactivate
 * sibling + activate target giờ nằm CHUNG 1 transaction.
 *
 * SERIALIZABLE (không phải READ COMMITTED mặc định) — CẦN THIẾT cho đúng
 * race đã audit: 2 request activate 2 profile KHÁC NHAU cùng slot chạy gần
 * như đồng thời — dưới READ COMMITTED, transaction B đọc/deactivate sibling
 * xong TRƯỚC KHI transaction A commit target A thành ACTIVE thì B không bao
 * giờ "thấy" A để deactivate nó (Postgres không tự re-scan phát hiện dòng
 * MỚI thoả điều kiện xuất hiện sau khi UPDATE đã bắt đầu — chỉ re-check dòng
 * đã match/lock lúc đầu), kết quả CẢ A lẫn B đều ACTIVE. SERIALIZABLE khiến
 * Postgres tự phát hiện write-skew này (đúng loại "invariant across nhiều
 * dòng" kinh điển SSI được thiết kế để bắt) và abort 1 trong 2 transaction —
 * `serializable()` tự động retry, transaction retry sẽ thấy đúng state mới
 * nhất và deactivate đúng sibling.
 *
 * Idempotent: activate lại chính profile ĐANG ACTIVE không lỗi/không hỏng gì
 * — updateMany loại trừ chính nó (`id: { not: id }`), không sibling nào khác
 * để đổi -> no-op an toàn, rồi update target vẫn set lại ACTIVE bình thường.
 *
 * KHÔNG động tới mappings/glyph_remap/master_asset_ref/web_asset_ref/Blob/
 * Sheet của BẤT KỲ profile nào (target lẫn sibling) — CHỈ đổi 2 field
 * status/error_message. */
export async function activateTmbMapProfile(id: string) {
  return serializable(async tx => {
    const profile = await tx.tmbMapProfile.findUniqueOrThrow({ where: { id } });
    await tx.tmbMapProfile.updateMany({
      where: {
        stacking_config_id: profile.stacking_config_id,
        subdivision: profile.subdivision,
        status: 'ACTIVE',
        id: { not: id },
      },
      data: { status: 'READY_FOR_REVIEW' },
    });
    return tx.tmbMapProfile.update({
      where: { id },
      data: { status: 'ACTIVE', error_message: null },
    });
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
