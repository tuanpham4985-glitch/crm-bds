import { NextResponse } from 'next/server';
import { canManageCampaign, getCrmSessionUser } from '@/lib/crm-auth';
import { getCampaign, getCampaignMembersWithCustomers } from '@/lib/crm-funnel/campaign';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';
import { sortMembershipsNewestAssignedFirst } from '@/lib/campaign-cskh-range';
import { isCskhReportingViewerEmail } from '@/lib/crm-reporting-access';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });
    // ROLE_SCOPED_QUERY_AUDIT remediation — Admin/Campaign owner thấy toàn bộ
    // membership; Telesale khác chỉ thấy đúng membership được gán cho mình —
    // KHÔNG suy diễn theo Customer.du_an. Trước đây: đọc TOÀN BỘ campaign rồi
    // .filter() ở đây (APP_FILTER_AFTER_BROAD_READ). Giờ: đẩy scope xuống
    // THẲNG Prisma WHERE (telesale_id) cho actor không quản lý toàn Campaign —
    // Postgres chỉ trả đúng M membership của actor thay vì N của cả campaign
    // rồi mới lọc. KHÔNG đổi authority/kết quả cuối cùng actor nhìn thấy.
    // Campaign không gắn Dự án là "Kho khách chung": mọi Sale có quyền vào
    // CSKH được nhìn toàn bộ danh sách để tự nhận khách, thay vì bị lọc theo
    // telesale_id ngay từ bước đọc.
    const hasFullView = canManageCampaign(user, campaign) || !campaign.id_du_an || isCskhReportingViewerEmail(user.email);
    const scopedMembers = await getCampaignMembersWithCustomers(id, hasFullView ? undefined : user.id_nhan_vien);
    // Sale: khách mới được phân lên đầu (không bị chìm ở trang cuối). Admin/
    // Leader giữ created_at ASC — thứ tự tham chiếu của "Chọn khách: Từ x đến y".
    const members = hasFullView ? scopedMembers : sortMembershipsNewestAssignedFirst(scopedMembers);
    return NextResponse.json({ success: true, data: { campaign, members } });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Campaign members list]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải danh sách membership' }, { status: 500 });
  }
}
