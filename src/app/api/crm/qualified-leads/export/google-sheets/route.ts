import { NextRequest, NextResponse } from 'next/server';
import { exportQualityProjectionToGoogleSheet } from '@/lib/data-access';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { queryQualityLeads } from '@/lib/crm-funnel/analytics';
import { qualityManagerScope, recordQualityExportAudit, updateQualityExportDestination } from '@/lib/crm-funnel/export-service';
import { QUALITY_EXPORT_HEADERS, qualityExportRecords } from '@/lib/crm-funnel/quality-export';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';
import type { QualifiedLeadFilters } from '@/lib/types';

export async function POST(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const filters = await request.json() as QualifiedLeadFilters;
    const scope = await qualityManagerScope(user);
    const result = await queryQualityLeads(filters, scope);
    const audit = await recordQualityExportAudit({ user, filters, recordCount: result.rows.length, exportType: 'GOOGLE_SHEETS', destination: 'PENDING' });
    const projection = await exportQualityProjectionToGoogleSheet(QUALITY_EXPORT_HEADERS, qualityExportRecords(result.rows));
    await updateQualityExportDestination(audit.id, projection.url);
    return NextResponse.json({ success: true, data: projection });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    if (error instanceof Error && error.message === 'QUALITY_EXPORT_FORBIDDEN') return NextResponse.json({ success: false, error: 'Không có quyền export' }, { status: 403 });
    console.error('[Quality Google Sheets export]', error);
    return NextResponse.json({ success: false, error: 'Export Google Sheets thất bại' }, { status: 500 });
  }
}
