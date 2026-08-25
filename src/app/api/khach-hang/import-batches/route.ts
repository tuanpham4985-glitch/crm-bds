import { NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { listImportBatches } from '@/lib/crm-funnel/import-batch';
import { assertTransactionalCrm, TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

export async function GET() {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Không có quyền xem lịch sử import' }, { status: 403 });
  try {
    assertTransactionalCrm();
    const batches = await listImportBatches();
    return NextResponse.json({ success: true, data: batches });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Import batches list]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải lịch sử import' }, { status: 500 });
  }
}
