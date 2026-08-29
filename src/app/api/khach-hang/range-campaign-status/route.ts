import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { previewCustomerRangeCampaignStatus } from '@/lib/crm-funnel/campaign';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// CUSTOMER USED-IN-CAMPAIGN VISIBILITY — preview "Đã vào Campaign X · Chưa
// vào Campaign Y" cho Customer Range ("Chọn khách: Từ x đến y" trên
// /khach-hang). Admin-only, CÙNG gate với resolveCustomerIdsByRange (Customer
// Range → Campaign đưa Customer MỚI vào Campaign là Admin-only) — route này
// hoàn toàn read-only, không ghi gì.
export async function GET(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isCrmAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Chỉ Admin được xem preview theo khoảng STT' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const from = Number(searchParams.get('from'));
    const to = Number(searchParams.get('to'));
    const search = searchParams.get('search') || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const result = await previewCustomerRangeCampaignStatus({ from, to, search, dateFrom, dateTo });
    if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    console.error('[khach-hang range-campaign-status]', error);
    return NextResponse.json({ success: false, error: 'Không thể tính preview' }, { status: 500 });
  }
}
