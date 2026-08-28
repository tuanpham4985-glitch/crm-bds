import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, getNhanVien } from '@/lib/data-access';
import { canManageCampaign, eligibleCampaignSales, getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { bulkAddAndDistribute, getCampaign, resolveCampaignMembershipCustomerIdsByRange, resolveCustomerIdsByFilter, type DistributionMode } from '@/lib/crm-funnel/campaign';
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
      customer_ids?: unknown; customer_filter?: unknown; membership_range?: unknown; telesale_names?: unknown; mode?: unknown; quantities?: unknown;
    } | null;

    let customerIds: string[];
    if (body?.customer_filter && typeof body.customer_filter === 'object') {
      // "Chọn tất cả N khách hàng phù hợp bộ lọc" — id resolve THẲNG từ DB
      // theo bộ lọc, KHÔNG nhận id list từ client cho đường này. Chỉ Admin
      // được dùng (tương đương "Tạo Campaign/bulk-add từ /khach-hang" trong
      // spec) — canManageCampaign phía trên đã cho phép cả Leader (owner
      // Campaign) đi tới đây, nên phải gate CHẶT hơn riêng cho customer_filter.
      if (!isCrmAdmin(user)) {
        return NextResponse.json({ success: false, error: 'Chỉ Admin được thêm khách hàng theo bộ lọc (chọn tất cả)' }, { status: 403 });
      }
      const filterInput = body.customer_filter as Record<string, unknown>;
      customerIds = await resolveCustomerIdsByFilter({
        search: typeof filterInput.search === 'string' ? filterInput.search : undefined,
        from: typeof filterInput.from === 'string' ? filterInput.from : undefined,
        to: typeof filterInput.to === 'string' ? filterInput.to : undefined,
      });
    } else if (body?.membership_range && typeof body.membership_range === 'object') {
      // "Chọn khách: Từ [x] đến [y]" trong CSKH → Theo Campaign — id resolve
      // THẲNG từ DB theo ĐÚNG thứ tự/bộ lọc (created_at asc + search/bucket)
      // UI đang áp dụng, không nhận id list từ client. Authority GIỐNG hệt
      // "Phân Sale" hiện có — canManageCampaign phía trên (Admin HOẶC Leader/
      // owner Campaign) đã đủ, KHÔNG cần gate Admin-only riêng (khác
      // customer_filter — đây là chia data ĐÃ Ở TRONG Campaign, không phải
      // thêm Customer mới từ ngoài vào).
      const rangeInput = body.membership_range as Record<string, unknown>;
      const resolved = await resolveCampaignMembershipCustomerIdsByRange(id, {
        from: Number(rangeInput.from),
        to: Number(rangeInput.to),
        search: typeof rangeInput.search === 'string' ? rangeInput.search : undefined,
        bucket: typeof rangeInput.bucket === 'string' ? rangeInput.bucket : undefined,
      });
      if ('error' in resolved) {
        return NextResponse.json({ success: false, error: resolved.error }, { status: 400 });
      }
      customerIds = resolved.customerIds;
    } else {
      customerIds = Array.isArray(body?.customer_ids)
        ? body!.customer_ids.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        : [];
    }
    if (customerIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Chưa chọn khách hàng nào' }, { status: 400 });
    }
    const mode = MODES.includes(body?.mode as DistributionMode) ? (body!.mode as DistributionMode) : 'none';

    const telesaleNames = Array.isArray(body?.telesale_names)
      ? body!.telesale_names.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
    const telesales: { id_nhan_vien: string; ho_ten: string }[] = [];
    if (telesaleNames.length > 0) {
      // Không có role "Telesale" riêng — Sale CSKH hợp lệ là nhân viên vai_tro
      // 'Sale' đang hoạt động, thu hẹp theo team Dự án liên kết nếu Leader
      // (không phải Admin) thao tác (eligibleCampaignSales, crm-auth.ts).
      // Nếu KHÔNG xác định được phạm vi Leader→Sale đáng tin cậy (Campaign
      // không gắn Dự án, hoặc Dự án chưa cấu hình ds_sale) -> CHẶN hẳn, không
      // được tự suy diễn "toàn bộ Sale công ty" cho Leader (chỉ Admin mới có
      // quyền đó, và Admin luôn blocked=false).
      const [employees, projects] = await Promise.all([getNhanVien(), getDuAn()]);
      const eligibility = eligibleCampaignSales(isCrmAdmin(user), campaign, projects, employees);
      if (eligibility.blocked) {
        return NextResponse.json({ success: false, error: eligibility.reason }, { status: 403 });
      }
      for (const name of telesaleNames) {
        const target = eligibility.sales.find(item => item.ho_ten === name);
        if (!target) {
          return NextResponse.json({ success: false, error: `"${name}" không phải Sale hợp lệ trong phạm vi Campaign này` }, { status: 400 });
        }
        telesales.push({ id_nhan_vien: target.id_nhan_vien, ho_ten: target.ho_ten });
      }
    }
    if ((mode === 'round_robin' || mode === 'quantity') && telesales.length === 0) {
      return NextResponse.json({ success: false, error: 'Chưa chọn Sale nào để phân' }, { status: 400 });
    }

    // Client gửi quantities theo TÊN telesale (đồng nhất với telesale_names và
    // convention chung của toàn bộ CRM — assign/handoff cũng nhận diện theo
    // ho_ten, không phải id) — quy đổi sang id_nhan_vien ở đây trước khi gọi
    // xuống tầng nghiệp vụ (bulkAddAndDistribute làm việc với id).
    let quantities: Record<string, number> | undefined;
    if (mode === 'quantity') {
      const raw = body?.quantities;
      if (!raw || typeof raw !== 'object') {
        return NextResponse.json({ success: false, error: 'Thiếu số lượng phân cho từng Sale' }, { status: 400 });
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
