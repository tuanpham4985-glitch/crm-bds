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
  };
}
