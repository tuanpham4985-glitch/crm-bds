import { NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getCampaignDeletePreflight } from '@/lib/crm-funnel/campaign';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// Admin Test Data Cleanup — preflight READ-ONLY trước khi Admin bấm xóa
// Campaign thật (DELETE /api/campaigns/[id]). Không xóa gì ở đây, chỉ trả
// Campaign + số membership + mẫu customer/sale + blocked/reason để UI hiển
// thị confirmation đúng trước khi gọi DELETE.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isCrmAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Chỉ Admin được xem preflight xóa Campaign' }, { status: 403 });
  }
  try {
    const { id } = await context.params;
    const preflight = await getCampaignDeletePreflight(id);
    if (!preflight.campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });
    return NextResponse.json({ success: true, data: preflight });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Campaign delete preflight]', error);
    return NextResponse.json({ success: false, error: 'Không thể kiểm tra Campaign trước khi xóa' }, { status: 500 });
  }
}
