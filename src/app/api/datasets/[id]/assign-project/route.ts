import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getDataset, getDatasetMembershipCustomerRefs } from '@/lib/crm-funnel/dataset';
import { isPostgresEnabled } from '@/lib/db/feature-flags';
import { prisma } from '@/lib/db/client';
import { getDuAn } from '@/lib/data-access';

/** Gán Dự án cho các Customer thuộc Dataset nhưng đang để trống Dự án. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Chỉ Admin được bổ sung Dự án cho Dataset' }, { status: 403 });
  if (!isPostgresEnabled('crm')) return NextResponse.json({ success: false, error: 'Tính năng Dataset chưa được bật' }, { status: 503 });

  try {
    const { id } = await context.params;
    const dataset = await getDataset(id);
    if (!dataset) return NextResponse.json({ success: false, error: 'Không tìm thấy Dataset' }, { status: 404 });
    const body = await request.json();
    const projectName = typeof body.projectName === 'string' ? body.projectName.trim() : '';
    const project = (await getDuAn()).find(item => item.ten_du_an === projectName && item.hien_thi !== 0);
    if (!project) return NextResponse.json({ success: false, error: 'Dự án không hợp lệ hoặc đã tạm ngừng' }, { status: 400 });

    const refs = await getDatasetMembershipCustomerRefs(id);
    const customerIds = [...new Set(refs.map(ref => ref.customer_id))];
    if (customerIds.length === 0) return NextResponse.json({ success: true, data: { updated: 0 } });

    const result = await prisma.khachHang.updateMany({
      where: { id_khach_hang: { in: customerIds }, OR: [{ du_an: null }, { du_an: '' }] },
      data: { du_an: project.ten_du_an },
    });
    return NextResponse.json({ success: true, data: { updated: result.count, projectName: project.ten_du_an } });
  } catch (error) {
    console.error('[Dataset assign project]', error);
    return NextResponse.json({ success: false, error: 'Không thể bổ sung Dự án cho Dataset' }, { status: 500 });
  }
}
