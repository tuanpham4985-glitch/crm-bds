import { NextRequest, NextResponse } from 'next/server';
import { getKhachHang, getPipeline, deleteKhachHang } from '@/lib/data-access';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getCampaignMembershipCustomerRefs } from '@/lib/crm-funnel/campaign';
import { executeBulkDelete, planBulkDelete, type BulkDeleteResultItem } from '@/lib/khach-hang-bulk-delete';

export interface BulkDeleteResult {
  success: boolean;
  deleted: number;
  blocked: number;
  results: BulkDeleteResultItem[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  // Bulk delete bị giới hạn chặt hơn single-delete: chỉ Admin/Chủ tịch (senior
  // leadership), không cho project lead / direct manager như single-delete.
  if (!isCrmAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Chỉ Admin/Ban lãnh đạo mới được xóa hàng loạt khách hàng' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null) as { ids?: unknown } | null;
    const [customers, pipelines, campaignMemberships] = await Promise.all([
      getKhachHang(), getPipeline(), getCampaignMembershipCustomerRefs(),
    ]);
    const { ids, items } = planBulkDelete(body?.ids, customers, pipelines, campaignMemberships);

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: 'Chưa chọn khách hàng nào để xóa' }, { status: 400 });
    }

    const results = await executeBulkDelete(items, deleteKhachHang);
    const deleted = results.filter(item => item.status === 'deleted').length;

    return NextResponse.json({
      success: true,
      deleted,
      blocked: results.length - deleted,
      results,
    } satisfies BulkDeleteResult);
  } catch (error) {
    console.error('KhachHang bulk-delete error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi xóa hàng loạt' }, { status: 500 });
  }
}
