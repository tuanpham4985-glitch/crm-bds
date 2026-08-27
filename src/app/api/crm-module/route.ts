import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { isCrmModuleEnabled, setCrmModuleEnabled } from '@/lib/crm-module';

// GET: trạng thái CRM Module hiện tại — mọi user đã đăng nhập đọc được (chỉ
// là cờ hiển thị, không phải dữ liệu nhạy cảm) để Sidebar/các trang CRM biết
// có nên hiện/vào hay không.
export async function GET() {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const enabled = await isCrmModuleEnabled();
    return NextResponse.json({ success: true, data: { enabled } });
  } catch (error) {
    console.error('[crm-module GET]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải trạng thái CRM Module' }, { status: 500 });
  }
}

// PUT: đổi trạng thái — chỉ Admin. Không thay thế bất kỳ business
// authorization nào khác (canManageCampaign, isCrmAdmin ở các route khác...)
// — đây chỉ là module visibility gate.
export async function PUT(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isCrmAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Chỉ Admin mới được đổi cấu hình CRM Module' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Thiếu enabled (boolean)' }, { status: 400 });
    }
    await setCrmModuleEnabled(body.enabled);
    return NextResponse.json({ success: true, data: { enabled: body.enabled } });
  } catch (error) {
    console.error('[crm-module PUT]', error);
    return NextResponse.json({ success: false, error: 'Không thể lưu cấu hình CRM Module' }, { status: 500 });
  }
}
