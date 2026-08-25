// Server-only: dùng customerDeleteBlockReason (crm-auth.ts, phụ thuộc next/headers)
// nên module này chỉ được import từ route handler, không import trực tiếp từ
// Client Component. UI selection helpers nằm ở khach-hang-selection.ts (client-safe).
import type { KhachHang, Pipeline } from './types';
import { customerDeleteBlockReason } from './crm-auth';

export interface BulkDeletePlanItem {
  id: string;
  ten_KH: string;
  status: 'ready' | 'blocked' | 'not_found';
  reason?: string;
}

/**
 * Chuẩn hoá + phân loại danh sách id trước khi xóa. Đây là bước duy nhất
 * quyết định record nào được xóa — dùng chung authority (customerDeleteBlockReason)
 * với single-delete, không tạo business rule song song. KHÔNG tự suy diễn thêm id
 * nào ngoài những gì client đã chọn tường minh (không "xóa tất cả theo filter").
 */
export function planBulkDelete(
  rawIds: unknown,
  customers: readonly KhachHang[],
  pipelines: readonly Pipeline[],
): { ids: string[]; items: BulkDeletePlanItem[] } {
  const ids = Array.isArray(rawIds)
    ? [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
    : [];

  const customerMap = new Map(customers.map(customer => [customer.id_khach_hang, customer]));
  const items: BulkDeletePlanItem[] = ids.map(id => {
    const customer = customerMap.get(id);
    if (!customer) return { id, ten_KH: '', status: 'not_found', reason: 'Không tìm thấy khách hàng' };
    const blockReason = customerDeleteBlockReason(customer, pipelines as Pipeline[]);
    if (blockReason) return { id, ten_KH: customer.ten_KH, status: 'blocked', reason: blockReason };
    return { id, ten_KH: customer.ten_KH, status: 'ready' };
  });

  return { ids, items };
}
