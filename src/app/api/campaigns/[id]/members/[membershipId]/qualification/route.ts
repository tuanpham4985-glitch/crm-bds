import { NextRequest, NextResponse } from 'next/server';
import { getNhanVien } from '@/lib/data-access';
import { canManageMembership, getCrmSessionUser, isMembershipDirectManager } from '@/lib/crm-auth';
import { getCampaign, getCampaignMembers } from '@/lib/crm-funnel/campaign';
import { updateMembershipQualificationTransactional, type MembershipQualificationPatchInput } from '@/lib/crm-funnel/membership-workflow';
import { validateQualificationInput } from '@/lib/crm-funnel/qualification-input';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; membershipId: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id, membershipId } = await context.params;
    const body = await request.json().catch(() => null) as (Record<string, unknown> & { idempotency_key?: string }) | null;
    if (!body?.idempotency_key) return NextResponse.json({ success: false, error: 'Thiếu idempotency_key' }, { status: 400 });
    const validationError = validateQualificationInput(body);
    if (validationError) return NextResponse.json({ success: false, error: validationError }, { status: 400 });

    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });
    const members = await getCampaignMembers(id);
    const membership = members.find(item => item.id === membershipId);
    if (!membership) return NextResponse.json({ success: false, error: 'Không tìm thấy membership' }, { status: 404 });

    const employees = await getNhanVien();
    if (!canManageMembership(user, membership, campaign) && !isMembershipDirectManager(user, membership, employees)) {
      return NextResponse.json({ success: false, error: 'Khách hàng này không được giao cho bạn trong Campaign' }, { status: 403 });
    }

    const patch: MembershipQualificationPatchInput = {
      san_pham_quan_tam: body.san_pham_quan_tam ? String(body.san_pham_quan_tam) : null,
      nhu_cau: body.nhu_cau ? String(body.nhu_cau) : null,
      ngan_sach_min: body.ngan_sach_min !== undefined && body.ngan_sach_min !== '' ? Number(body.ngan_sach_min) : null,
      ngan_sach_max: body.ngan_sach_max !== undefined && body.ngan_sach_max !== '' ? Number(body.ngan_sach_max) : null,
      muc_dich: body.muc_dich ? String(body.muc_dich) : null,
      thoi_gian_du_kien: body.thoi_gian_du_kien ? String(body.thoi_gian_du_kien) : null,
      phuong_an_tai_chinh: body.phuong_an_tai_chinh ? String(body.phuong_an_tai_chinh) : null,
      khu_vuc_yeu_cau: body.khu_vuc_yeu_cau ? String(body.khu_vuc_yeu_cau) : null,
      muc_do_quan_tam: body.muc_do_quan_tam ? (String(body.muc_do_quan_tam) as MembershipQualificationPatchInput['muc_do_quan_tam']) : null,
      hanh_dong_tiep_theo: body.hanh_dong_tiep_theo ? String(body.hanh_dong_tiep_theo) : null,
    };

    const result = await updateMembershipQualificationTransactional({
      membershipId, actor: user, idempotencyKey: body.idempotency_key, patch,
    });
    return NextResponse.json({ success: true, data: result.membership, score: result.score });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    const code = error instanceof Error ? error.message : '';
    if (code === 'MEMBERSHIP_NOT_FOUND') return NextResponse.json({ success: false, error: 'Không tìm thấy membership' }, { status: 404 });
    console.error('[Campaign membership qualification]', error);
    return NextResponse.json({ success: false, error: 'Không thể lưu qualification' }, { status: 500 });
  }
}
