import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getDataset, getDatasetMembershipCustomerRefs } from '@/lib/crm-funnel/dataset';
import { isPostgresEnabled } from '@/lib/db/feature-flags';
import { prisma } from '@/lib/db/client';

const ALLOWED_SOURCES = new Set(['Marketing', 'Voucher']);

/** Gán nguồn cho các Customer thuộc Dataset nhưng đang để trống nguồn. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Chỉ Admin được bổ sung Nguồn cho Dataset' }, { status: 403 });
  if (!isPostgresEnabled('crm')) return NextResponse.json({ success: false, error: 'Tính năng Dataset chưa được bật' }, { status: 503 });

  try {
    const { id } = await context.params;
    const dataset = await getDataset(id);
    if (!dataset) return NextResponse.json({ success: false, error: 'Không tìm thấy Dataset' }, { status: 404 });
    const body = await request.json();
    const source = typeof body.source === 'string' ? body.source.trim() : '';
    if (!ALLOWED_SOURCES.has(source)) {
      return NextResponse.json({ success: false, error: 'Nguồn không hợp lệ' }, { status: 400 });
    }

    const refs = await getDatasetMembershipCustomerRefs(id);
    const customerIds = [...new Set(refs.map(ref => ref.customer_id))];
    if (customerIds.length === 0) return NextResponse.json({ success: true, data: { updated: 0 } });

    const result = await prisma.khachHang.updateMany({
      where: { id_khach_hang: { in: customerIds }, OR: [{ nguon: null }, { nguon: '' }] },
      data: { nguon: source },
    });
    return NextResponse.json({ success: true, data: { updated: result.count } });
  } catch (error) {
    console.error('[Dataset assign source]', error);
    return NextResponse.json({ success: false, error: 'Không thể bổ sung Nguồn cho Dataset' }, { status: 500 });
  }
}
