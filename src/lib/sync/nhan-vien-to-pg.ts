// ============================================================
// CRM BĐS — Đồng bộ sheet NHAN_VIEN → PostgreSQL
//
// Google Sheets là nguồn sự thật; PostgreSQL chỉ là bản sao phục vụ đọc nhanh.
// Khi PG_ENABLED_MODULES bật 'hrm', mọi màn hình nhân sự đọc từ PostgreSQL,
// nên ghi vào sheet mà không đẩy sang PG thì giao diện vẫn hiện số cũ.
//
// Dùng bởi: cron /api/cron/sync-sheets và nút "Đồng bộ nhân sự" (/api/nhan-vien/sync)
// ============================================================
import { prisma } from '@/lib/db/client';
import { getNhanVien } from '@/lib/google-sheets'; // ĐỌC THẲNG SHEET, không qua facade

export interface SyncHrmResult {
  synced: number;
  errors: number;
  /** Bản sao thừa đã dọn: có trong PostgreSQL nhưng không còn trong sheet */
  removed: number;
  removed_ids: string[];
}

/**
 * Mã do file HR cấp luôn là 4 chữ số ("0089").
 * Nhân viên tạo bằng nút "Thêm nhân viên" trong app có mã dạng "NV<timestamp>"
 * và CHỈ tồn tại trong PostgreSQL — không được đụng tới khi dọn.
 */
const HR_ID_PATTERN = /^\d{4}$/;

export async function syncNhanVienToPostgres(): Promise<SyncHrmResult> {
  const rows = await getNhanVien();
  let synced = 0;
  let errors = 0;

  for (const nv of rows) {
    if (!nv.id_nhan_vien) continue;
    try {
      await prisma.nhanVien.upsert({
        where: { id_nhan_vien: nv.id_nhan_vien },
        create: {
          id_nhan_vien:            nv.id_nhan_vien,
          ho_ten:                  nv.ho_ten,
          so_dien_thoai:           nv.so_dien_thoai,
          email:                   nv.email || `${nv.id_nhan_vien}@placeholder.local`,
          vai_tro:                 nv.vai_tro,
          employee_type:           nv.employee_type,
          gioi_tinh:               nv.gioi_tinh,
          khu_vuc:                 nv.khu_vuc,
          phong_KD:                nv.phong_KD,
          ql_truc_tiep:            nv.ql_truc_tiep,
          so_cccd:                 nv.so_cccd,
          ngay_cap:                nv.ngay_cap,
          noi_cap:                 nv.noi_cap,
          HKTT:                    nv.HKTT,
          ngay_sinh:               nv.ngay_sinh,
          ma_so_thue:              nv.ma_so_thue,
          so_nguoi_phu_thuoc:      nv.so_nguoi_phu_thuoc,
          trang_thai:              nv.trang_thai,
          ngay_tao:                nv.ngay_tao,
          avatar_url:              nv.avatar_url,
          mat_khau:                nv.mat_khau,
          so_tk_ngan_hang:         nv.so_tk_ngan_hang,
          ten_ngan_hang_thu_huong: nv.ten_ngan_hang_thu_huong,
        },
        update: {
          ho_ten:        nv.ho_ten,
          trang_thai:    nv.trang_thai,
          employee_type: nv.employee_type,
          vai_tro:       nv.vai_tro,
          avatar_url:    nv.avatar_url,
          mat_khau:      nv.mat_khau,
          phong_KD:      nv.phong_KD,
          ql_truc_tiep:  nv.ql_truc_tiep,
          so_dien_thoai: nv.so_dien_thoai,
        },
      });
      synced++;
    } catch {
      errors++;
    }
  }

  // ── Dọn bản sao thừa ────────────────────────────────────
  // Upsert không bao giờ xoá, nên nhân viên bị gỡ khỏi sheet vẫn nằm lại trong
  // PostgreSQL mãi mãi — mà mọi màn hình nhân sự đọc từ đó, nên họ vẫn hiện trên app.
  const removed_ids: string[] = [];

  // Chốt chặn: sheet đọc lỗi / rỗng thì TUYỆT ĐỐI không xoá gì.
  const sheetIds = new Set(rows.map(r => (r.id_nhan_vien || '').trim()).filter(Boolean));
  if (sheetIds.size > 0) {
    const pgRows = await prisma.nhanVien.findMany({ select: { id_nhan_vien: true } });
    const orphans = pgRows
      .map(r => r.id_nhan_vien)
      .filter(id => HR_ID_PATTERN.test(id) && !sheetIds.has(id));

    for (const id of orphans) {
      try {
        await prisma.nhanVien.delete({ where: { id_nhan_vien: id } });
        removed_ids.push(id);
      } catch {
        errors++;
      }
    }
    if (removed_ids.length) {
      console.log('[sync:nhan-vien→pg] đã dọn bản sao không còn trong sheet:', removed_ids.join(', '));
    }
  }

  return { synced, errors, removed: removed_ids.length, removed_ids };
}
