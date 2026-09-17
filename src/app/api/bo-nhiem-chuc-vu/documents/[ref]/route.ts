import { NextRequest, NextResponse } from 'next/server';
import { getHrmSessionUser, canManageHRM, canAccessHrmAppointment, getActorPhongKD } from '@/lib/auth/hrm-authority';
import { getHrmDocumentStorage } from '@/lib/hrm/hrm-document-storage';

// GET — đọc file QĐ đã upload, LUÔN qua route proxy có auth server-side
// (KHÔNG BAO GIỜ trả thẳng URL provider — hồ sơ nhân sự nhạy cảm hơn asset
// TMB nên authority ĐƠN GIẢN theo role, không theo trạng thái record như TMB
// "chỉ profile ACTIVE"). `ref` được encodeURIComponent ở publicUrl() nên
// decode lại 1 segment duy nhất ở đây (cùng convention route tmb-assets/[ref]).
export async function GET(_request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  try {
    const user = await getHrmSessionUser();
    const actorPhongKD = user ? await getActorPhongKD(user.id_nhan_vien) : '';
    if (!canManageHRM(user) || !canAccessHrmAppointment({ vai_tro: user?.vai_tro, employee_type: user?.employee_type, phong_KD: actorPhongKD })) {
      return NextResponse.json({ success: false, error: 'Không có quyền thực hiện' }, { status: 403 });
    }

    const { ref: rawRef } = await context.params;
    const ref = decodeURIComponent(rawRef);

    const storage = getHrmDocumentStorage();
    if (!(await storage.exists(ref))) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });
    }

    const data = await storage.get(ref);
    const contentType = ref.endsWith('.png') ? 'image/png'
      : (ref.endsWith('.jpg') || ref.endsWith('.jpeg')) ? 'image/jpeg'
      : 'application/pdf';

    return new NextResponse(new Uint8Array(data), {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (error) {
    console.error('[BoNhiemChucVu] documents GET error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi đọc file' }, { status: 500 });
  }
}
