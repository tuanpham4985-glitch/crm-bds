import type { IPayrollRepository, PayrollBatchEntry, BangLuongUpdateFields } from '../interfaces';
import type { BangLuong, PayrollRecord, PayrollItemRecord, PayrollAdjustment } from '../../types';
import { prisma } from '../../db/client';
import type { PrismaClient } from '../../../generated/prisma/client';
import { randomUUID } from 'crypto';

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export class PostgresPayrollRepository implements IPayrollRepository {
  async getBangLuong(): Promise<BangLuong[]> {
    const rows = await prisma.bangLuong.findMany({ orderBy: [{ nam: 'desc' }, { thang: 'desc' }] });
    return rows.map(toBangLuong);
  }

  async getPayrollRecords(thang: number, nam: number): Promise<PayrollRecord[]> {
    const rows = await prisma.payrollRecord.findMany({ where: { thang, nam } });
    return rows.map(toPayrollRecord);
  }

  async getPayrollItems(payrollIds: string[]): Promise<PayrollItemRecord[]> {
    const rows = await prisma.payrollItemRecord.findMany({
      where: { payroll_id: { in: payrollIds } },
    });
    return rows.map(toPayrollItem);
  }

  async getPayrollAdjustments(thang: number, nam: number): Promise<PayrollAdjustment[]> {
    const rows = await prisma.payrollAdjustment.findMany({ where: { thang, nam } });
    return rows.map(toAdjustment);
  }

  async saveBatch(
    entries: PayrollBatchEntry[]
  ): Promise<{ savedIds: string[]; errors: string[] }> {
    const savedIds: string[] = [];
    const errors: string[] = [];

    for (const { payroll, items } of entries) {
      const payrollId = `PR_${Date.now()}_${randomUUID().slice(0, 5)}`;
      try {
        await prisma.$transaction(async (tx: TxClient) => {
          await tx.payrollRecord.create({
            data: {
              id:                 payrollId,
              id_nhan_vien:       payroll.id_nhan_vien,
              thang:              payroll.thang,
              nam:                payroll.nam,
              gross:              payroll.gross,
              total_deduction:    payroll.total_deduction,
              net:                payroll.net,
              luong_dong_bh:      payroll.luong_dong_bh,
              thu_nhap_chiu_thue: payroll.thu_nhap_chiu_thue,
              tong_chi_phi:       payroll.tong_chi_phi,
              trang_thai:         payroll.trang_thai,
              locked_at:          payroll.locked_at,
            },
          });
          if (items.length > 0) {
            await tx.payrollItemRecord.createMany({
              data: items.map(item => ({
                id:          randomUUID(),
                payroll_id:  payrollId,
                loai_khoan:  item.loai_khoan,
                nhom:        item.nhom,
                so_tien:     item.so_tien,
                ghi_chu:     item.ghi_chu,
                tinh_bhxh:   item.tinh_bhxh,
                tinh_thue:   item.tinh_thue,
              })),
            });
          }
        });
        savedIds.push(payrollId);
      } catch (err) {
        errors.push(`${payroll.id_nhan_vien}/${payroll.thang}-${payroll.nam}: ${String(err)}`);
      }
    }
    return { savedIds, errors };
  }

  async addBangLuong(bl: Omit<BangLuong, 'id' | 'created_at'>): Promise<string> {
    const id = `BL_${Date.now()}`;
    await prisma.bangLuong.create({
      data: {
        id,
        id_nhan_vien:             bl.id_nhan_vien,
        thang:                    bl.thang,
        nam:                      bl.nam,
        luong_co_ban:             bl.luong_co_ban,
        doanh_thu:                bl.doanh_thu,
        hoa_hong:                 bl.hoa_hong,
        thuong:                   bl.thuong,
        phat:                     bl.phat,
        so_ngay_cong_chuan:       bl.so_ngay_cong_chuan,
        so_ngay_lam_viec_thuc_te: bl.so_ngay_lam_viec_thuc_te,
        so_ngay_nghi_khong_luong: bl.so_ngay_nghi_khong_luong,
        so_gio_ot:                bl.so_gio_ot,
        salary_by_day:            bl.salary_by_day,
        ot_pay:                   bl.ot_pay,
        bao_hiem:                 bl.bao_hiem,
        bh_company:               bl.bh_company,
        thue:                     bl.thue,
        tong_luong:               bl.tong_luong,
        gross:                    bl.gross,
        isProbation:              bl.isProbation,
        isCollaborator:           bl.isCollaborator,
        isIntern:                 bl.isIntern,
        trang_thai:               bl.trang_thai || 'draft',
      },
    });
    return id;
  }

  async updateBangLuong(id: string, updates: BangLuongUpdateFields): Promise<boolean> {
    try {
      await prisma.bangLuong.update({ where: { id }, data: updates });
      return true;
    } catch {
      return false;
    }
  }

  async deleteBangLuong(id: string): Promise<boolean> {
    try {
      await prisma.bangLuong.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}

// ── mappers ──────────────────────────────────────────────────

type PgBangLuong = Awaited<ReturnType<typeof prisma.bangLuong.findFirst>>;
type PgPayrollRecord = Awaited<ReturnType<typeof prisma.payrollRecord.findFirst>>;
type PgPayrollItem = Awaited<ReturnType<typeof prisma.payrollItemRecord.findFirst>>;
type PgAdjustment = Awaited<ReturnType<typeof prisma.payrollAdjustment.findFirst>>;

function toBangLuong(row: NonNullable<PgBangLuong>): BangLuong {
  return {
    id:                       row.id,
    id_nhan_vien:             row.id_nhan_vien,
    thang:                    row.thang,
    nam:                      row.nam,
    luong_co_ban:             row.luong_co_ban,
    doanh_thu:                row.doanh_thu,
    hoa_hong:                 row.hoa_hong,
    thuong:                   row.thuong,
    phat:                     row.phat,
    so_ngay_cong_chuan:       row.so_ngay_cong_chuan,
    so_ngay_lam_viec_thuc_te: row.so_ngay_lam_viec_thuc_te,
    so_ngay_nghi_khong_luong: row.so_ngay_nghi_khong_luong,
    so_gio_ot:                row.so_gio_ot,
    salary_by_day:            row.salary_by_day,
    ot_pay:                   row.ot_pay,
    bao_hiem:                 row.bao_hiem,
    bh_company:               row.bh_company,
    thue:                     row.thue,
    tong_luong:               row.tong_luong,
    gross:                    row.gross ?? undefined,
    isProbation:              row.isProbation,
    isCollaborator:           row.isCollaborator,
    isIntern:                 row.isIntern,
    trang_thai:               row.trang_thai as BangLuong['trang_thai'],
    created_at:               row.created_at.toISOString(),
  };
}

function toPayrollRecord(row: NonNullable<PgPayrollRecord>): PayrollRecord {
  return {
    id:                 row.id,
    id_nhan_vien:       row.id_nhan_vien,
    thang:              row.thang,
    nam:                row.nam,
    gross:              row.gross,
    total_deduction:    row.total_deduction,
    net:                row.net,
    luong_dong_bh:      row.luong_dong_bh,
    thu_nhap_chiu_thue: row.thu_nhap_chiu_thue,
    tong_chi_phi:       row.tong_chi_phi,
    trang_thai:         row.trang_thai as PayrollRecord['trang_thai'],
    locked_at:          row.locked_at ?? undefined,
    created_at:         row.created_at.toISOString(),
  };
}

function toPayrollItem(row: NonNullable<PgPayrollItem>): PayrollItemRecord {
  return {
    id:         row.id,
    payroll_id: row.payroll_id,
    loai_khoan: row.loai_khoan,
    nhom:       row.nhom as PayrollItemRecord['nhom'],
    so_tien:    row.so_tien,
    ghi_chu:    row.ghi_chu ?? '',
    tinh_bhxh:  row.tinh_bhxh,
    tinh_thue:  row.tinh_thue,
  };
}

function toAdjustment(row: NonNullable<PgAdjustment>): PayrollAdjustment {
  return {
    id:          row.id,
    id_nhan_vien: row.id_nhan_vien,
    thang:       row.thang,
    nam:         row.nam,
    type:        row.type as PayrollAdjustment['type'],
    amount:      row.amount,
    reason:      row.reason ?? '',
  };
}
