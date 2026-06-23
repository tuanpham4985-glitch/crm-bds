import type { IProjectRepository } from '../interfaces';
import type { DuAn } from '../../types';
import { prisma } from '../../db/client';

export class PostgresProjectRepository implements IProjectRepository {
  async findAll(): Promise<DuAn[]> {
    const rows = await prisma.duAn.findMany({ orderBy: { ten_du_an: 'asc' } });
    return rows.map(toDuAn);
  }

  async findById(id: string): Promise<DuAn | null> {
    const row = await prisma.duAn.findUnique({ where: { id_du_an: id } });
    return row ? toDuAn(row) : null;
  }

  async create(data: DuAn): Promise<void> {
    await prisma.duAn.create({ data: fromDuAn(data) });
  }

  async update(data: DuAn): Promise<boolean> {
    try {
      await prisma.duAn.update({
        where: { id_du_an: data.id_du_an },
        data: fromDuAn(data),
      });
      return true;
    } catch {
      return false;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.duAn.delete({ where: { id_du_an: id } });
      return true;
    } catch {
      return false;
    }
  }
}

type PgDuAn = Awaited<ReturnType<typeof prisma.duAn.findFirst>>;

function toDuAn(row: NonNullable<PgDuAn>): DuAn {
  return {
    id_du_an:          row.id_du_an,
    ma_du_an:          row.ma_du_an ?? '',
    ten_du_an:         row.ten_du_an,
    hien_thi:          row.hien_thi,
    hoa_hong_mac_dinh: row.hoa_hong_mac_dinh,
    link_tai_lieu:     row.link_tai_lieu ?? undefined,
    chu_dau_tu:        row.chu_dau_tu ?? undefined,
    link_du_an:        row.link_du_an ?? undefined,
    stacking_config:   row.stacking_config ?? undefined,
    truong_nhom:       row.truong_nhom ?? undefined,
    ds_sale:           row.ds_sale ?? undefined,
  };
}

function fromDuAn(da: DuAn) {
  return {
    id_du_an:          da.id_du_an,
    ma_du_an:          da.ma_du_an,
    ten_du_an:         da.ten_du_an,
    hien_thi:          da.hien_thi,
    hoa_hong_mac_dinh: da.hoa_hong_mac_dinh,
    link_tai_lieu:     da.link_tai_lieu,
    chu_dau_tu:        da.chu_dau_tu,
    link_du_an:        da.link_du_an,
    stacking_config:   da.stacking_config,
    truong_nhom:       da.truong_nhom,
    ds_sale:           da.ds_sale,
  };
}
