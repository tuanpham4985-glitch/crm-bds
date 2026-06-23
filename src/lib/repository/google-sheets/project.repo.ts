import type { IProjectRepository } from '../interfaces';
import type { DuAn } from '../../types';
import {
  getDuAn,
  addDuAn,
  updateDuAn,
  deleteDuAn,
} from '../../google-sheets';

export class GoogleSheetsProjectRepository implements IProjectRepository {
  findAll(): Promise<DuAn[]> {
    return getDuAn();
  }

  async findById(id: string): Promise<DuAn | null> {
    const all = await getDuAn();
    return all.find(d => d.id_du_an === id) ?? null;
  }

  create(data: DuAn): Promise<void> {
    return addDuAn(data);
  }

  update(data: DuAn): Promise<boolean> {
    return updateDuAn(data);
  }

  delete(id: string): Promise<boolean> {
    return deleteDuAn(id);
  }
}
