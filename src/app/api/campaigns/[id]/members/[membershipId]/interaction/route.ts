import { NextRequest, NextResponse } from 'next/server';
import { getNhanVien } from '@/lib/data-access';
import { canManageMembership, getCrmSessionUser, isMembershipDirectManager } from '@/lib/crm-auth';
import { getCampaign, getCampaignMembers } from '@/lib/crm-funnel/campaign';
import { recordMembershipInteractionTransactional } from '@/lib/crm-funnel/membership-workflow';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';
import type { MucDoQuanTam, TrangThaiChamSoc } from '@/lib/types';

const STATUSES: TrangThaiChamSoc[] = ['Chưa gọi', 'Không nghe máy', 'Gọi lại', 'Đã liên hệ', 'Quan tâm', 'Không phù hợp', 'Sai số'];
const INTERESTS: MucDoQuanTam[] = ['Chưa xác định', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; membershipId: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id, membershipId } = await context.params;
    const body = await request.json().catch(() => null) as {
      idempotency_key?: string; ket_qua?: TrangThaiChamSoc; muc_do_quan_tam?: MucDoQuanTam; ghi_chu?: string; ngay_lien_he_tiep?: string;
    } | null;
    if (!body?.idempotency_key || !body.ket_qua || !STATUSES.includes(body.ket_qua)) {
      return NextResponse.json({ success: false, error: 'Thiếu idempotency_key hoặc kết quả chăm sóc' }, { status: 400 });
    }
    if (body.muc_do_quan_tam && !INTERESTS.includes(body.muc_do_quan_tam)) {
      return NextResponse.json({ success: false, error: 'Mức độ quan tâm không hợp lệ' }, { status: 400 });
    }

    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });
    const members = await getCampaignMembers(id);
    const membership = members.find(item => item.id === membershipId);
    if (!membership) return NextResponse.json({ success: false, error: 'Không tìm thấy membership' }, { status: 404 });

    const employees = await getNhanVien();
    if (!canManageMembership(user, membership, campaign) && !isMembershipDirectManager(user, membership, employees)) {
      return NextResponse.json({ success: false, error: 'Khách hàng này không được giao cho bạn trong Campaign' }, { status: 403 });
    }

    const result = await recordMembershipInteractionTransactional({
      membershipId,
      actor: user,
      idempotencyKey: body.idempotency_key,
      result: body.ket_qua,
      interest: body.muc_do_quan_tam || 'Chưa xác định',
      note: String(body.ghi_chu || '').trim(),
      nextContact: body.ngay_lien_he_tiep || undefined,
    });
    return NextResponse.json({ success: true, data: result.membership, idempotent: result.idempotent });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    const code = error instanceof Error ? error.message : '';
    if (code === 'MEMBERSHIP_NOT_FOUND') return NextResponse.json({ success: false, error: 'Không tìm thấy membership' }, { status: 404 });
    console.error('[Campaign membership interaction]', error);
    return NextResponse.json({ success: false, error: 'Không thể lưu kết quả chăm sóc' }, { status: 500 });
  }
}
