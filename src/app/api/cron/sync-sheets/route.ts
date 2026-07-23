// Cron job: tự động sync Google Sheets → PostgreSQL
// Chạy hàng ngày lúc 01:00 UTC (08:00 giờ VN)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getNhanVien, getKhachHang, getPipeline } from '@/lib/google-sheets';
import { syncTmUsersFromNhanVien } from '@/lib/task-management/sync-users';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

async function syncHrm(): Promise<{ synced: number; errors: number }> {
  const rows = await getNhanVien();
  let synced = 0; let errors = 0;
  for (const nv of rows) {
    if (!nv.id_nhan_vien) continue;
    try {
      await prisma.nhanVien.upsert({
        where:  { id_nhan_vien: nv.id_nhan_vien },
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
    } catch { errors++; }
  }
  return { synced, errors };
}

async function syncKhachHang(): Promise<{ synced: number; errors: number }> {
  const rows = await getKhachHang();
  let synced = 0; let errors = 0;
  for (const kh of rows) {
    if (!kh.id_khach_hang) continue;
    try {
      await prisma.khachHang.upsert({
        where:  { id_khach_hang: kh.id_khach_hang },
        create: {
          id_khach_hang:  kh.id_khach_hang,
          ngay_tao:       kh.ngay_tao,
          ten_KH:         kh.ten_KH,
          so_dien_thoai:  kh.so_dien_thoai,
          email:          kh.email,
          nguon:          kh.nguon,
          nhu_cau:        kh.nhu_cau,
          ghi_chu:        kh.ghi_chu,
          sale_phu_trach: kh.sale_phu_trach,
          label_khach:    kh.label_khach,
          du_an:          kh.du_an,
          sale_lan_1:     kh.sale_lan_1,
          ghi_chu_lan_1:  kh.ghi_chu_lan_1,
          sale_lan_2:     kh.sale_lan_2,
          ghi_chu_lan_2:  kh.ghi_chu_lan_2,
          sale_lan_3:     kh.sale_lan_3,
          ghi_chu_lan_3:  kh.ghi_chu_lan_3,
        },
        update: {
          ten_KH:         kh.ten_KH,
          sale_phu_trach: kh.sale_phu_trach,
          label_khach:    kh.label_khach,
          ghi_chu:        kh.ghi_chu,
        },
      });
      synced++;
    } catch { errors++; }
  }
  return { synced, errors };
}

async function syncPipeline(): Promise<{ synced: number; errors: number }> {
  const rows = await getPipeline();
  let synced = 0; let errors = 0;
  for (const pl of rows) {
    if (!pl.id_pipeline) continue;
    try {
      await prisma.pipeline.upsert({
        where:  { id_pipeline: pl.id_pipeline },
        create: {
          id_pipeline:     pl.id_pipeline,
          id_khach_hang:   pl.id_khach_hang,
          giai_doan:       pl.giai_doan,
          gia_tri_thuc_te: pl.gia_tri_thuc_te,
          sale_phu_trach:  pl.sale_phu_trach,
          id_du_an:        pl.id_du_an,
          ten_du_an:       pl.ten_du_an,
          hoa_hong:        pl.hoa_hong,
          tien_hoa_hong:   pl.tien_hoa_hong,
          ngay_cap_nhat:   pl.ngay_cap_nhat,
          ngay_coc:        pl.ngay_coc,
          thang:           pl.thang,
          ma_can:          pl.ma_can,
          loai_can:        pl.loai_can,
          gdda:            pl.gdda,
          gdkd:            pl.gdkd,
          phong_kd:        pl.phong_kd,
          tkkd:            pl.tkkd,
          ho_ten_kh:       pl.ho_ten_kh,
          ty_le_tra_sale:  pl.ty_le_tra_sale,
          ty_le_kh:        pl.ty_le_kh,
          ty_le_gdda:      pl.ty_le_gdda,
          ty_le_gdkd:      pl.ty_le_gdkd,
          ty_le_mkt:       pl.ty_le_mkt,
          phi_tra_sale:    pl.phi_tra_sale,
          phi_tra_kh:      pl.phi_tra_kh,
          phi_tra_gdda:    pl.phi_tra_gdda,
          phi_tra_gdkd:    pl.phi_tra_gdkd,
          phi_tra_mkt:     pl.phi_tra_mkt,
          phi_admin:       pl.phi_admin,
          loi_nhuan:       pl.loi_nhuan,
          thuong_nong:     pl.thuong_nong,
          phi_tkkd:        pl.phi_tkkd,
        },
        update: {
          giai_doan:       pl.giai_doan,
          gia_tri_thuc_te: pl.gia_tri_thuc_te,
          hoa_hong:        pl.hoa_hong,
          tien_hoa_hong:   pl.tien_hoa_hong,
          ngay_cap_nhat:   pl.ngay_cap_nhat,
          ngay_coc:        pl.ngay_coc,
          thang:           pl.thang,
          ma_can:          pl.ma_can,
          gdda:            pl.gdda,
          gdkd:            pl.gdkd,
          phong_kd:        pl.phong_kd,
          tkkd:            pl.tkkd,
          ho_ten_kh:       pl.ho_ten_kh,
          phi_tra_sale:    pl.phi_tra_sale,
          phi_tra_kh:      pl.phi_tra_kh,
          phi_tra_gdda:    pl.phi_tra_gdda,
          phi_tra_gdkd:    pl.phi_tra_gdkd,
          phi_tra_mkt:     pl.phi_tra_mkt,
          phi_admin:       pl.phi_admin,
          loi_nhuan:       pl.loi_nhuan,
          thuong_nong:     pl.thuong_nong,
          phi_tkkd:        pl.phi_tkkd,
        },
      });
      synced++;
    } catch { errors++; }
  }
  return { synced, errors };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startMs = Date.now();
  try {
    const [hrm, khachHang, pipeline] = await Promise.all([
      syncHrm(),
      syncKhachHang(),
      syncPipeline(),
    ]);

    // NHAN_VIEN → TM_Users: nhân viên mới xuất hiện trong Task Management
    // mà không cần chờ họ tự đăng nhập lần đầu.
    const tmUsers = await syncTmUsersFromNhanVien().catch(e => {
      console.error('[cron:sync-sheets] TM_Users sync failed:', e instanceof Error ? e.message : e);
      return null;
    });

    const elapsed = Math.round((Date.now() - startMs) / 1000);
    console.log(`[cron:sync-sheets] done in ${elapsed}s`, { hrm, khachHang, pipeline, tmUsers });
    return NextResponse.json({ ok: true, elapsed_s: elapsed, hrm, khachHang, pipeline, tmUsers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron:sync-sheets] failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
