import type { ICrmTaskRepository } from '../interfaces';
import type { CongViec } from '../../types';
import {
  getCongViec,
  addCongViec,
  updateCongViec,
  deleteCongViec,
} from '../../google-sheets';

export class GoogleSheetsCrmTaskRepository implements ICrmTaskRepository {
  findAll(): Promise<CongViec[]> {
    return getCongViec();
  }

  async findById(id: string): Promise<CongViec | null> {
    const all = await getCongViec();
    return all.find(cv => cv.id_cong_viec === id) ?? null;
  }

  create(data: CongViec): Promise<void> {
    return addCongViec(data);
  }

  update(data: CongViec): Promise<boolean> {
    return updateCongViec(data);
  }

  delete(id: string): Promise<boolean> {
    return deleteCongViec(id);
  }
}
