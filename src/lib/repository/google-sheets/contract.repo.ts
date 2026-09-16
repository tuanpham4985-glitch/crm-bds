import type { IContractRepository, HopDongMatchFields } from '../interfaces';
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

  // Sheets không có select cột riêng — trả nguyên findAll() rồi rút gọn field.
  // Nhánh này chỉ chạy khi feature flag 'contracts' tắt Postgres, không phải
  // đường dẫn được tối ưu (đối tượng tối ưu Neon transfer là PostgresContractRepository).
  async findMatchFields(): Promise<HopDongMatchFields[]> {
    const all = await getHopDong();
    return all.map(h => ({
      id: h.id, id_nhan_vien: h.id_nhan_vien, so_hop_dong: h.so_hop_dong,
      contract_type: h.contract_type, ngay_bat_dau: h.ngay_bat_dau, ngay_ket_thuc: h.ngay_ket_thuc,
    }));
  }

  async createMany(data: HopDong[]): Promise<void> {
    for (const d of data) await addHopDong(d);
  }

  async updateDates(id: string, ngay_bat_dau: string, ngay_ket_thuc: string): Promise<boolean> {
    const full = await this.findById(id);
    if (!full) return false;
    return updateHopDong({ ...full, ngay_bat_dau, ngay_ket_thuc });
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
