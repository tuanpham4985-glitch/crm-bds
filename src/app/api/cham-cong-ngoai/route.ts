import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getChamCongNgoai,
  addChamCongNgoai,
  updateChamCongNgoaiStatus,
  deleteChamCongNgoai,
  getManagerForEmployee,
} from '@/lib/data-access';

interface SessionUser {
  id_nhan_vien: string;
  ho_ten: string;
  vai_tro: string;
  employee_type?: string;
}

async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const c = cookieStore.get('crm_session');
  if (!c?.value) return null;
  try {
    return JSON.parse(Buffer.from(c.value, 'base64').toString()) as SessionUser;
  } catch {
    return null;
  }
}

function isAdminOrHR(user: SessionUser): boolean {
  return user.vai_tro === 'Admin' || user.vai_tro === 'HR';
}

// GET /api/cham-cong-ngoai
// - Admin/HR: tất cả đơn (hoặc lọc ?id_nhan_vien=xxx)
// - Quản lý trực tiếp: đơn của mình + đơn của nhóm (ql_truc_tiep === ho_ten)
// - Nhân viên: chỉ đơn của mình
export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const filterId = searchParams.get('id_nhan_vien');

    let data;
    if (isAdminOrHR(user)) {
      data = await getChamCongNgoai(filterId || undefined);
    } else {
      // Đơn của bản thân + đơn của nhóm (nếu là quản lý)
      const [own, managed] = await Promise.all([
        getChamCongNgoai(user.id_nhan_vien),
        getChamCongNgoai(undefined, user.ho_ten),
      ]);
      const ownIds = new Set(own.map(r => r.id));
      data = [...own, ...managed.filter(r => !ownIds.has(r.id))];
      data.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error: any) {
    console.error('[API /cham-cong-ngoai] GET error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Lỗi server' }, { status: 500 });
  }
}

// POST /api/cham-cong-ngoai — Tạo đơn mới
export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json();
    const { ngay, gio_bat_dau, gio_ket_thuc, du_an_khach_hang, dia_diem, ghi_chu, hinh_anh, vi_tri_gps } = body;

    if (!ngay || !gio_bat_dau || !gio_ket_thuc || !du_an_khach_hang || !dia_diem) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }

    const ql_truc_tiep = await getManagerForEmployee(user.id_nhan_vien, user.ho_ten).catch(() => '');

    const result = await addChamCongNgoai({
      id_nhan_vien:     user.id_nhan_vien,
      ho_ten:           user.ho_ten,
      ngay,
      gio_bat_dau,
      gio_ket_thuc,
      du_an_khach_hang,
      dia_diem,
      ghi_chu:          ghi_chu || '',
      hinh_anh:         hinh_anh || '',
      vi_tri_gps:       vi_tri_gps || '',
      ql_truc_tiep,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[API /cham-cong-ngoai] POST error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Lỗi server' }, { status: 500 });
  }
}

// PUT /api/cham-cong-ngoai — Phê duyệt / Từ chối
// Cho phép: Admin/HR (bất kỳ đơn nào) HOẶC QL trực tiếp (chỉ đơn của nhóm mình)
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json();
    const { id, trang_thai, ghi_chu_duyet } = body;
    if (!id || !trang_thai) {
      return NextResponse.json({ success: false, error: 'Thiếu id hoặc trang_thai' }, { status: 400 });
    }
    if (trang_thai !== 'da_duyet' && trang_thai !== 'tu_choi') {
      return NextResponse.json({ success: false, error: 'trang_thai không hợp lệ' }, { status: 400 });
    }

    // Admin/HR không bị giới hạn; QL chỉ duyệt đơn của nhóm mình
    const requiredQL = isAdminOrHR(user) ? undefined : user.ho_ten;

    const ok = await updateChamCongNgoaiStatus(id, trang_thai, user.ho_ten, ghi_chu_duyet, requiredQL);

    if (ok === 'forbidden') {
      return NextResponse.json({ success: false, error: 'Bạn không phải quản lý của đơn này' }, { status: 403 });
    }
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy đơn' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /cham-cong-ngoai] PUT error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Lỗi server' }, { status: 500 });
  }
}

// DELETE /api/cham-cong-ngoai?id=xxx — Xóa đơn chờ duyệt (chủ đơn)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Thiếu id' }, { status: 400 });

    const ok = await deleteChamCongNgoai(id, user.id_nhan_vien);
    if (!ok) return NextResponse.json({ success: false, error: 'Không tìm thấy hoặc không có quyền xóa' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API /cham-cong-ngoai] DELETE error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Lỗi server' }, { status: 500 });
  }
}
