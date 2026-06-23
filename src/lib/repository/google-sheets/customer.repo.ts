import type { ICustomerRepository } from '../interfaces';
import type { KhachHang } from '../../types';
import {
  getKhachHang,
  addKhachHang,
  addKhachHangBatch,
  updateKhachHang,
  deleteKhachHang,
} from '../../google-sheets';

export class GoogleSheetsCustomerRepository implements ICustomerRepository {
  findAll(): Promise<KhachHang[]> {
    return getKhachHang();
  }

  async findById(id: string): Promise<KhachHang | null> {
    const all = await getKhachHang();
    return all.find(k => k.id_khach_hang === id) ?? null;
  }

  create(data: KhachHang): Promise<void> {
    return addKhachHang(data);
  }

  createBatch(data: KhachHang[]): Promise<void> {
    return addKhachHangBatch(data);
  }

  update(data: KhachHang): Promise<boolean> {
    return updateKhachHang(data);
  }

  delete(id: string): Promise<boolean> {
    return deleteKhachHang(id);
  }
}
