import type { ICrmTaskRepository } from '../interfaces';
import type { CongViec } from '../../types';
import { prisma } from '../../db/client';

export class PostgresCrmTaskRepository implements ICrmTaskRepository {
  async findAll(): Promise<CongViec[]> {
    const rows = await prisma.congViec.findMany({ orderBy: { ngay_tao: 'desc' } });
    return rows.map(toCongViec);
  }

  async findById(id: string): Promise<CongViec | null> {
    const row = await prisma.congViec.findUnique({ where: { id_cong_viec: id } });
    return row ? toCongViec(row) : null;
  }

  async create(data: CongViec): Promise<void> {
    await prisma.congViec.create({ data: fromCongViec(data) });
  }

  async update(data: CongViec): Promise<boolean> {
    try {
      await prisma.congViec.update({
        where: { id_cong_viec: data.id_cong_viec },
        data: fromCongViec(data),
      });
      return true;
    } catch {
      return false;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.congViec.delete({ where: { id_cong_viec: id } });
      return true;
    } catch {
      return false;
    }
  }
}

type PgCongViec = Awaited<ReturnType<typeof prisma.congViec.findFirst>>;

function toCongViec(row: NonNullable<PgCongViec>): CongViec {
  return {
    id_cong_viec:   row.id_cong_viec,
    ngay_tao:       row.ngay_tao,
    ghi_chu:        row.ghi_chu ?? '',
    id_pipeline:    row.id_pipeline,
    trang_thai:     row.trang_thai,
    ngay_hen:       row.ngay_hen ?? '',
    sale_phu_trach: row.sale_phu_trach,
    ket_qua:        row.ket_qua ?? '',
  };
}

function fromCongViec(cv: CongViec) {
  return {
    id_cong_viec:   cv.id_cong_viec,
    ngay_tao:       cv.ngay_tao,
    ghi_chu:        cv.ghi_chu,
    id_pipeline:    cv.id_pipeline,
    trang_thai:     cv.trang_thai,
    ngay_hen:       cv.ngay_hen,
    sale_phu_trach: cv.sale_phu_trach,
    ket_qua:        cv.ket_qua,
  };
}
