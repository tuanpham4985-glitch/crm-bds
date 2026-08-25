import type { ICustomerRepository } from '../interfaces';
import type { KhachHang } from '../../types';
import { prisma } from '../../db/client';

export class PostgresCustomerRepository implements ICustomerRepository {
  async findAll(): Promise<KhachHang[]> {
    const rows = await prisma.khachHang.findMany({ orderBy: { ngay_tao: 'desc' } });
    return rows.map(toKhachHang);
  }

  async findById(id: string): Promise<KhachHang | null> {
    const row = await prisma.khachHang.findUnique({ where: { id_khach_hang: id } });
    return row ? toKhachHang(row) : null;
  }

  async create(data: KhachHang): Promise<void> {
    await prisma.khachHang.create({ data: fromKhachHang(data) });
  }

  async createBatch(data: KhachHang[]): Promise<void> {
    await prisma.khachHang.createMany({
      data: data.map(fromKhachHang),
      skipDuplicates: true,
    });
  }

  async update(data: KhachHang): Promise<boolean> {
    try {
      await prisma.khachHang.update({
        where: { id_khach_hang: data.id_khach_hang },
        data: fromKhachHang(data),
      });
      return true;
    } catch {
      return false;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.khachHang.delete({ where: { id_khach_hang: id } });
      return true;
    } catch {
      return false;
    }
  }
}

type PgKhachHang = Awaited<ReturnType<typeof prisma.khachHang.findFirst>>;

function toKhachHang(row: NonNullable<PgKhachHang>): KhachHang {
  return {
    id_khach_hang:  row.id_khach_hang,
    ngay_tao:       row.ngay_tao,
    ten_KH:         row.ten_KH,
    so_dien_thoai:  row.so_dien_thoai ?? '',
    email:          row.email ?? '',
    nguon:          row.nguon ?? '',
    nhu_cau:        row.nhu_cau ?? '',
    ghi_chu:        row.ghi_chu ?? '',
    sale_phu_trach: row.sale_phu_trach,
    label_khach:    row.label_khach ?? '',
    du_an:          row.du_an ?? undefined,
    sale_lan_1:     row.sale_lan_1 ?? undefined,
    ghi_chu_lan_1:  row.ghi_chu_lan_1 ?? undefined,
    sale_lan_2:     row.sale_lan_2 ?? undefined,
    ghi_chu_lan_2:  row.ghi_chu_lan_2 ?? undefined,
    sale_lan_3:     row.sale_lan_3 ?? undefined,
    ghi_chu_lan_3:  row.ghi_chu_lan_3 ?? undefined,
    telesale_phu_trach: row.telesale_phu_trach ?? undefined,
    sale_nhan_khach: row.sale_nhan_khach ?? undefined,
    trang_thai_cham_soc: (row.trang_thai_cham_soc ?? 'Chưa gọi') as KhachHang['trang_thai_cham_soc'],
    muc_do_quan_tam: (row.muc_do_quan_tam ?? 'Chưa xác định') as KhachHang['muc_do_quan_tam'],
    ngay_lien_he_cuoi: row.ngay_lien_he_cuoi ?? undefined,
    ngay_lien_he_tiep: row.ngay_lien_he_tiep ?? undefined,
    so_lan_lien_he: row.so_lan_lien_he,
    lich_su_cham_soc: row.lich_su_cham_soc ?? undefined,
    trang_thai_ban_giao: (row.trang_thai_ban_giao ?? 'Chưa bàn giao') as KhachHang['trang_thai_ban_giao'],
    ban_giao_luc: row.ban_giao_luc ?? undefined,
    sale_xac_nhan_luc: row.sale_xac_nhan_luc ?? undefined,
    lich_su_ban_giao: row.lich_su_ban_giao ?? undefined,
    san_pham_quan_tam: row.san_pham_quan_tam ?? undefined,
    ngan_sach_min: row.ngan_sach_min ?? undefined,
    ngan_sach_max: row.ngan_sach_max ?? undefined,
    muc_dich: row.muc_dich as KhachHang['muc_dich'],
    thoi_gian_du_kien: row.thoi_gian_du_kien as KhachHang['thoi_gian_du_kien'],
    phuong_an_tai_chinh: row.phuong_an_tai_chinh ?? undefined,
    khu_vuc_yeu_cau: row.khu_vuc_yeu_cau ?? undefined,
    hanh_dong_tiep_theo: row.hanh_dong_tiep_theo ?? undefined,
    qualification_status: row.qualification_status as KhachHang['qualification_status'],
    lead_quality_score: row.lead_quality_score,
    lead_quality_rank: row.lead_quality_rank as KhachHang['lead_quality_rank'],
    lead_score_breakdown: row.lead_score_breakdown ?? undefined,
    lead_score_history: row.lead_score_history ?? undefined,
    ngay_quan_tam: row.ngay_quan_tam ?? undefined,
    qualified_at: row.qualified_at ?? undefined,
    hot_at: row.hot_at ?? undefined,
    row_version: row.row_version,
  };
}

function fromKhachHang(kh: KhachHang) {
  return {
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
    telesale_phu_trach: kh.telesale_phu_trach,
    sale_nhan_khach: kh.sale_nhan_khach,
    trang_thai_cham_soc: kh.trang_thai_cham_soc ?? 'Chưa gọi',
    muc_do_quan_tam: kh.muc_do_quan_tam ?? 'Chưa xác định',
    ngay_lien_he_cuoi: kh.ngay_lien_he_cuoi,
    ngay_lien_he_tiep: kh.ngay_lien_he_tiep,
    so_lan_lien_he: kh.so_lan_lien_he ?? 0,
    lich_su_cham_soc: kh.lich_su_cham_soc,
    trang_thai_ban_giao: kh.trang_thai_ban_giao ?? 'Chưa bàn giao',
    ban_giao_luc: kh.ban_giao_luc,
    sale_xac_nhan_luc: kh.sale_xac_nhan_luc,
    lich_su_ban_giao: kh.lich_su_ban_giao,
    san_pham_quan_tam: kh.san_pham_quan_tam,
    ngan_sach_min: kh.ngan_sach_min,
    ngan_sach_max: kh.ngan_sach_max,
    muc_dich: kh.muc_dich,
    thoi_gian_du_kien: kh.thoi_gian_du_kien,
    phuong_an_tai_chinh: kh.phuong_an_tai_chinh,
    khu_vuc_yeu_cau: kh.khu_vuc_yeu_cau,
    hanh_dong_tiep_theo: kh.hanh_dong_tiep_theo,
    qualification_status: kh.qualification_status ?? 'RAW',
    lead_quality_score: kh.lead_quality_score ?? 0,
    lead_quality_rank: kh.lead_quality_rank ?? 'UNQUALIFIED',
    lead_score_breakdown: kh.lead_score_breakdown,
    lead_score_history: kh.lead_score_history,
    ngay_quan_tam: kh.ngay_quan_tam,
    qualified_at: kh.qualified_at,
    hot_at: kh.hot_at,
    row_version: kh.row_version ?? 0,
  };
}
