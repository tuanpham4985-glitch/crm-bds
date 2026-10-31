import { NextResponse } from 'next/server';
import { getNhanVien } from '@/lib/data-access';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getCampaign } from '@/lib/crm-funnel/campaign';
import { isActiveSale } from '@/lib/campaign-sale-eligibility';
import { prisma } from '@/lib/db/client';

/** Sale tự nhận một khách trong Campaign không gắn Dự án (Kho khách chung). */
export async function POST(_request: Request, context: { params: Promise<{ id: string; membershipId: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id: campaignId, membershipId } = await context.params;
    const campaign = await getCampaign(campaignId);
    if (!campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });
    if (campaign.id_du_an) return NextResponse.json({ success: false, error: 'Campaign này đang dùng cơ chế phân Sale theo Dự án' }, { status: 409 });

    const employees = await getNhanVien();
    const employee = employees.find(item => item.id_nhan_vien === user.id_nhan_vien);
    if (!isCrmAdmin(user) && (!employee || !isActiveSale(employee))) {
      return NextResponse.json({ success: false, error: 'Chỉ Sale đang hoạt động mới được nhận khách' }, { status: 403 });
    }
    const result = await prisma.campaignMembership.updateMany({
      where: { id: membershipId, campaign_id: campaignId, assignment_status: 'UNASSIGNED', telesale_id: null },
      data: {
        telesale_id: user.id_nhan_vien,
        telesale_name: user.ho_ten,
        assignment_status: 'ASSIGNED',
        assigned_at: new Date(),
        assigned_by_id: user.id_nhan_vien,
        assigned_by_name: user.ho_ten,
      },
    });
    if (result.count === 0) return NextResponse.json({ success: false, error: 'Khách vừa được Sale khác nhận' }, { status: 409 });
    const membership = await prisma.campaignMembership.findUnique({ where: { id: membershipId } });
    return NextResponse.json({ success: true, data: membership });
  } catch (error) {
    console.error('[Campaign member claim]', error);
    return NextResponse.json({ success: false, error: 'Không thể nhận khách' }, { status: 500 });
  }
}
