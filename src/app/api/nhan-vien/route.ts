import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getNhanVien,
  addNhanVien,
  updateNhanVien,
  deleteNhanVien
} from '@/lib/data-access';
import { generateId } from '@/lib/utils';
import { SENIOR_EMPLOYEE_TYPES } from '@/lib/constants';

// ==============================
// Session + phân quyền (server-side)
// ==============================
interface SessionUser {
  id_nhan_vien: string;
  ho_ten: string;
  email: string;
  vai_tro: string;
  employee_type: string;
}

async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const c = cookieStore.get('crm_session');
  if (!c?.value) return null;
  try {
    return JSON.parse(Buffer.from(c.value, 'base64').toString()) as SessionUser;
  } catch {
    return null;
  }
}

/** HR và Admin (bao gồm chức danh cấp cao) mới được xem đầy đủ / chỉnh sửa hồ sơ nhân sự */
function canManageHRM(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.vai_tro === 'Admin'
    || user.vai_tro === 'HR'
    || (SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(user.employee_type || '');
}

// ==============================
// Fields không bao giờ trả ra UI (kể cả HR/Admin)
// ==============================
const ALWAYS_HIDDEN = ['mat_khau', 'khach_hang', 'hoa_hong'] as const;

// PII/nhạy cảm — chỉ HR/Admin mới được nhận
const SENSITIVE_FIELDS = [
  'so_cccd', 'ngay_cap', 'noi_cap', 'HKTT', 'ngay_sinh', 'ma_so_thue',
  'so_nguoi_phu_thuoc', 'so_tk_ngan_hang', 'ten_ngan_hang_thu_huong',
] as const;

// Helper: lọc dữ liệu trả về frontend theo quyền của người gọi
function sanitizeNhanVien(data: any[], privileged: boolean) {
  return data
    .filter(nv => nv.trang_thai !== 'Nghỉ việc')
    .map(nv => {
      const clean = { ...nv };
      ALWAYS_HIDDEN.forEach((f) => { delete clean[f]; });
      if (!privileged) {
        SENSITIVE_FIELDS.forEach((f) => { delete clean[f]; });
      }
      return clean;
    });
}

// ==============================
// GET — mọi user đã đăng nhập đọc được danh bạ cơ bản;
// chỉ HR/Admin nhận thêm PII (CCCD, ngân hàng, ngày sinh, MST...)
// ==============================
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const all = await getNhanVien();
    const data = sanitizeNhanVien(all, canManageHRM(user));

    return NextResponse.json({
      success: true,
      data,
      total: data.length
    });
  } catch (error) {
    console.error('NhanVien GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi đọc dữ liệu' },
      { status: 500 }
    );
  }
}

// ==============================
// POST — chỉ HR/Admin
// ==============================
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!canManageHRM(user)) {
      return NextResponse.json(
        { success: false, error: 'Không có quyền thực hiện' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const nv = {
      ...body,
      id_nhan_vien: generateId('NV'),
      ngay_tao: new Date().toISOString(),
    };

    await addNhanVien(nv);

    return NextResponse.json({
      success: true,
      data: nv
    });
  } catch (error) {
    console.error('NhanVien POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi thêm nhân viên' },
      { status: 500 }
    );
  }
}

// ==============================
// PUT — chỉ HR/Admin
// ==============================
export async function PUT(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!canManageHRM(user)) {
      return NextResponse.json(
        { success: false, error: 'Không có quyền thực hiện' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const updated = await updateNhanVien(body);

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy nhân viên' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: body
    });
  } catch (error) {
    console.error('NhanVien PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi cập nhật' },
      { status: 500 }
    );
  }
}

// ==============================
// DELETE — chỉ HR/Admin
// ==============================
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!canManageHRM(user)) {
      return NextResponse.json(
        { success: false, error: 'Không có quyền thực hiện' },
        { status: 403 }
      );
    }

    const { id } = await request.json();

    const deleted = await deleteNhanVien(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy nhân viên' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('NhanVien DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi xóa' },
      { status: 500 }
    );
  }
}
