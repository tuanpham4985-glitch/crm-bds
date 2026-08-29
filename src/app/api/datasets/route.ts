import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { createDataset, listDatasets } from '@/lib/crm-funnel/dataset';
import { assertTransactionalCrm, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// CUSTOMER DATASET — list dùng cho dropdown filter /khach-hang + chọn Dataset
// lúc Import Excel. Bất kỳ user đã đăng nhập đều xem được danh sách (giống
// listCampaigns), chỉ TẠO Dataset mới cần Admin (cùng tier với import Excel).
export async function GET() {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    assertTransactionalCrm();
    const datasets = await listDatasets();
    return NextResponse.json({ success: true, data: datasets });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Datasets list]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải danh sách Dataset' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Chỉ Admin/Ban lãnh đạo mới được tạo Dataset' }, { status: 403 });
  try {
    assertTransactionalCrm();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = String(body?.name || '').trim();
    if (!name) return NextResponse.json({ success: false, error: 'Thiếu tên Dataset' }, { status: 400 });
    const dataset = await createDataset({ name, actor: user! });
    return NextResponse.json({ success: true, data: dataset });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Dataset create]', error);
    return NextResponse.json({ success: false, error: 'Không thể tạo Dataset' }, { status: 500 });
  }
}
