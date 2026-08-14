// ============================================================
// CRM BĐS — Xóa đơn Chấm công online (dùng dọn dữ liệu TEST)
//
// Xóa bản ghi trong PostgreSQL (nguồn app đọc) VÀ dọn bản mirror
// trên Google Sheet. Mặc định CHẠY THỬ (dry-run) — chỉ liệt kê,
// KHÔNG xóa. Thêm --confirm mới xóa thật.
//
// Bắt buộc chọn 1 bộ lọc (tránh xóa nhầm toàn bộ):
//   --employee=<id_nhan_vien>   vd --employee=DEV_ADMIN
//   --id=<CCN_id>               xóa đúng 1 đơn
//   --ngay=YYYY-MM-DD           đơn đúng 1 ngày, vd --ngay=2026-08-13
//   --from=YYYY-MM-DD           đơn từ ngày này trở đi (có thể kèm --to)
//   --to=YYYY-MM-DD             đơn đến hết ngày này
//   --all                       TẤT CẢ đơn (dùng khi feature còn thuần test)
//
// Lọc thêm (tùy chọn):
//   --status=da_duyet|cho_duyet|tu_choi
//
// Usage:
//   npm run purge:ccn -- --employee=DEV_ADMIN            # xem thử
//   npm run purge:ccn -- --employee=DEV_ADMIN --confirm  # xóa thật
//   npm run purge:ccn -- --ngay=2026-08-13               # xem thử đơn 1 ngày
//   npm run purge:ccn -- --ngay=2026-08-13 --confirm     # xóa thật
// ============================================================

import { prisma } from '../src/lib/db/client';
import { deleteChamCongNgoaiById } from '../src/lib/google-sheets';

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const employee = arg('employee');
  const id = arg('id');
  const status = arg('status');
  const ngay = arg('ngay');
  const from = arg('from');
  const to = arg('to');
  const all = hasFlag('all');
  const confirm = hasFlag('confirm');

  // Bắt buộc có ít nhất 1 bộ lọc rõ ràng
  if (!employee && !id && !ngay && !from && !to && !all) {
    console.error(
      '[purge-ccn] Thiếu bộ lọc. Chọn 1 trong: --employee=<id>, --id=<CCN_id>, ' +
      '--ngay=YYYY-MM-DD, --from/--to=YYYY-MM-DD, hoặc --all',
    );
    process.exitCode = 1;
    return;
  }

  const where: Record<string, unknown> = {};
  if (id) where.id = id;
  if (employee) where.id_nhan_vien = employee;
  if (status) where.trang_thai = status;
  // Lọc theo ngày (ngay lưu dạng YYYY-MM-DD nên so sánh chuỗi là đúng thứ tự thời gian)
  if (ngay) {
    where.ngay = ngay;
  } else if (from || to) {
    const range: Record<string, string> = {};
    if (from) range.gte = from;
    if (to) range.lte = to;
    where.ngay = range;
  }

  const rows = await prisma.chamCongNgoai.findMany({
    where,
    orderBy: { ngay: 'asc' },
    select: {
      id: true, id_nhan_vien: true, ho_ten: true, ngay: true,
      du_an_khach_hang: true, dia_diem: true, trang_thai: true,
    },
  });

  if (rows.length === 0) {
    console.log('[purge-ccn] Không có đơn nào khớp bộ lọc. Không làm gì.');
    return;
  }

  console.log(`[purge-ccn] ${rows.length} đơn khớp bộ lọc:`);
  for (const r of rows) {
    console.log(
      `  - ${r.id} | ${r.id_nhan_vien} (${r.ho_ten ?? ''}) | ${r.ngay} | ` +
      `${r.trang_thai} | ${r.du_an_khach_hang} @ ${r.dia_diem ?? ''}`,
    );
  }

  if (!confirm) {
    console.log('\n[purge-ccn] ĐÂY LÀ CHẠY THỬ — chưa xóa gì.');
    console.log('[purge-ccn] Thêm --confirm để xóa thật các đơn ở trên.');
    return;
  }

  console.log('\n[purge-ccn] Đang xóa…');
  let pgDeleted = 0;
  let sheetDeleted = 0;
  for (const r of rows) {
    await prisma.chamCongNgoai.delete({ where: { id: r.id } });
    pgDeleted++;
    try {
      const ok = await deleteChamCongNgoaiById(r.id);
      if (ok) sheetDeleted++;
    } catch (e) {
      console.warn(`  ! Xóa mirror Sheet lỗi cho ${r.id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[purge-ccn] Xong. Xóa PG=${pgDeleted}, Sheet=${sheetDeleted}.`);
}

main()
  .catch(err => {
    console.error('[purge-ccn] LỖI:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
