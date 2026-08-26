import { NextRequest, NextResponse } from 'next/server';
import { getNhanVien } from '@/lib/data-access';
import { canManageCampaign, getCrmSessionUser, isTelesale } from '@/lib/crm-auth';
import { bulkAddAndDistribute, getCampaign, type DistributionMode } from '@/lib/crm-funnel/campaign';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

const MODES: DistributionMode[] = ['round_robin', 'quantity', 'none'];

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });
    // Phân phối hàng loạt bị giới hạn chặt hơn — chỉ Admin/owner Campaign,
    // cùng tinh thần "bulk operation gate chặt hơn single" như bulk-delete.
    if (!canManageCampaign(user, campaign)) {
      return NextResponse.json({ success: false, error: 'Không có quyền phân data cho Campaign này' }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as {
      customer_ids?: unknown; telesale_names?: unknown; mode?: unknown; quantities?: unknown;
    } | null;
    const customerIds = Array.isArray(body?.customer_ids)
      ? body!.customer_ids.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
    if (customerIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Chưa chọn khách hàng nào' }, { status: 400 });
    }
    const mode = MODES.includes(body?.mode as DistributionMode) ? (body!.mode as DistributionMode) : 'none';

    const telesaleNames = Array.isArray(body?.telesale_names)
      ? body!.telesale_names.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
    const telesales: { id_nhan_vien: string; ho_ten: string }[] = [];
    if (telesaleNames.length > 0) {
      const employees = await getNhanVien();
      for (const name of telesaleNames) {
        const target = employees.find(item => item.ho_ten === name && item.trang_thai !== 'Nghỉ việc');
        if (!target || !isTelesale(target)) {
          return NextResponse.json({ success: false, error: `"${name}" không phải Telesale/CSKH đang hoạt động` }, { status: 400 });
        }
        telesales.push({ id_nhan_vien: target.id_nhan_vien, ho_ten: target.ho_ten });
      }
    }
    if ((mode === 'round_robin' || mode === 'quantity') && telesales.length === 0) {
      return NextResponse.json({ success: false, error: 'Chưa chọn Telesale nào để phân' }, { status: 400 });
    }

    // Client gửi quantities theo TÊN telesale (đồng nhất với telesale_names và
    // convention chung của toàn bộ CRM — assign/handoff cũng nhận diện theo
    // ho_ten, không phải id) — quy đổi sang id_nhan_vien ở đây trước khi gọi
    // xuống tầng nghiệp vụ (bulkAddAndDistribute làm việc với id).
    let quantities: Record<string, number> | undefined;
    if (mode === 'quantity') {
      const raw = body?.quantities;
      if (!raw || typeof raw !== 'object') {
        return NextResponse.json({ success: false, error: 'Thiếu số lượng phân cho từng Telesale' }, { status: 400 });
      }
      quantities = {};
      for (const t of telesales) {
        const value = Number((raw as Record<string, unknown>)[t.ho_ten]);
        quantities[t.id_nhan_vien] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
      }
    }

    const result = await bulkAddAndDistribute({
      campaignId: id, customerIds, telesales, mode, quantities, actor: user,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Campaign distribute]', error);
    return NextResponse.json({ success: false, error: 'Không thể phân data vào Campaign' }, { status: 500 });
  }
}
