import type { ICustomerRepository, CustomerAssignmentFields, CustomerDashboardFields } from '../interfaces';
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

  // Google Sheets không có projection/COUNT thật — vẫn đọc full list (đã
  // cached ở data-access.ts) rồi rút gọn trong JS. Chỉ nhánh Postgres
  // (customer.repo.ts) mới thật sự giảm transfer — xem NEON_TRANSFER_AUDIT.
  async countByHandoffStatus(status: string): Promise<number> {
    const all = await getKhachHang();
    return all.filter(k => k.trang_thai_ban_giao === status).length;
  }

  async findAssignmentFields(): Promise<CustomerAssignmentFields[]> {
    const all = await getKhachHang();
    return all.map(k => ({
      telesale_phu_trach: k.telesale_phu_trach,
      sale_nhan_khach: k.sale_nhan_khach,
      sale_phu_trach: k.sale_phu_trach,
      du_an: k.du_an,
      trang_thai_ban_giao: k.trang_thai_ban_giao,
    }));
  }

  async findDashboardFields(): Promise<CustomerDashboardFields[]> {
    const all = await getKhachHang();
    return all.map(k => ({ nguon: k.nguon, sale_phu_trach: k.sale_phu_trach, ngay_tao: k.ngay_tao }));
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
