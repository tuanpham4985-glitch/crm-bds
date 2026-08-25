import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, getNhanVien } from '@/lib/data-access';
import { buildCrmManagerScope, getCrmSessionUser } from '@/lib/crm-auth';
import { parseQualityFilters, queryQualityLeads } from '@/lib/crm-funnel/analytics';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

export async function GET(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const [projects, employees] = await Promise.all([getDuAn(), getNhanVien()]);
    const scope = buildCrmManagerScope(user, projects, employees);
    if (!scope.canManageQuality) return NextResponse.json({ success: false, error: 'Không có quyền xem Data tiềm năng' }, { status: 403 });
    const result = await queryQualityLeads(parseQualityFilters(new URL(request.url).searchParams), scope);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[Qualified leads list]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải Data tiềm năng' }, { status: 500 });
  }
}
