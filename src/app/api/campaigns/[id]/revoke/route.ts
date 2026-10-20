import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, getNhanVien } from '@/lib/data-access';
import { canManageCampaign, eligibleCampaignSales, getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { countRevocableMemberships, getCampaign, revokeSaleMemberships, type TelesaleRef } from '@/lib/crm-funnel/campaign';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// "Thu hồi" trên bảng Tiến độ Sale — lấy lại khách CHƯA GỌI lần nào của 1 Sale
// rồi chuyển cho Sale khác (to_telesale_name) hoặc trả về "Chưa phân".
// preview: true -> chỉ đếm, không ghi. Cùng gate với Phân Sale (canManageCampaign)
// và cùng phạm vi Sale hợp lệ (eligibleCampaignSales) với /distribute.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });
    if (!canManageCampaign(user, campaign)) {
      return NextResponse.json({ success: false, error: 'Không có quyền thu hồi khách của Campaign này' }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { telesale_id?: unknown; to_telesale_name?: unknown; preview?: unknown } | null;
    const fromTelesaleId = typeof body?.telesale_id === 'string' ? body.telesale_id.trim() : '';
    if (!fromTelesaleId) return NextResponse.json({ success: false, error: 'Thiếu Sale cần thu hồi' }, { status: 400 });

    if (body?.preview === true) {
      return NextResponse.json({ success: true, data: { count: await countRevocableMemberships(id, fromTelesaleId) } });
    }

    let to: TelesaleRef | null = null;
    const toName = typeof body?.to_telesale_name === 'string' ? body.to_telesale_name.trim() : '';
    if (toName) {
      const [employees, projects] = await Promise.all([getNhanVien(), getDuAn()]);
      const eligibility = eligibleCampaignSales(isCrmAdmin(user), campaign, projects, employees);
      if (eligibility.blocked) return NextResponse.json({ success: false, error: eligibility.reason }, { status: 403 });
      const target = eligibility.sales.find(item => item.ho_ten === toName);
      if (!target) {
        return NextResponse.json({ success: false, error: `"${toName}" không phải Sale hợp lệ trong phạm vi Campaign này` }, { status: 400 });
      }
      if (target.id_nhan_vien === fromTelesaleId) {
        return NextResponse.json({ success: false, error: 'Sale nhận phải khác Sale bị thu hồi' }, { status: 400 });
      }
      to = { id_nhan_vien: target.id_nhan_vien, ho_ten: target.ho_ten };
    }

    const result = await revokeSaleMemberships({ campaignId: id, fromTelesaleId, to, actor: user });
    return NextResponse.json({ success: true, data: { revoked: result.revoked, toName: to?.ho_ten ?? null } });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Campaign revoke]', error);
    return NextResponse.json({ success: false, error: 'Không thể thu hồi khách' }, { status: 500 });
  }
}
