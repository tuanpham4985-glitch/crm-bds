import { NextRequest, NextResponse } from 'next/server';
import { canManageCampaign, getCrmSessionUser } from '@/lib/crm-auth';
import { getCampaign, getCampaignSummary, updateCampaign } from '@/lib/crm-funnel/campaign';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });
    const summary = await getCampaignSummary(id);
    return NextResponse.json({ success: true, data: { campaign, summary } });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Campaign detail]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải chi tiết Campaign' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const campaign = await getCampaign(id);
    if (!campaign) return NextResponse.json({ success: false, error: 'Không tìm thấy Campaign' }, { status: 404 });
    if (!canManageCampaign(user, campaign)) {
      return NextResponse.json({ success: false, error: 'Không có quyền sửa Campaign này' }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ success: false, error: 'Thiếu dữ liệu cập nhật' }, { status: 400 });
    const updated = await updateCampaign(id, {
      name: body.name !== undefined ? String(body.name).trim() || undefined : undefined,
      status: body.status !== undefined ? String(body.status) : undefined,
      start_date: body.start_date !== undefined ? (body.start_date ? String(body.start_date) : null) : undefined,
      end_date: body.end_date !== undefined ? (body.end_date ? String(body.end_date) : null) : undefined,
      description: body.description !== undefined ? (body.description ? String(body.description) : null) : undefined,
      owner_id: body.owner_id !== undefined ? (body.owner_id ? String(body.owner_id) : null) : undefined,
      owner_name: body.owner_name !== undefined ? (body.owner_name ? String(body.owner_name) : null) : undefined,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Campaign update]', error);
    return NextResponse.json({ success: false, error: 'Không thể cập nhật Campaign' }, { status: 500 });
  }
}
