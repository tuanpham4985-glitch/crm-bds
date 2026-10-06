// Chính sách lưu ảnh Chấm công online: ảnh chỉ dùng để HR đối chiếu khi duyệt
// và chốt công, nên ảnh của đơn tháng N được giữ đến hết ngày 15 tháng N+1.
// Sau mốc đó chỉ xóa ẢNH (hinh_anh), đơn chấm công vẫn giữ nguyên.

export const PHOTO_KEEP_UNTIL_DAY = 15;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Trả về 'YYYY-MM-01': mọi đơn có ngay < mốc này đã hết hạn lưu ảnh.
// - Ngày 1..15 (giờ VN): vẫn giữ ảnh tháng trước → mốc = ngày 1 tháng trước.
// - Từ ngày 16: mốc = ngày 1 tháng hiện tại.
export function photoRetentionCutoff(now: Date = new Date()): string {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  let year = vn.getUTCFullYear();
  let month = vn.getUTCMonth() + 1; // 1..12
  if (vn.getUTCDate() <= PHOTO_KEEP_UNTIL_DAY) {
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
