import type { IPipelineRepository } from '../interfaces';
import type { Pipeline } from '../../types';
import { prisma } from '../../db/client';

export class PostgresPipelineRepository implements IPipelineRepository {
  async findAll(): Promise<Pipeline[]> {
    const rows = await prisma.pipeline.findMany({ orderBy: { ngay_cap_nhat: 'desc' } });
    return rows.map(toPipeline);
  }

  async findById(id: string): Promise<Pipeline | null> {
    const row = await prisma.pipeline.findUnique({ where: { id_pipeline: id } });
    return row ? toPipeline(row) : null;
  }

  async create(data: Pipeline): Promise<void> {
    await prisma.pipeline.create({ data: fromPipeline(data) });
  }

  async update(data: Pipeline): Promise<{ updated: boolean; oldGiaiDoan: string }> {
    const existing = await prisma.pipeline.findUnique({ where: { id_pipeline: data.id_pipeline } });
    if (!existing) return { updated: false, oldGiaiDoan: '' };
    const oldGiaiDoan = existing.giai_doan;
    try {
      await prisma.pipeline.update({
        where: { id_pipeline: data.id_pipeline },
        data: fromPipeline(data),
      });
      return { updated: true, oldGiaiDoan };
    } catch {
      return { updated: false, oldGiaiDoan };
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.pipeline.delete({ where: { id_pipeline: id } });
      return true;
    } catch {
      return false;
    }
  }
}

type PgPipeline = Awaited<ReturnType<typeof prisma.pipeline.findFirst>>;

function toPipeline(row: NonNullable<PgPipeline>): Pipeline {
  return {
    id_pipeline:     row.id_pipeline,
    id_khach_hang:   row.id_khach_hang,
    giai_doan:       row.giai_doan,
    gia_tri_thuc_te: row.gia_tri_thuc_te,
    sale_phu_trach:  row.sale_phu_trach,
    id_du_an:        row.id_du_an ?? '',
    ten_du_an:       row.ten_du_an ?? '',
    hoa_hong:        row.hoa_hong,
    tien_hoa_hong:   row.tien_hoa_hong,
    ngay_cap_nhat:   row.ngay_cap_nhat ?? '',
    thang:           row.thang ?? '',
    ma_can:          row.ma_can ?? undefined,
    loai_can:        row.loai_can ?? undefined,
    gdda:            row.gdda ?? undefined,
    gdkd:            row.gdkd ?? undefined,
    phong_kd:        row.phong_kd ?? undefined,
    ty_le_tra_sale:  row.ty_le_tra_sale ?? undefined,
    ty_le_kh:        row.ty_le_kh ?? undefined,
    ty_le_gdda:      row.ty_le_gdda ?? undefined,
    ty_le_gdkd:      row.ty_le_gdkd ?? undefined,
    ty_le_mkt:       row.ty_le_mkt ?? undefined,
    phi_tra_sale:    row.phi_tra_sale ?? undefined,
    phi_tra_kh:      row.phi_tra_kh ?? undefined,
    phi_tra_gdda:    row.phi_tra_gdda ?? undefined,
    phi_tra_gdkd:    row.phi_tra_gdkd ?? undefined,
    phi_tra_mkt:     row.phi_tra_mkt ?? undefined,
    phi_admin:       row.phi_admin ?? undefined,
    loi_nhuan:       row.loi_nhuan ?? undefined,
    thuong_nong:     row.thuong_nong ?? undefined,
    tkkd:            row.tkkd ?? undefined,
    phi_tkkd:        row.phi_tkkd ?? undefined,
    ho_ten_kh:       row.ho_ten_kh ?? undefined,
  };
}

function fromPipeline(pl: Pipeline) {
  return {
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
    thang:           pl.thang,
    ma_can:          pl.ma_can,
    loai_can:        pl.loai_can,
    gdda:            pl.gdda,
    gdkd:            pl.gdkd,
    phong_kd:        pl.phong_kd,
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
    tkkd:            pl.tkkd,
    phi_tkkd:        pl.phi_tkkd,
    ho_ten_kh:       pl.ho_ten_kh,
  };
}
