import { prisma } from '../db/client';
import { toKhachHang } from '../repository/postgresql/customer.repo';
import type { CrmSessionUser } from '../crm-auth';
import type { KhachHang } from '../types';

/**
 * Import Batch chỉ tồn tại khi Postgres CRM được bật (giống mọi tính năng
 * Qualified Lead Funnel khác). Nếu PG crm tắt, Excel import vẫn hoạt động
 * như cũ qua Google Sheets — chỉ không có batch tracking.
 *
 * Batch record được tạo TRƯỚC khi xử lý dòng nào — nếu tạo thất bại, route
 * phải dừng lại ngay (chưa có customer nào được tạo ở thời điểm này, nên
 * không có gì cần "swallow"). Từng customer sau đó được tạo qua
 * addKhachHangWithBatch() (data-access.ts) — import_batch_id được ghi ATOMIC
 * cùng lúc tạo, không phải một bước update riêng như trước.
 */
export async function createImportBatch(input: { filename: string; importedBy: CrmSessionUser }) {
  return prisma.crmImportBatch.create({
    data: {
      filename: input.filename,
      imported_by_id: input.importedBy.id_nhan_vien,
      imported_by_name: input.importedBy.ho_ten,
      // Số liệu thật được ghi ở updateImportBatchCounts() sau khi xử lý xong toàn bộ dòng.
      total_rows: 0,
      created_count: 0,
      duplicate_count: 0,
      invalid_count: 0,
    },
  });
}

/**
 * Ghi số liệu tổng kết cuối cùng sau khi đã xử lý xong toàn bộ dòng. Đây CHỈ
 * là bookkeeping mô tả (hiển thị trong Lịch sử Import) — provenance thật của
 * từng customer đã được đảm bảo atomic tại thời điểm tạo, không phụ thuộc
 * vào bước này. Nếu bước này lỗi, dữ liệu customer/provenance vẫn đúng —
 * chỉ số liệu tổng trên batch tạm thời không cập nhật.
 */
export async function updateImportBatchCounts(id: string, counts: {
  totalRows: number; createdCount: number; duplicateCount: number; invalidCount: number;
}) {
  return prisma.crmImportBatch.update({
    where: { id },
    data: {
      total_rows: counts.totalRows,
      created_count: counts.createdCount,
      duplicate_count: counts.duplicateCount,
      invalid_count: counts.invalidCount,
    },
  });
}

export async function listImportBatches() {
  return prisma.crmImportBatch.findMany({ orderBy: { imported_at: 'desc' } });
}

export async function getImportBatch(id: string) {
  return prisma.crmImportBatch.findUnique({ where: { id } });
}

export async function getImportBatchCustomers(batchId: string): Promise<KhachHang[]> {
  const rows = await prisma.khachHang.findMany({ where: { import_batch_id: batchId }, orderBy: { created_at: 'asc' } });
  return rows.map(toKhachHang);
}
