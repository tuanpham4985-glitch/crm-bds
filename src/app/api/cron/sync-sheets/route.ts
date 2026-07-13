// Cron job: tự động sync Google Sheets → PostgreSQL
// Chạy mỗi giờ để đảm bảo dữ liệu nhân viên và pipeline luôn được cập nhật
// Vercel Cron gọi GET /api/cron/sync-sheets với header Authorization: Bearer CRON_SECRET
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import {
  getNhanVien,
  getKhachHang,
  getPipeline,
} from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // không set → không bảo vệ (dev)
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
    } catch {
      errors++;
    }
  }
  return { synced, errors };
}

async function syncCrmCustomers(): Promise<{ synced: number; errors: number }> {
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
          gioi_tinh:      kh.gioi_tinh,
          ngay_sinh:      kh.ngay_sinh,
          dia_chi:        kh.dia_chi,
          ghi_chu:        kh.ghi_chu,
          nguon_khach:    kh.nguon_khach,
          nhan_vien_phu_trach: kh.nhan_vien_phu_trach,
          trang_thai:     kh.trang_thai,
        },
        update: {
          ten_KH:         kh.ten_KH,
          so_dien_thoai:  kh.so_dien_thoai,
          trang_thai:     kh.trang_thai,
          ghi_chu:        kh.ghi_chu,
          nhan_vien_phu_trach: kh.nhan_vien_phu_trach,
        },
      });
      synced++;
    } catch {
      errors++;
    }
  }
  return { synced, errors };
}

async function syncCrmPipeline(): Promise<{ synced: number; errors: number }> {
  const rows = await getPipeline();
  let synced = 0; let errors = 0;

  for (const pl of rows) {
    if (!pl.id_pipeline) continue;
    try {
      await prisma.pipeline.upsert({
        where:  { id_pipeline: pl.id_pipeline },
        create: {
          id_pipeline:    pl.id_pipeline,
          ngay_tao:       pl.ngay_tao,
          ten_KH:         pl.ten_KH,
          so_dien_thoai:  pl.so_dien_thoai,
          du_an:          pl.du_an,
          san_pham:       pl.san_pham,
          giai_doan:      pl.giai_doan,
          nhan_vien_phu_trach: pl.nhan_vien_phu_trach,
          ghi_chu:        pl.ghi_chu,
          nguon_khach:    pl.nguon_khach,
          gia_ban:        pl.gia_ban ?? 0,
          phi_tra_sale:   pl.phi_tra_sale ?? 0,
          phi_tra_kh:     pl.phi_tra_kh ?? 0,
          phi_tra_gdda:   pl.phi_tra_gdda ?? 0,
          phi_tra_gdkd:   pl.phi_tra_gdkd ?? 0,
          phi_tra_mkt:    pl.phi_tra_mkt ?? 0,
          phi_admin:      pl.phi_admin ?? 0,
          loi_nhuan:      pl.loi_nhuan ?? 0,
          thuong_nong:    pl.thuong_nong ?? 0,
          tkkd:           pl.tkkd,
          phi_tkkd:       pl.phi_tkkd ?? 0,
          ty_le_ck:       pl.ty_le_ck ?? 0,
          ty_le_gdda:     pl.ty_le_gdda ?? 0,
          ty_le_gdkd:     pl.ty_le_gdkd ?? 0,
          ty_le_mkt:      pl.ty_le_mkt ?? 0,
          ty_le_admin:    pl.ty_le_admin ?? 0,
          ngay_cap_nhat:  pl.ngay_cap_nhat,
          ngay_coc:       pl.ngay_coc,
          thang:          pl.thang,
          ma_can:         pl.ma_can,
          loai_can:       pl.loai_can,
          gdda:           pl.gdda,
          gdkd:           pl.gdkd,
          phong_kd:       pl.phong_kd,
          ho_ten_kh:      pl.ho_ten_kh,
        },
        update: {
          ten_KH:         pl.ten_KH,
          giai_doan:      pl.giai_doan,
          ghi_chu:        pl.ghi_chu,
          gia_ban:        pl.gia_ban ?? 0,
          phi_tra_sale:   pl.phi_tra_sale ?? 0,
          phi_tra_kh:     pl.phi_tra_kh ?? 0,
          phi_tra_gdda:   pl.phi_tra_gdda ?? 0,
          phi_tra_gdkd:   pl.phi_tra_gdkd ?? 0,
          phi_tra_mkt:    pl.phi_tra_mkt ?? 0,
          phi_admin:      pl.phi_admin ?? 0,
          loi_nhuan:      pl.loi_nhuan ?? 0,
          thuong_nong:    pl.thuong_nong ?? 0,
          phi_tkkd:       pl.phi_tkkd ?? 0,
          ngay_cap_nhat:  pl.ngay_cap_nhat,
          ngay_coc:       pl.ngay_coc,
          thang:          pl.thang,
          ma_can:         pl.ma_can,
          gdda:           pl.gdda,
          gdkd:           pl.gdkd,
          phong_kd:       pl.phong_kd,
          ho_ten_kh:      pl.ho_ten_kh,
        },
      });
      synced++;
    } catch {
      errors++;
    }
  }
  return { synced, errors };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startMs = Date.now();

  try {
    const [hrm, customers, pipeline] = await Promise.all([
      syncHrm(),
      syncCrmCustomers(),
      syncCrmPipeline(),
    ]);

    const elapsed = Math.round((Date.now() - startMs) / 1000);
    console.log(`[cron:sync-sheets] done in ${elapsed}s`, { hrm, customers, pipeline });

    return NextResponse.json({
      ok: true,
      elapsed_s: elapsed,
      hrm,
      customers,
      pipeline,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron:sync-sheets] failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
