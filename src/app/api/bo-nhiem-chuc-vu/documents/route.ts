import { NextRequest, NextResponse } from 'next/server';
import { getHrmSessionUser, canManageHRM } from '@/lib/auth/hrm-authority';
import { getHrmDocumentStorage, generateHrmDocumentKey, validateHrmDocumentFile } from '@/lib/hrm/hrm-document-storage';

// POST — upload file QĐ bổ nhiệm/miễn nhiệm. Trả về `ref` — client gắn ref
// này vào file_quyet_dinh_bo_nhiem/file_quyet_dinh_mien_nhiem khi tạo/sửa
// tenure qua /api/bo-nhiem-chuc-vu (JSON, tách riêng khỏi upload — giữ CRUD
// route đơn giản, cùng tinh thần /api/contracts/generate tách khỏi
// /api/contracts). `tenure_id` có thể là id CHƯA tồn tại trong DB (client
// sinh trước bằng crypto.randomUUID() cho luồng tạo mới — xem
// appointment-tenure-repository.ts CreateTenureInput.id) — route này không
// cần tenure đã tồn tại, chỉ dùng tenure_id làm namespace key.
export async function POST(request: NextRequest) {
  try {
    const user = await getHrmSessionUser();
    if (!canManageHRM(user)) {
      return NextResponse.json({ success: false, error: 'Không có quyền thực hiện' }, { status: 403 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ success: false, error: 'Thiếu dữ liệu upload' }, { status: 400 });

    const file = form.get('file');
    const tenureId = form.get('tenure_id');
    const kind = form.get('kind');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Thiếu file' }, { status: 400 });
    }
    if (typeof tenureId !== 'string' || !tenureId) {
      return NextResponse.json({ success: false, error: 'Thiếu tenure_id' }, { status: 400 });
    }
    if (kind !== 'bo-nhiem' && kind !== 'mien-nhiem') {
      return NextResponse.json({ success: false, error: 'kind không hợp lệ' }, { status: 400 });
    }

    const validationError = validateHrmDocumentFile({ type: file.type, size: file.size });
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = generateHrmDocumentKey(tenureId, kind, file.type);
    const ref = await getHrmDocumentStorage().put(key, buffer, { contentType: file.type });

    return NextResponse.json({ success: true, ref });
  } catch (error) {
    console.error('[BoNhiemChucVu] documents POST error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi upload file' }, { status: 500 });
  }
}
