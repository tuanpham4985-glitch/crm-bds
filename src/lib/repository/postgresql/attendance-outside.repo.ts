import type { IAttendanceOutsideRepository } from '../interfaces';
import type { ChamCongNgoai } from '../../types';
import { prisma } from '../../db/client';

export class PostgresAttendanceOutsideRepository
  implements IAttendanceOutsideRepository
{
  async findAll(employeeId?: string, qlTrucTiep?: string): Promise<ChamCongNgoai[]> {
    const rows = await prisma.chamCongNgoai.findMany({
      where: {
        ...(employeeId ? { id_nhan_vien: employeeId } : {}),
        ...(qlTrucTiep ? { ql_truc_tiep: qlTrucTiep } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map(toChamCongNgoai);
  }

  async findById(id: string): Promise<ChamCongNgoai | null> {
    const row = await prisma.chamCongNgoai.findUnique({ where: { id } });
    return row ? toChamCongNgoai(row) : null;
  }

  async countPending(employeeId?: string): Promise<number> {
    return prisma.chamCongNgoai.count({
      where: {
        trang_thai: 'cho_duyet',
        ...(employeeId ? { id_nhan_vien: employeeId } : {}),
      },
    });
  }

  async create(
    data: Omit<ChamCongNgoai, 'id' | 'created_at' | 'trang_thai' | 'nguoi_duyet' | 'ghi_chu_duyet'>
  ): Promise<ChamCongNgoai> {
    const id = `CCN_${Date.now()}`;
    const row = await prisma.chamCongNgoai.create({
      data: {
        id,
        id_nhan_vien:      data.id_nhan_vien,
        ho_ten:            data.ho_ten,
        ngay:              data.ngay,
        gio_bat_dau:       data.gio_bat_dau,
        gio_ket_thuc:      data.gio_ket_thuc,
        du_an_khach_hang:  data.du_an_khach_hang,
        dia_diem:          data.dia_diem,
        ghi_chu:           data.ghi_chu,
        hinh_anh:          data.hinh_anh,
        vi_tri_gps:        data.vi_tri_gps,
        ql_truc_tiep:      data.ql_truc_tiep,
        trang_thai:        'cho_duyet',
      },
    });
    return toChamCongNgoai(row);
  }

  async updateStatus(
    id: string,
    status: 'da_duyet' | 'tu_choi',
    approver: string,
    note?: string,
    requiredQL?: string
  ): Promise<boolean | 'forbidden'> {
    const existing = await prisma.chamCongNgoai.findUnique({ where: { id } });
    if (!existing) return false;
    if (requiredQL && existing.ql_truc_tiep !== requiredQL) return 'forbidden';
    try {
      await prisma.chamCongNgoai.update({
        where: { id },
        data: { trang_thai: status, nguoi_duyet: approver, ghi_chu_duyet: note ?? '' },
      });
      return true;
    } catch {
      return false;
    }
  }

  async delete(id: string, employeeId: string): Promise<boolean> {
    try {
      const res = await prisma.chamCongNgoai.deleteMany({
        where: { id, id_nhan_vien: employeeId },
      });
      return res.count > 0;
    } catch {
      return false;
    }
  }

  async deleteAny(id: string): Promise<boolean> {
    try {
      const res = await prisma.chamCongNgoai.deleteMany({ where: { id } });
      return res.count > 0;
    } catch {
      return false;
    }
  }
}

type PgChamCong = Awaited<ReturnType<typeof prisma.chamCongNgoai.findFirst>>;

function toChamCongNgoai(row: NonNullable<PgChamCong>): ChamCongNgoai {
  return {
    id:               row.id,
    id_nhan_vien:     row.id_nhan_vien,
    ho_ten:           row.ho_ten ?? undefined,
    ngay:             row.ngay,
    gio_bat_dau:      row.gio_bat_dau,
    gio_ket_thuc:     row.gio_ket_thuc,
    du_an_khach_hang: row.du_an_khach_hang,
    dia_diem:         row.dia_diem ?? '',
    ghi_chu:          row.ghi_chu ?? undefined,
    hinh_anh:         row.hinh_anh ?? undefined,
    vi_tri_gps:       row.vi_tri_gps ?? undefined,
    ql_truc_tiep:     row.ql_truc_tiep ?? undefined,
    trang_thai:       row.trang_thai as ChamCongNgoai['trang_thai'],
    nguoi_duyet:      row.nguoi_duyet ?? undefined,
    ghi_chu_duyet:    row.ghi_chu_duyet ?? undefined,
    created_at:       row.created_at.toISOString(),
  };
}
