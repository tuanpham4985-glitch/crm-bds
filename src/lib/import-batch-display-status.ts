// STALE IMPORT BATCH DISPLAY STATUS — pure, no server-only imports (an toàn
// dùng cả ở client 'use client' page lẫn server), theo đúng convention pure-
// resolve-file đã có (VD navigation-config-resolve.ts).
//
// CrmImportBatch.status chỉ có 2 giá trị thật: 'processing' (lúc tạo) và
// 'completed' (SAU KHI vòng lặp xử lý dòng xong, xem import-batch.ts). Nếu
// request bị ngắt giữa chừng (timeout/crash/deploy), status giữ NGUYÊN
// 'processing' MÃI MÃI — không có code path nào khác set 'completed' (xem
// "interrupted-import semantics" test trong import-batch.test.ts). Kết quả:
// 1 batch chết từ nhiều ngày trước vẫn hiện "Đang xử lý..." vĩnh viễn trên
// UI dù chắc chắn không còn request nào sống.
//
// Hàm dưới đây CHỈ đổi NHÃN HIỂN THỊ dựa trên tuổi batch (status +
// imported_at) — KHÔNG ghi DB, KHÔNG đổi batch.status, KHÔNG suy ra batch/
// Customer của nó "không hợp lệ" (provenance/dataset_id/số liệu batch giữ
// nguyên, vẫn dùng được cho mọi thao tác hiện có — xem detail/backfill route,
// không đọc displayStatus).
export type ImportBatchDisplayStatus = 'completed' | 'processing' | 'stale';

// Ngưỡng lấy từ CHÍNH authority timeout hiện có của kiến trúc import: mọi
// route Postgres CRM trong repo (bao gồm import-excel/route.ts) khai báo
// `export const maxDuration = 60` (giây) — giới hạn TỐI ĐA Vercel cho phép 1
// request chạy. Sau 60s, request CHẮC CHẮN đã bị nền tảng kill (nếu chưa kịp
// completeImportBatch) — không có khả năng nào khác. Nhân buffer x5 (300s =
// 5 phút) để không báo nhầm "Bị gián đoạn" cho 1 request đang ở rất gần biên
// timeout (cold start, DB blip, hoặc lệch đồng hồ nhỏ giữa client/server) —
// 5 phút vẫn đủ ngắn để không giữ mãi nhãn "Đang xử lý..." sai cho batch thực
// sự đã chết từ lâu (mục đích ở đây CHỈ là hiển thị, không phải cắt request).
export const IMPORT_BATCH_STALE_THRESHOLD_MS = 5 * 60 * 1000;

export function deriveImportBatchDisplayStatus(
  batch: { status: string; imported_at: Date | string },
  now: Date = new Date(),
): ImportBatchDisplayStatus {
  if (batch.status === 'completed') return 'completed';
  const importedAt = typeof batch.imported_at === 'string' ? new Date(batch.imported_at) : batch.imported_at;
  const ageMs = now.getTime() - importedAt.getTime();
  return ageMs > IMPORT_BATCH_STALE_THRESHOLD_MS ? 'stale' : 'processing';
}
