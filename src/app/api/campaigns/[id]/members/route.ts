import { NextResponse } from 'next/server';
import { canManageCampaign, getCrmSessionUser } from '@/lib/crm-auth';
import { getCampaign, getCampaignMembersWithCustomers } from '@/lib/crm-funnel/campaign';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

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
    const hasFullView = canManageCampaign(user, campaign);
    const members = await getCampaignMembersWithCustomers(id, hasFullView ? undefined : user.id_nhan_vien);
    return NextResponse.json({ success: true, data: { campaign, members } });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Campaign members list]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải danh sách membership' }, { status: 500 });
  }
}
