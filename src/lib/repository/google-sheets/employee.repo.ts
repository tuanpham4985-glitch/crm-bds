import type { IEmployeeRepository } from '../interfaces';
import type { NhanVien } from '../../types';
import {
  getNhanVien,
  findNhanVienByEmail,
  addNhanVien,
  updateNhanVien,
  deleteNhanVien,
} from '../../google-sheets';

export class GoogleSheetsEmployeeRepository implements IEmployeeRepository {
  findAll(): Promise<NhanVien[]> {
    return getNhanVien();
  }

  async findById(id: string): Promise<NhanVien | null> {
    const all = await getNhanVien();
    return all.find(e => e.id_nhan_vien === id) ?? null;
  }

  findByEmail(email: string): Promise<NhanVien | null> {
    return findNhanVienByEmail(email);
  }

  create(data: NhanVien): Promise<void> {
    return addNhanVien(data);
  }

  update(data: NhanVien): Promise<boolean> {
    return updateNhanVien(data);
  }

  delete(id: string): Promise<boolean> {
    return deleteNhanVien(id);
  }
}
