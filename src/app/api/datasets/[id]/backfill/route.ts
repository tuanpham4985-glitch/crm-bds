import { NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { applyDatasetBackfill, getDatasetBackfillPreflight } from '@/lib/crm-funnel/dataset';
import { assertTransactionalCrm, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// CUSTOMER DATASET — thực thi remediation SAU KHI Admin đã xem preview
// (backfill-preflight) và bấm xác nhận. Admin-only. Idempotent — gọi lại
// nhiều lần với cùng batchIds cho cùng kết quả cuối, không tạo trùng.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Chỉ Admin/Ban lãnh đạo mới được thực thi backfill Dataset' }, { status: 403 });
  try {
    assertTransactionalCrm();
    const { id } = await context.params;
    const body = await request.json().catch(() => null) as { batchIds?: unknown } | null;
    const batchIds = Array.isArray(body?.batchIds)
      ? body!.batchIds.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
    if (batchIds.length === 0) return NextResponse.json({ success: false, error: 'Thiếu batchIds' }, { status: 400 });
    // Re-check preflight ngay trước khi ghi — Admin phải xác nhận đúng preview
    // hiện tại, tránh trường hợp Dataset/batch đã đổi giữa lúc xem preview và
    // lúc bấm xác nhận (không tin trực tiếp input cũ từ client).
    const preflight = await getDatasetBackfillPreflight(id, batchIds);
    if (!preflight.dataset) return NextResponse.json({ success: false, error: 'Không tìm thấy Dataset' }, { status: 404 });
    const result = await applyDatasetBackfill(id, batchIds);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Dataset backfill apply]', error);
    return NextResponse.json({ success: false, error: 'Không thể thực thi backfill' }, { status: 500 });
  }
}
