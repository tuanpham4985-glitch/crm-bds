import { NextRequest, NextResponse } from 'next/server';
import { getHrmSessionUser, canManageHRM, canAccessHrmAppointment, getActorPhongKD } from '@/lib/auth/hrm-authority';
import { getNhanVien } from '@/lib/data-access';
import { getTenureById, updateTenure, deleteTenure, listTenures } from '@/lib/hrm/appointment-tenure-repository';
import { validateTenureInput } from '@/lib/hrm/appointment-lifecycle';

// PUT — chỉ HR/Admin VÀ trong audience Bổ nhiệm/Miễn nhiệm
// (canAccessHrmAppointment — approved architecture HRM_APPOINTMENT_ACCESS_CONTROL).
// Update theo id (path param) — KHÔNG match theo field khác, tránh silently
// overwrite sai record (approved architecture §4).
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getHrmSessionUser();
    const actorPhongKD = user ? await getActorPhongKD(user.id_nhan_vien) : '';
    if (!canManageHRM(user) || !canAccessHrmAppointment({ vai_tro: user?.vai_tro, employee_type: user?.employee_type, phong_KD: actorPhongKD })) {
      return NextResponse.json({ success: false, error: 'Không có quyền thực hiện' }, { status: 403 });
    }

    const { id } = await context.params;
    const existing = await getTenureById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy quyết định bổ nhiệm' }, { status: 404 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ success: false, error: 'Thiếu dữ liệu' }, { status: 400 });

    const id_nhan_vien = body.id_nhan_vien !== undefined ? String(body.id_nhan_vien) : existing.id_nhan_vien;
    const chuc_vu_bo_nhiem = body.chuc_vu_bo_nhiem !== undefined ? String(body.chuc_vu_bo_nhiem) : existing.chuc_vu_bo_nhiem;
    const ngay_bo_nhiem = body.ngay_bo_nhiem !== undefined ? String(body.ngay_bo_nhiem) : existing.ngay_bo_nhiem;
    const ngay_mien_nhiem = body.ngay_mien_nhiem !== undefined
      ? (body.ngay_mien_nhiem ? String(body.ngay_mien_nhiem) : null)
      : (existing.ngay_mien_nhiem ?? null);

    const employees = await getNhanVien();
    const employeeExists = employees.some(e => e.id_nhan_vien === id_nhan_vien);
    const existingTenures = await listTenures();

    const validationError = validateTenureInput(
      { id, id_nhan_vien, chuc_vu_bo_nhiem, ngay_bo_nhiem, ngay_mien_nhiem, employeeExists },
      existingTenures,
    );
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    for (const key of [
      'id_nhan_vien', 'ten_nhan_vien', 'phong_ban', 'du_an',
      'chuc_vu_bo_nhiem', 'ngay_bo_nhiem', 'so_quyet_dinh_bo_nhiem', 'nguoi_ky_bo_nhiem', 'file_quyet_dinh_bo_nhiem',
      'ngay_mien_nhiem', 'so_quyet_dinh_mien_nhiem', 'nguoi_ky_mien_nhiem', 'file_quyet_dinh_mien_nhiem',
      'ghi_chu',
    ]) {
      if (key in body) {
        const v = body[key];
        patch[key] = v === '' || v === null || v === undefined ? null : String(v);
      }
    }

    const updated = await updateTenure(id, patch);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy quyết định bổ nhiệm' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[BoNhiemChucVu] PUT error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi cập nhật quyết định bổ nhiệm' }, { status: 500 });
  }
}

// DELETE — chỉ HR/Admin VÀ trong audience Bổ nhiệm/Miễn nhiệm. Best-effort
// dọn file đính kèm (repository layer).
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getHrmSessionUser();
    const actorPhongKD = user ? await getActorPhongKD(user.id_nhan_vien) : '';
    if (!canManageHRM(user) || !canAccessHrmAppointment({ vai_tro: user?.vai_tro, employee_type: user?.employee_type, phong_KD: actorPhongKD })) {
      return NextResponse.json({ success: false, error: 'Không có quyền thực hiện' }, { status: 403 });
    }

    const { id } = await context.params;
    const deleted = await deleteTenure(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy quyết định bổ nhiệm' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[BoNhiemChucVu] DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi xóa quyết định bổ nhiệm' }, { status: 500 });
  }
}
