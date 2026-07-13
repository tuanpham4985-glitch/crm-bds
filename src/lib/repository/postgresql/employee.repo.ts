import type { IEmployeeRepository } from '../interfaces';
import type { NhanVien } from '../../types';
import { prisma } from '../../db/client';

export class PostgresEmployeeRepository implements IEmployeeRepository {
  async findAll(): Promise<NhanVien[]> {
    const rows = await prisma.nhanVien.findMany({ orderBy: { ho_ten: 'asc' } });
    return rows.map(toNhanVien);
  }

  async findById(id: string): Promise<NhanVien | null> {
    const row = await prisma.nhanVien.findUnique({ where: { id_nhan_vien: id } });
    return row ? toNhanVien(row) : null;
  }

  async findByEmail(email: string): Promise<NhanVien | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const row = await prisma.nhanVien.findUnique({ where: { email: normalizedEmail } });
    return row ? toNhanVien(row) : null;
  }

  async create(data: NhanVien): Promise<void> {
    await prisma.nhanVien.create({ data: fromNhanVien(data) });
  }

  async update(data: NhanVien): Promise<boolean> {
    try {
      await prisma.nhanVien.update({
        where: { id_nhan_vien: data.id_nhan_vien },
        data: fromNhanVien(data),
      });
      return true;
    } catch {
      return false;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.nhanVien.delete({ where: { id_nhan_vien: id } });
      return true;
    } catch {
      return false;
    }
  }
}

// ── mappers ──────────────────────────────────────────────────

type PgNhanVien = Awaited<ReturnType<typeof prisma.nhanVien.findFirst>>;

function toNhanVien(row: NonNullable<PgNhanVien>): NhanVien {
  return {
    id_nhan_vien:            row.id_nhan_vien,
    ho_ten:                  row.ho_ten,
    so_dien_thoai:           row.so_dien_thoai ?? '',
    email:                   row.email,
    vai_tro:                 row.vai_tro,
    employee_type:           row.employee_type ?? '',
    gioi_tinh:               row.gioi_tinh ?? undefined,
    khu_vuc:                 row.khu_vuc ?? undefined,
    phong_KD:                row.phong_KD ?? undefined,
    ql_truc_tiep:            row.ql_truc_tiep ?? undefined,
    so_cccd:                 row.so_cccd ?? undefined,
    ngay_cap:                row.ngay_cap ?? undefined,
    noi_cap:                 row.noi_cap ?? undefined,
    HKTT:                    row.HKTT ?? undefined,
    ngay_sinh:               row.ngay_sinh ?? undefined,
    ma_so_thue:              row.ma_so_thue ?? undefined,
    so_nguoi_phu_thuoc:      row.so_nguoi_phu_thuoc ?? undefined,
    trang_thai:              row.trang_thai,
    ngay_tao:                row.ngay_tao,
    avatar_url:              row.avatar_url ?? undefined,
    mat_khau:                row.mat_khau ?? undefined,
    so_tk_ngan_hang:         row.so_tk_ngan_hang ?? undefined,
    ten_ngan_hang_thu_huong: row.ten_ngan_hang_thu_huong ?? undefined,
  };
}

function fromNhanVien(nv: NhanVien) {
  return {
    id_nhan_vien:            nv.id_nhan_vien,
    ho_ten:                  nv.ho_ten,
    so_dien_thoai:           nv.so_dien_thoai,
    email:                   nv.email.trim().toLowerCase(),
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
  };
}
