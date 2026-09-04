import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { canActOnPrivateGroupCustomer } from '@/lib/private-group-auth';
import {
  getPrivateGroup, getPrivateGroupCustomerById, listPrivateGroupMembers, PrivateGroupCustomerNotFoundError,
  updatePrivateGroupCustomerQualificationTransactional, type PrivateGroupCustomerQualificationPatchInput,
} from '@/lib/crm-funnel/private-group';
import { validateQualificationInput } from '@/lib/crm-funnel/qualification-input';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';
import type { MucDoQuanTam } from '@/lib/types';

// PUT /api/private-groups/[id]/customers/[relationId]/qualification —
// "Đánh giá" 1 Customer trong Nhóm riêng. Gate/authority CÙNG boundary với
// interaction/route.ts (canActOnPrivateGroupCustomer, WRITE/ACT — data nhóm
// dùng CHUNG cho cả nhóm, xem comment ở đó) — xem comment đầu private-group-
// auth.ts. Score/rank/status do server tự tính (validateQualificationInput
// chặn client tự gửi), tái dùng NGUYÊN VẸN công thức calculateLeadQuality
// qua updatePrivateGroupCustomerQualificationTransactional.
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; relationId: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id, relationId } = await context.params;
    const body = await request.json().catch(() => null) as (Record<string, unknown> & { idempotency_key?: string }) | null;
    if (!body?.idempotency_key) return NextResponse.json({ success: false, error: 'Thiếu idempotency_key' }, { status: 400 });
    const validationError = validateQualificationInput(body);
    if (validationError) return NextResponse.json({ success: false, error: validationError }, { status: 400 });

    const group = await getPrivateGroup(id);
    if (!group) return NextResponse.json({ success: false, error: 'Không tìm thấy Nhóm riêng' }, { status: 404 });
    const relation = await getPrivateGroupCustomerById(relationId);
    if (!relation || relation.group_id !== id) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng này trong Nhóm riêng' }, { status: 404 });
    }
    const members = await listPrivateGroupMembers(id);
    if (!canActOnPrivateGroupCustomer(user, group, relation, members)) {
      return NextResponse.json({ success: false, error: 'Bạn không có quyền đánh giá khách hàng này' }, { status: 403 });
    }

    const patch: PrivateGroupCustomerQualificationPatchInput = {
      san_pham_quan_tam: body.san_pham_quan_tam ? String(body.san_pham_quan_tam) : null,
      nhu_cau: body.nhu_cau ? String(body.nhu_cau) : null,
      ngan_sach_min: body.ngan_sach_min !== undefined && body.ngan_sach_min !== '' ? Number(body.ngan_sach_min) : null,
      ngan_sach_max: body.ngan_sach_max !== undefined && body.ngan_sach_max !== '' ? Number(body.ngan_sach_max) : null,
      muc_dich: body.muc_dich ? String(body.muc_dich) : null,
      thoi_gian_du_kien: body.thoi_gian_du_kien ? String(body.thoi_gian_du_kien) : null,
      phuong_an_tai_chinh: body.phuong_an_tai_chinh ? String(body.phuong_an_tai_chinh) : null,
      khu_vuc_yeu_cau: body.khu_vuc_yeu_cau ? String(body.khu_vuc_yeu_cau) : null,
      muc_do_quan_tam: body.muc_do_quan_tam ? (String(body.muc_do_quan_tam) as MucDoQuanTam) : null,
      hanh_dong_tiep_theo: body.hanh_dong_tiep_theo ? String(body.hanh_dong_tiep_theo) : null,
    };

    const result = await updatePrivateGroupCustomerQualificationTransactional({
      groupId: id, relationId, actor: user, idempotencyKey: body.idempotency_key, patch,
    });
    return NextResponse.json({ success: true, data: result.relation, score: result.score });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    if (error instanceof PrivateGroupCustomerNotFoundError) return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    console.error('[PrivateGroup customer qualification]', error);
    return NextResponse.json({ success: false, error: 'Không thể lưu qualification' }, { status: 500 });
  }
}
