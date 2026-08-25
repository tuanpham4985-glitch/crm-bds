import { NextResponse } from 'next/server';
import { getPipeline, deleteKhachHang } from '@/lib/data-access';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getImportBatch, getImportBatchCustomers } from '@/lib/crm-funnel/import-batch';
import { executeBulkDelete, planBulkDelete, type BulkDeleteResultItem } from '@/lib/khach-hang-bulk-delete';
import { assertTransactionalCrm, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

export interface DeleteImportBatchResult {
  success: boolean;
  deleted: number;
  blocked: number;
  results: BulkDeleteResultItem[];
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  // Cùng tier với bulk-delete: chỉ Admin/Chủ tịch, không dựa vào việc ẩn nút ở frontend.
  if (!isCrmAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Chỉ Admin/Ban lãnh đạo mới được xóa đợt import' }, { status: 403 });
  }

  try {
    assertTransactionalCrm();
    const { id } = await context.params;
    const batch = await getImportBatch(id);
    if (!batch) return NextResponse.json({ success: false, error: 'Không tìm thấy đợt import' }, { status: 404 });

    const [customers, pipelines] = await Promise.all([getImportBatchCustomers(id), getPipeline()]);
    // Chỉ xử lý đúng các customer HIỆN vẫn còn thuộc batch (import_batch_id === id) —
    // không bao giờ đụng tới customer trùng SĐT đã tồn tại từ trước hay customer
    // ngoài batch. planBulkDelete tái sử dụng đúng authority với single/bulk-delete.
    const ids = customers.map(customer => customer.id_khach_hang);
    const { items } = planBulkDelete(ids, customers, pipelines);

    const results = await executeBulkDelete(items, deleteKhachHang);
    const deleted = results.filter(item => item.status === 'deleted').length;

    return NextResponse.json({
      success: true,
      deleted,
      blocked: results.length - deleted,
      results,
    } satisfies DeleteImportBatchResult);
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Import batch delete]', error);
    return NextResponse.json({ success: false, error: 'Không thể xóa đợt import' }, { status: 500 });
  }
}
