import { NextRequest, NextResponse } from 'next/server';
import { getHrmSessionUser, canManageHRM } from '@/lib/auth/hrm-authority';
import { getNhanVien } from '@/lib/data-access';
import { listTenures, createTenure } from '@/lib/hrm/appointment-tenure-repository';
import { validateTenureInput } from '@/lib/hrm/appointment-lifecycle';

// GET — user đã đăng nhập xem được; HR/Admin (canManageHRM) xem toàn bộ,
// người khác chỉ xem tenure của chính mình (KHÔNG copy auth gap của
// /api/contracts — approved architecture §8).
export async function GET(request: NextRequest) {
  try {
    const user = await getHrmSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const idNhanVienParam = request.nextUrl.searchParams.get('id_nhan_vien') || undefined;
    const privileged = canManageHRM(user);

    if (!privileged) {
      // Non-privileged: chỉ xem tenure của chính mình, bỏ qua filter khác nếu có.
      const data = await listTenures({ id_nhan_vien: user.id_nhan_vien });
      return NextResponse.json({ success: true, data });
    }

    const data = await listTenures(idNhanVienParam ? { id_nhan_vien: idNhanVienParam } : undefined);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[BoNhiemChucVu] GET error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi đọc dữ liệu' }, { status: 500 });
  }
}

// POST — chỉ HR/Admin
export async function POST(request: NextRequest) {
  try {
    const user = await getHrmSessionUser();
    if (!canManageHRM(user)) {
      return NextResponse.json({ success: false, error: 'Không có quyền thực hiện' }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ success: false, error: 'Thiếu dữ liệu' }, { status: 400 });

    const id_nhan_vien = String(body.id_nhan_vien || '');
    const chuc_vu_bo_nhiem = String(body.chuc_vu_bo_nhiem || '');
    const ngay_bo_nhiem = String(body.ngay_bo_nhiem || '');
    const ngay_mien_nhiem = body.ngay_mien_nhiem ? String(body.ngay_mien_nhiem) : null;

    const employees = await getNhanVien();
    const employeeExists = employees.some(e => e.id_nhan_vien === id_nhan_vien);
    const existingTenures = await listTenures();

    const validationError = validateTenureInput(
      { id_nhan_vien, chuc_vu_bo_nhiem, ngay_bo_nhiem, ngay_mien_nhiem, employeeExists },
      existingTenures,
    );
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const employee = employees.find(e => e.id_nhan_vien === id_nhan_vien);

    const created = await createTenure({
      id: body.id ? String(body.id) : undefined,
      id_nhan_vien,
      ten_nhan_vien: employee?.ho_ten || (body.ten_nhan_vien ? String(body.ten_nhan_vien) : undefined),
      phong_ban: body.phong_ban ? String(body.phong_ban) : (employee?.phong_KD || undefined),
      du_an: body.du_an ? String(body.du_an) : undefined,
      chuc_vu_bo_nhiem,
      ngay_bo_nhiem,
      so_quyet_dinh_bo_nhiem: body.so_quyet_dinh_bo_nhiem ? String(body.so_quyet_dinh_bo_nhiem) : undefined,
      nguoi_ky_bo_nhiem: body.nguoi_ky_bo_nhiem ? String(body.nguoi_ky_bo_nhiem) : undefined,
      file_quyet_dinh_bo_nhiem: body.file_quyet_dinh_bo_nhiem ? String(body.file_quyet_dinh_bo_nhiem) : undefined,
      ngay_mien_nhiem,
      so_quyet_dinh_mien_nhiem: body.so_quyet_dinh_mien_nhiem ? String(body.so_quyet_dinh_mien_nhiem) : undefined,
      nguoi_ky_mien_nhiem: body.nguoi_ky_mien_nhiem ? String(body.nguoi_ky_mien_nhiem) : undefined,
      file_quyet_dinh_mien_nhiem: body.file_quyet_dinh_mien_nhiem ? String(body.file_quyet_dinh_mien_nhiem) : undefined,
      ghi_chu: body.ghi_chu ? String(body.ghi_chu) : undefined,
      created_by_id: user!.id_nhan_vien,
      created_by_name: user!.ho_ten,
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error('[BoNhiemChucVu] POST error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi tạo quyết định bổ nhiệm' }, { status: 500 });
  }
}
