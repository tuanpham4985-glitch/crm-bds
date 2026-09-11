import type { IAttendanceOutsideRepository } from '../interfaces';
import type { ChamCongNgoai } from '../../types';
import {
  getChamCongNgoai,
  addChamCongNgoai,
  updateChamCongNgoaiStatus,
  deleteChamCongNgoai,
  deleteChamCongNgoaiById,
} from '../../google-sheets';

export class GoogleSheetsAttendanceOutsideRepository
  implements IAttendanceOutsideRepository
{
  findAll(employeeId?: string, qlTrucTiep?: string): Promise<ChamCongNgoai[]> {
    return getChamCongNgoai(employeeId, qlTrucTiep);
  }

  async findById(id: string): Promise<ChamCongNgoai | null> {
    const all = await getChamCongNgoai();
    return all.find(c => c.id === id) ?? null;
  }

  async countPending(employeeId?: string, qlTrucTiep?: string, excludeEmployeeId?: string): Promise<number> {
    const all = await getChamCongNgoai(employeeId, qlTrucTiep);
    return all.filter(c => c.trang_thai === 'cho_duyet' && (!excludeEmployeeId || c.id_nhan_vien !== excludeEmployeeId)).length;
  }

  create(
    data: Omit<ChamCongNgoai, 'id' | 'created_at' | 'trang_thai' | 'nguoi_duyet' | 'ghi_chu_duyet'>
  ): Promise<ChamCongNgoai> {
    return addChamCongNgoai(data);
  }

  updateStatus(
    id: string,
    status: 'da_duyet' | 'tu_choi',
    approver: string,
    note?: string,
    requiredQL?: string
  ): Promise<boolean | 'forbidden'> {
    return updateChamCongNgoaiStatus(id, status, approver, note, requiredQL);
  }

  delete(id: string, employeeId: string): Promise<boolean> {
    return deleteChamCongNgoai(id, employeeId);
  }

  deleteAny(id: string): Promise<boolean> {
    return deleteChamCongNgoaiById(id);
  }
}
