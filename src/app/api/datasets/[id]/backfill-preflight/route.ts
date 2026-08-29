import { NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getDatasetBackfillPreflight } from '@/lib/crm-funnel/dataset';
import { assertTransactionalCrm, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// CUSTOMER DATASET — remediation cho batch import TRƯỚC KHI Dataset tồn tại
// (3.346 Customer production hiện có). Admin-only, READ-ONLY (chỉ đếm/preview,
// KHÔNG ghi gì) — xem dataset.ts#getDatasetBackfillPreflight.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Chỉ Admin/Ban lãnh đạo mới được xem preview backfill Dataset' }, { status: 403 });
  try {
    assertTransactionalCrm();
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const batchIds = (searchParams.get('batchIds') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (batchIds.length === 0) return NextResponse.json({ success: false, error: 'Thiếu batchIds' }, { status: 400 });
    const preflight = await getDatasetBackfillPreflight(id, batchIds);
    if (!preflight.dataset) return NextResponse.json({ success: false, error: 'Không tìm thấy Dataset' }, { status: 404 });
    return NextResponse.json({ success: true, data: preflight });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Dataset backfill preflight]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải preview backfill' }, { status: 500 });
  }
}
