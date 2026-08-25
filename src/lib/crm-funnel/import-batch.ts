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
 *
 * Vòng đời status: 'processing' (lúc tạo) -> 'completed' (chỉ set bởi
 * completeImportBatch() SAU khi toàn bộ vòng lặp xử lý dòng xong). Nếu
 * request bị ngắt giữa chừng (timeout/crash), batch giữ nguyên 'processing'
 * mãi mãi — không có đường nào khác set 'completed' — nên Lịch sử Import
 * không bao giờ hiện nhầm một batch dang dở thành đã hoàn tất.
 */
export async function createImportBatch(input: { filename: string; importedBy: CrmSessionUser; totalRows?: number }) {
  return prisma.crmImportBatch.create({
    data: {
      filename: input.filename,
      imported_by_id: input.importedBy.id_nhan_vien,
      imported_by_name: input.importedBy.ho_ten,
      status: 'processing',
      // total_rows đã biết ngay từ đầu (số dòng dữ liệu đã parse xong) nên ghi
      // NGAY ở đây, cố định — không đổi ở checkpoint/completion bên dưới. Nếu
      // request bị ngắt giữa chừng, "Tổng" trên Lịch sử Import vẫn đúng thay
      // vì kẹt ở 0.
      total_rows: input.totalRows ?? 0,
      created_count: 0,
      duplicate_count: 0,
      invalid_count: 0,
    },
  });
}

/**
 * Checkpoint tiến độ ĐỊNH KỲ giữa chừng vòng lặp xử lý dòng (không phải mỗi
 * dòng — xem CHECKPOINT_INTERVAL_ROWS ở route.ts). KHÔNG đổi status và KHÔNG
 * đụng total_rows (đã cố định từ createImportBatch) — chỉ cập nhật 3 counter
 * đang chạy, để nếu request bị ngắt giữa chừng, Lịch sử Import vẫn thấy số
 * liệu gần nhất thay vì mãi kẹt ở 0 như trước khi có checkpoint.
 */
export async function checkpointImportBatchCounts(id: string, counts: {
  createdCount: number; duplicateCount: number; invalidCount: number;
}) {
  return prisma.crmImportBatch.update({
    where: { id },
    data: {
      created_count: counts.createdCount,
      duplicate_count: counts.duplicateCount,
      invalid_count: counts.invalidCount,
    },
  });
}

/**
 * Đánh dấu batch HOÀN TẤT: ghi số liệu CUỐI CÙNG chính xác + chuyển status
 * sang 'completed' trong CÙNG một lần ghi. Chỉ được gọi sau khi vòng lặp xử
 * lý dòng đã chạy xong toàn bộ — đây là nơi DUY NHẤT set status='completed'
 * trong toàn bộ module này. Nếu chính lệnh ghi này lỗi (hiếm), batch giữ
 * nguyên 'processing' — provenance của từng customer đã tạo trước đó không
 * bị ảnh hưởng, chỉ là Lịch sử Import tạm thời chưa hiện "đã hoàn tất".
 */
export async function completeImportBatch(id: string, counts: {
  createdCount: number; duplicateCount: number; invalidCount: number;
}) {
  return prisma.crmImportBatch.update({
    where: { id },
    data: {
      created_count: counts.createdCount,
      duplicate_count: counts.duplicateCount,
      invalid_count: counts.invalidCount,
      status: 'completed',
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
