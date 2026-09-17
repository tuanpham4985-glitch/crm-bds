// Bổ nhiệm / Miễn nhiệm chức vụ — Postgres-native CRUD (approved architecture
// §5 "Postgres is the sole authority... Không Google Sheets repository...
// Không dual-write"). KHÔNG dùng resolve()/IContractRepository — pattern đó
// tồn tại để abstract GS↔PG cho module còn chạy song song 2 kho (HopDong/
// NhanVien); ở đây chỉ có 1 kho nên gọi prisma trực tiếp, cùng shape với
// src/lib/crm-funnel/private-group.ts (Postgres-only, không có Sheets nào để
// fallback).
import { prisma } from '../db/client';
import { getHrmDocumentStorage } from './hrm-document-storage';
import type { BoNhiemChucVu } from '../types';

export async function listTenures(filter?: { id_nhan_vien?: string }): Promise<BoNhiemChucVu[]> {
  const rows = await prisma.boNhiemChucVu.findMany({
    where: filter?.id_nhan_vien ? { id_nhan_vien: filter.id_nhan_vien } : undefined,
    orderBy: { ngay_bo_nhiem: 'desc' },
  });
  return rows as unknown as BoNhiemChucVu[];
}

export async function getTenureById(id: string): Promise<BoNhiemChucVu | null> {
  const row = await prisma.boNhiemChucVu.findUnique({ where: { id } });
  return row as unknown as BoNhiemChucVu | null;
}

export interface CreateTenureInput {
  /** Optional — cho phép client sinh trước 1 id (crypto.randomUUID()) để dùng
   * làm key namespace khi upload file TRƯỚC khi tenure được tạo (modal tạo
   * mới), cùng tinh thần contracts route dùng id client/server sinh trước khi
   * insert (xem src/app/api/contracts/route.ts). Không truyền → Prisma tự
   * sinh cuid() như bình thường. */
  id?: string;
  id_nhan_vien: string;
  ten_nhan_vien?: string;
  phong_ban?: string;
  du_an?: string;
  chuc_vu_bo_nhiem: string;
  ngay_bo_nhiem: string;
  so_quyet_dinh_bo_nhiem?: string;
  nguoi_ky_bo_nhiem?: string;
  file_quyet_dinh_bo_nhiem?: string;
  ngay_mien_nhiem?: string | null;
  so_quyet_dinh_mien_nhiem?: string;
  nguoi_ky_mien_nhiem?: string;
  file_quyet_dinh_mien_nhiem?: string;
  ghi_chu?: string;
  created_by_id: string;
  created_by_name: string;
}

export async function createTenure(input: CreateTenureInput): Promise<BoNhiemChucVu> {
  const row = await prisma.boNhiemChucVu.create({ data: input });
  return row as unknown as BoNhiemChucVu;
}

export type UpdateTenureInput = Partial<Omit<CreateTenureInput, 'created_by_id' | 'created_by_name'>>;

/** Update theo id (primary key) — KHÔNG BAO GIỜ match theo field khác, tránh
 * "silently overwrite existing tenure" sai record (approved architecture §4).
 * Trước khi ghi đè/xoá file cũ (khi field file_* đổi sang ref khác hoặc bị
 * xoá), xoá best-effort file cũ trên storage để tránh orphan (approved
 * architecture §7 "delete/replace behavior phải tránh orphan file"). */
export async function updateTenure(id: string, patch: UpdateTenureInput): Promise<BoNhiemChucVu | null> {
  const existing = await prisma.boNhiemChucVu.findUnique({ where: { id } });
  if (!existing) return null;

  const storage = getHrmDocumentStorage();
  const fileFields: Array<keyof UpdateTenureInput> = ['file_quyet_dinh_bo_nhiem', 'file_quyet_dinh_mien_nhiem'];
  for (const field of fileFields) {
    if (field in patch) {
      const oldRef = (existing as Record<string, unknown>)[field] as string | null | undefined;
      const newRef = patch[field];
      if (oldRef && oldRef !== newRef) {
        await storage.delete(oldRef).catch(() => {});
      }
    }
  }

  const row = await prisma.boNhiemChucVu.update({ where: { id }, data: patch });
  return row as unknown as BoNhiemChucVu;
}

/** Xoá tenure + best-effort xoá cả 2 file đính kèm (nếu có) để tránh orphan. */
export async function deleteTenure(id: string): Promise<boolean> {
  const existing = await prisma.boNhiemChucVu.findUnique({ where: { id } });
  if (!existing) return false;

  const storage = getHrmDocumentStorage();
  if (existing.file_quyet_dinh_bo_nhiem) await storage.delete(existing.file_quyet_dinh_bo_nhiem).catch(() => {});
  if (existing.file_quyet_dinh_mien_nhiem) await storage.delete(existing.file_quyet_dinh_mien_nhiem).catch(() => {});

  await prisma.boNhiemChucVu.delete({ where: { id } });
  return true;
}
