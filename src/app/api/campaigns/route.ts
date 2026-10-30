import { NextRequest, NextResponse } from 'next/server';
import { getDuAn } from '@/lib/data-access';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { createCampaign, listCampaigns } from '@/lib/crm-funnel/campaign';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

export async function GET() {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const campaigns = await listCampaigns();
    return NextResponse.json({ success: true, data: campaigns });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Campaigns list]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải danh sách Campaign' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  // Tạo Campaign chỉ Admin/Ban lãnh đạo — giống việc cấu hình team dự án
  // (chỉ Admin đổi được truong_nhom) chỉ Admin mới cấu hình được cấu trúc mới.
  if (!isCrmAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Chỉ Admin/Ban lãnh đạo mới được tạo Campaign' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = String(body?.name || '').trim();
    if (!name) return NextResponse.json({ success: false, error: 'Thiếu tên Campaign' }, { status: 400 });
    // Campaign có thể gom nhiều Dự án. Dự án ở cấp Campaign là optional;
    // Sale sẽ gán Dự án cụ thể cho từng khách trong tab CSKH. Nếu client có
    // gửi id_du_an thì vẫn resolve từ danh mục thật, không tin ten_du_an.
    const id_du_an = body?.id_du_an ? String(body.id_du_an) : '';
    const project = id_du_an ? (await getDuAn()).find(item => item.id_du_an === id_du_an) : undefined;
    if (id_du_an && !project) return NextResponse.json({ success: false, error: 'Dự án không tồn tại' }, { status: 400 });
    const campaign = await createCampaign({
      name,
      id_du_an: project?.id_du_an,
      ten_du_an: project?.ten_du_an,
      status: body?.status ? String(body.status) : undefined,
      start_date: body?.start_date ? String(body.start_date) : undefined,
      end_date: body?.end_date ? String(body.end_date) : undefined,
      description: body?.description ? String(body.description) : undefined,
      owner_id: body?.owner_id ? String(body.owner_id) : undefined,
      owner_name: body?.owner_name ? String(body.owner_name) : undefined,
      actor: user,
    });
    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Campaign create]', error);
    return NextResponse.json({ success: false, error: 'Không thể tạo Campaign' }, { status: 500 });
  }
}
