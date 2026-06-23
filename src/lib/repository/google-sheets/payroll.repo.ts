import type { IPayrollRepository, PayrollBatchEntry, BangLuongUpdateFields } from '../interfaces';
import type { BangLuong, PayrollRecord, PayrollItemRecord, PayrollAdjustment } from '../../types';
import {
  getBangLuong,
  getPayrollRecords,
  getPayrollItems,
  getPayrollAdjustments,
  savePayrollBatch,
  updateBangLuong,
  deleteBangLuong,
} from '../../google-sheets';

export class GoogleSheetsPayrollRepository implements IPayrollRepository {
  getBangLuong(): Promise<BangLuong[]> {
    return getBangLuong();
  }

  getPayrollRecords(thang: number, nam: number): Promise<PayrollRecord[]> {
    return getPayrollRecords(thang, nam);
  }

  getPayrollItems(payrollIds: string[]): Promise<PayrollItemRecord[]> {
    return getPayrollItems(payrollIds);
  }

  getPayrollAdjustments(thang: number, nam: number): Promise<PayrollAdjustment[]> {
    return getPayrollAdjustments(thang, nam);
  }

  saveBatch(entries: PayrollBatchEntry[]): Promise<{ savedIds: string[]; errors: string[] }> {
    return savePayrollBatch(entries);
  }

  updateBangLuong(id: string, updates: BangLuongUpdateFields): Promise<boolean> {
    return updateBangLuong(id, updates);
  }

  deleteBangLuong(id: string): Promise<boolean> {
    return deleteBangLuong(id);
  }
}
