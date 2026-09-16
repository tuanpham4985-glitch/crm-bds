import type { IContractRepository, HopDongMatchFields } from '../interfaces';
import type { HopDong } from '../../types';
import { prisma } from '../../db/client';

export class PostgresContractRepository implements IContractRepository {
  async findAll(): Promise<HopDong[]> {
    const rows = await prisma.hopDong.findMany({ orderBy: { ngay_bat_dau: 'desc' } });
    return rows.map(toHopDong);
  }

  // NEON_TRANSFER: chỉ 6 cột cần để đối chiếu/khớp hợp đồng theo mã NV + loại HĐ,
  // thay vì đọc cả hàng (15 cột) như findAll() — dùng cho sync-contract-dates-from-hr.
  async findMatchFields(): Promise<HopDongMatchFields[]> {
    return prisma.hopDong.findMany({
      select: {
        id: true,
        id_nhan_vien: true,
        so_hop_dong: true,
        contract_type: true,
        ngay_bat_dau: true,
        ngay_ket_thuc: true,
      },
    }).then(rows => rows.map(r => ({ ...r, ngay_ket_thuc: r.ngay_ket_thuc ?? '' })));
  }

  // Gộp nhiều bản ghi tạo mới thành 1 round-trip (createMany) thay vì gọi create()
  // riêng lẻ từng dòng — dùng khi đồng bộ hàng loạt (sync-contract-dates-from-hr).
  async createMany(data: HopDong[]): Promise<void> {
    if (data.length === 0) return;
    await prisma.hopDong.createMany({ data: data.map(fromHopDong) });
  }

  // Chỉ ghi 2 cột ngày — tránh phải đọc lại cả hàng (findById) rồi ghi lại cả
  // hàng (update full) chỉ để đổi ngày, như sync-contract-dates-from-hr cần.
  async updateDates(id: string, ngay_bat_dau: string, ngay_ket_thuc: string): Promise<boolean> {
    try {
      await prisma.hopDong.update({ where: { id }, data: { ngay_bat_dau, ngay_ket_thuc } });
      return true;
    } catch {
      return false;
    }
  }

  async findById(id: string): Promise<HopDong | null> {
    const row = await prisma.hopDong.findUnique({ where: { id } });
    return row ? toHopDong(row) : null;
  }

  async findByEmployee(employeeId: string): Promise<HopDong[]> {
    const rows = await prisma.hopDong.findMany({ where: { id_nhan_vien: employeeId } });
    return rows.map(toHopDong);
  }

  async create(data: HopDong): Promise<void> {
    await prisma.hopDong.create({ data: fromHopDong(data) });
  }

  async update(data: HopDong): Promise<boolean> {
    try {
      await prisma.hopDong.update({
        where: { id: data.id },
        data: fromHopDong(data),
      });
      return true;
    } catch {
      return false;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.hopDong.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}

type PgHopDong = Awaited<ReturnType<typeof prisma.hopDong.findFirst>>;

function toHopDong(row: NonNullable<PgHopDong>): HopDong {
  return {
    id:            row.id,
    id_nhan_vien:  row.id_nhan_vien,
    ten_nhan_vien: row.ten_nhan_vien ?? undefined,
    so_hop_dong:   row.so_hop_dong,
    phong_KD:      row.phong_KD ?? undefined,
    employee_type: row.employee_type ?? undefined,
    department:    row.department as HopDong['department'],
    contract_type: row.contract_type,
    template_file: row.template_file ?? '',
    ngay_bat_dau:  row.ngay_bat_dau,
    ngay_ket_thuc: row.ngay_ket_thuc ?? '',
    luong_co_ban:  row.luong_co_ban,
    ghi_chu:       row.ghi_chu ?? '',
    created_at:    row.created_at.toISOString(),
  };
}

function fromHopDong(hd: HopDong) {
  return {
    id:            hd.id,
    id_nhan_vien:  hd.id_nhan_vien,
    ten_nhan_vien: hd.ten_nhan_vien,
    so_hop_dong:   hd.so_hop_dong,
    phong_KD:      hd.phong_KD,
    employee_type: hd.employee_type,
    department:    hd.department,
    contract_type: hd.contract_type,
    template_file: hd.template_file,
    ngay_bat_dau:  hd.ngay_bat_dau,
    ngay_ket_thuc: hd.ngay_ket_thuc,
    luong_co_ban:  hd.luong_co_ban,
    ghi_chu:       hd.ghi_chu,
  };
}
