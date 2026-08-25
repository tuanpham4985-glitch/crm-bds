import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { parseQualityFilters, queryQualityLeads } from '@/lib/crm-funnel/analytics';
import { qualityManagerScope, recordQualityExportAudit } from '@/lib/crm-funnel/export-service';
import { createQualityWorkbookBuffer } from '@/lib/crm-funnel/quality-export';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

export async function GET(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const filters = parseQualityFilters(new URL(request.url).searchParams);
    const scope = await qualityManagerScope(user);
    const result = await queryQualityLeads(filters, scope);
    const buffer = createQualityWorkbookBuffer(result.rows);
    await recordQualityExportAudit({ user, filters, recordCount: result.rows.length, exportType: 'XLSX' });
    const filename = `data-chat-luong-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    if (error instanceof Error && error.message === 'QUALITY_EXPORT_FORBIDDEN') return NextResponse.json({ success: false, error: 'Không có quyền export' }, { status: 403 });
    console.error('[Quality XLSX export]', error);
    return NextResponse.json({ success: false, error: 'Export XLSX thất bại' }, { status: 500 });
  }
}
