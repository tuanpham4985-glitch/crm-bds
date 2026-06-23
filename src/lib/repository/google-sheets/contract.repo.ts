import type { IContractRepository } from '../interfaces';
import type { HopDong } from '../../types';
import {
  getHopDong,
  addHopDong,
  updateHopDong,
  deleteHopDong,
} from '../../google-sheets';

export class GoogleSheetsContractRepository implements IContractRepository {
  findAll(): Promise<HopDong[]> {
    return getHopDong();
  }

  async findById(id: string): Promise<HopDong | null> {
    const all = await getHopDong();
    return all.find(h => h.id === id) ?? null;
  }

  async findByEmployee(employeeId: string): Promise<HopDong[]> {
    const all = await getHopDong();
    return all.filter(h => h.id_nhan_vien === employeeId);
  }

  create(data: HopDong): Promise<void> {
    return addHopDong(data);
  }

  update(data: HopDong): Promise<boolean> {
    return updateHopDong(data);
  }

  delete(id: string): Promise<boolean> {
    return deleteHopDong(id);
  }
}
