import { NextResponse } from 'next/server';
import { getDuAn, findKhachHangById, updateKhachHang } from '@/lib/data-access';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getCampaign } from '@/lib/crm-funnel/campaign';
import { prisma } from '@/lib/db/client';

/**
 * Gán Dự án cho khách trong Campaign CSKH.
 * Admin/Leader được sửa toàn Campaign; Sale chỉ được sửa membership đã phân
 * cho chính mình. Không mở rộng quyền PUT /api/khach-hang dùng chung.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string; membershipId: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });

  try {
    const { id: campaignId, membershipId } = await context.params;
    const campaign = await getCampaign(campaignId);
    if (!campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });

    const membership = await prisma.campaignMembership.findUnique({
      where: { id: membershipId },
      select: { id: true, campaign_id: true, customer_id: true, telesale_id: true },
    });
    if (!membership || membership.campaign_id !== campaignId) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy khách trong Campaign' }, { status: 404 });
    }
    const canEdit = isCrmAdmin(user) || campaign.owner_name === user.ho_ten || membership.telesale_id === user.id_nhan_vien;
    if (!canEdit) return NextResponse.json({ success: false, error: 'Bạn không có quyền cập nhật Dự án cho khách này' }, { status: 403 });

    const body = await request.json().catch(() => null) as { project_id?: unknown } | null;
    const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : '';
    if (!projectId) return NextResponse.json({ success: false, error: 'Phải chọn Dự án' }, { status: 400 });
    const project = (await getDuAn()).find(item => item.id_du_an === projectId && item.hien_thi !== 0);
    if (!project) return NextResponse.json({ success: false, error: 'Dự án không tồn tại hoặc đang ẩn' }, { status: 400 });

    const customer = await findKhachHangById(membership.customer_id);
    if (!customer) return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 });
    const updated = { ...customer, du_an: project.ten_du_an };
    await updateKhachHang(updated);
    return NextResponse.json({ success: true, data: { customer_id: customer.id_khach_hang, du_an: project.ten_du_an } });
  } catch (error) {
    console.error('[Campaign member project update]', error);
    return NextResponse.json({ success: false, error: 'Không thể cập nhật Dự án' }, { status: 500 });
  }
}
