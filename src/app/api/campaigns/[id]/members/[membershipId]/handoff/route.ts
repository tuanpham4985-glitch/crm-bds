import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, getNhanVien } from '@/lib/data-access';
import { canManageCampaign, eligibleCampaignSales, getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getCampaign, getCampaignMembers } from '@/lib/crm-funnel/campaign';
import { transitionHandoffTransactional, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// M1B.2 — Campaign-scoped Handoff initiation (CampaignMembership Quan tâm ->
// Leader/Admin explicit "Bàn giao" -> CrmHandoff WAITING_ACCEPTANCE). Không
// auto-create — client (CampaignCskhWorkQueue) chỉ gọi route này qua hành
// động explicit của Leader/Admin. Accept/reject của Sale tiếp tục dùng
// nguyên POST /api/crm/telesale/handoff hiện có (transitionHandoffTransactional
// đã tự phản ánh outcome về đúng CampaignMembership qua campaign_membership_id
// lưu trên CrmHandoff — không cần route/endpoint riêng cho accept/reject).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; membershipId: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id, membershipId } = await context.params;
    const body = await request.json().catch(() => null) as { idempotency_key?: string; sale_id?: string } | null;
    if (!body?.idempotency_key || !body.sale_id) {
      return NextResponse.json({ success: false, error: 'Thiếu idempotency_key hoặc sale_id' }, { status: 400 });
    }

    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });
    // Initiator: chỉ Admin hoặc đúng Campaign.owner (canManageCampaign) —
    // KHÔNG dùng Project.truong_nhom, Sale CSKH không tự initiate được.
    if (!canManageCampaign(user, campaign)) {
      return NextResponse.json({ success: false, error: 'Không có quyền bàn giao Campaign này' }, { status: 403 });
    }

    const members = await getCampaignMembers(id);
    const membership = members.find(item => item.id === membershipId);
    if (!membership) return NextResponse.json({ success: false, error: 'Không tìm thấy membership' }, { status: 404 });
    if (membership.trang_thai_cham_soc !== 'Quan tâm') {
      return NextResponse.json({ success: false, error: 'Membership chưa ở trạng thái Quan tâm, chưa đủ điều kiện bàn giao' }, { status: 400 });
    }

    // Không tin sale_id client gửi lên — resolve + xác thực lại đúng phạm vi
    // (Leader: Project.ds_sale; Admin: toàn bộ active Sale) bằng dữ liệu mới
    // fetch (không cache). Transaction bên dưới re-validate lại lần nữa.
    const [employees, projects] = await Promise.all([getNhanVien(), getDuAn()]);
    const actorIsAdmin = isCrmAdmin(user);
    const eligibility = eligibleCampaignSales(actorIsAdmin, campaign, projects, employees);
    if (eligibility.blocked) {
      return NextResponse.json({ success: false, error: eligibility.reason }, { status: 403 });
    }
    const target = eligibility.sales.find(item => item.id_nhan_vien === body.sale_id);
    if (!target) {
      return NextResponse.json({ success: false, error: 'Sale được chọn không hợp lệ trong phạm vi Campaign này' }, { status: 400 });
    }

    const result = await transitionHandoffTransactional({
      customerId: membership.customer_id,
      actor: user,
      idempotencyKey: body.idempotency_key,
      action: 'handoff',
      targetSale: { id_nhan_vien: target.id_nhan_vien, ho_ten: target.ho_ten },
      campaignHandoff: { membershipId, actorIsAdmin },
    });
    return NextResponse.json({ success: true, data: result.customer, handoff: result.handoff });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    const code = error instanceof Error ? error.message : '';
    const messages: Record<string, { status: number; message: string }> = {
      CUSTOMER_NOT_FOUND: { status: 404, message: 'Không tìm thấy khách hàng' },
      SALE_REQUIRED: { status: 400, message: 'Thiếu Sale nhận bàn giao' },
      MEMBERSHIP_NOT_FOUND: { status: 404, message: 'Không tìm thấy membership' },
      MEMBERSHIP_CUSTOMER_MISMATCH: { status: 409, message: 'Membership không khớp khách hàng' },
      MEMBERSHIP_NOT_CANDIDATE: { status: 409, message: 'Membership không còn ở trạng thái Quan tâm' },
      NOT_CAMPAIGN_OWNER: { status: 403, message: 'Bạn không phải Leader phụ trách Campaign này' },
      TARGET_SALE_INVALID: { status: 400, message: 'Sale được chọn không còn hoạt động hoặc không hợp lệ' },
      NO_SALE_SCOPE: { status: 403, message: 'Campaign chưa có phạm vi Sale được cấu hình' },
      TARGET_SALE_OUT_OF_ROSTER: { status: 403, message: 'Sale được chọn không thuộc roster Dự án của Campaign này' },
      HANDOFF_CONFLICT_OTHER_SOURCE: { status: 409, message: 'Khách hàng đang có Handoff chờ xử lý từ nguồn khác' },
      HANDOFF_ALREADY_ACCEPTED: { status: 409, message: 'Khách hàng đã có Sale phụ trách' },
    };
    const mapped = messages[code];
    if (mapped) return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
    console.error('[Campaign membership handoff]', error);
    return NextResponse.json({ success: false, error: 'Không thể bàn giao khách hàng' }, { status: 500 });
  }
}
