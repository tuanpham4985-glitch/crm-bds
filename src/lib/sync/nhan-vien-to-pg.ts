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
}

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

  return { synced, errors };
}
