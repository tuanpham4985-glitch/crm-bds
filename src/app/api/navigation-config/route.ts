import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getRawNavigationConfig, setRawNavigationConfig } from '@/lib/navigation-config';
import { parseNavigationConfig, sanitizeNavigationConfigShape, DEFAULT_NAVIGATION_CONFIG } from '@/lib/navigation-config-resolve';

// GET: trả về navigation config đã lưu (chỉ order/visible — KHÔNG route/
// icon/business rule, những cái đó ở menu-registry.ts, client tự resolve).
// Mọi user đã đăng nhập đọc được — chỉ là cấu hình hiển thị, không nhạy cảm.
export async function GET() {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const raw = await getRawNavigationConfig();
    return NextResponse.json({ success: true, data: parseNavigationConfig(raw) });
  } catch (error) {
    console.error('[navigation-config GET]', error);
    // Sheets lỗi tạm thời -> fallback deterministic về default, không để lỗi
    // đọc làm Sidebar sập với người dùng.
    return NextResponse.json({ success: true, data: DEFAULT_NAVIGATION_CONFIG });
  }
}

// PUT: lưu config mới — chỉ Admin. Validate NGHIÊM (400 nếu sai shape) thay
// vì âm thầm coi payload hỏng là "default rỗng" — tránh 1 lỗi client vô tình
// xoá sạch config đã lưu.
export async function PUT(request: NextRequest) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isCrmAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Chỉ Admin mới được đổi cấu hình Menu' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => null);
    const config = sanitizeNavigationConfigShape(body);
    if (!config) {
      return NextResponse.json({ success: false, error: 'Dữ liệu cấu hình không hợp lệ' }, { status: 400 });
    }
    await setRawNavigationConfig(JSON.stringify(config));
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error('[navigation-config PUT]', error);
    return NextResponse.json({ success: false, error: 'Không thể lưu cấu hình Menu' }, { status: 500 });
  }
}
