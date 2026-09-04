import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { canActOnPrivateGroupCustomer } from '@/lib/private-group-auth';
import {
  getPrivateGroup, getPrivateGroupCustomerById, PrivateGroupCustomerNotFoundError,
  recordPrivateGroupCustomerInteractionTransactional,
} from '@/lib/crm-funnel/private-group';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';
import type { MucDoQuanTam, TrangThaiChamSoc } from '@/lib/types';

const STATUSES: TrangThaiChamSoc[] = ['Chưa gọi', 'Không nghe máy', 'Gọi lại', 'Đã liên hệ', 'Quan tâm', 'Không phù hợp', 'Sai số'];
const INTERESTS: MucDoQuanTam[] = ['Chưa xác định', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];

// POST /api/private-groups/[id]/customers/[relationId]/interaction — "Chăm
// sóc" 1 Customer trong Nhóm riêng. Gate qua canActOnPrivateGroupCustomer
// (WRITE/ACT — Admin/Leader của ĐÚNG group này, hoặc chính actor là
// entered_by/assigned_to của ĐÚNG quan hệ này) — CỐ Ý KHÔNG dùng
// canViewGroupCustomer (đó là READ đã mở rộng theo group membership): Sale
// thành viên khác trong cùng group XEM được relation này nhưng KHÔNG được
// act nếu không phải entered_by/assigned_to, KHÔNG phải nút UI ẩn/hiện quyết
// định. KHÔNG tạo CampaignMembership/CrmHandoff/Pipeline — chỉ ghi vào
// private_group_customers (xem recordPrivateGroupCustomerInteractionTransactional).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; relationId: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id, relationId } = await context.params;
    const body = await request.json().catch(() => null) as {
      idempotency_key?: string; ket_qua?: TrangThaiChamSoc; muc_do_quan_tam?: MucDoQuanTam; ghi_chu?: string; ngay_lien_he_tiep?: string;
    } | null;
    if (!body?.idempotency_key || !body.ket_qua || !STATUSES.includes(body.ket_qua)) {
      return NextResponse.json({ success: false, error: 'Thiếu idempotency_key hoặc kết quả chăm sóc' }, { status: 400 });
    }
    if (body.muc_do_quan_tam && !INTERESTS.includes(body.muc_do_quan_tam)) {
      return NextResponse.json({ success: false, error: 'Mức độ quan tâm không hợp lệ' }, { status: 400 });
    }

    const group = await getPrivateGroup(id);
    if (!group) return NextResponse.json({ success: false, error: 'Không tìm thấy Nhóm riêng' }, { status: 404 });
    const relation = await getPrivateGroupCustomerById(relationId);
    if (!relation || relation.group_id !== id) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng này trong Nhóm riêng' }, { status: 404 });
    }
    if (!canActOnPrivateGroupCustomer(user, group, relation)) {
      return NextResponse.json({ success: false, error: 'Bạn không có quyền chăm sóc khách hàng này' }, { status: 403 });
    }

    const result = await recordPrivateGroupCustomerInteractionTransactional({
      groupId: id,
      relationId,
      actor: user,
      idempotencyKey: body.idempotency_key,
      result: body.ket_qua,
      interest: body.muc_do_quan_tam || 'Chưa xác định',
      note: String(body.ghi_chu || '').trim(),
      nextContact: body.ngay_lien_he_tiep || undefined,
    });
    return NextResponse.json({ success: true, data: result.relation, idempotent: result.idempotent });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    if (error instanceof PrivateGroupCustomerNotFoundError) return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    console.error('[PrivateGroup customer interaction]', error);
    return NextResponse.json({ success: false, error: 'Không thể lưu kết quả chăm sóc' }, { status: 500 });
  }
}
