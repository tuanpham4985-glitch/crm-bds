import { NextRequest, NextResponse } from 'next/server';
import { requireTmbAdmin } from '@/lib/tmb-admin-guard';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { listTmbMapProfiles, createTmbMapProfile, updateTmbMapProfile } from '@/lib/tmb-repository';
import { getTmbAssetStorage, assertProductionUploadAllowed } from '@/lib/tmb-storage';

// GET  /api/stacking/tmb-profiles?stacking_config_id=xxx
// POST /api/stacking/tmb-profiles   (admin-only, tạo profile DRAFT)
//
// Section 14: Sale/user thường CHỈ đọc profile ACTIVE — filter server-side,
// KHÔNG tin query param status từ client.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stackingConfigId = searchParams.get('stacking_config_id') ?? undefined;

    const user = await getCrmSessionUser();
    const admin = isCrmAdmin(user);

    const profiles = await listTmbMapProfiles(stackingConfigId);
    const visible = admin ? profiles : profiles.filter(p => p.status === 'ACTIVE');
    return NextResponse.json({ success: true, data: visible });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking/tmb-profiles GET]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireTmbAdmin();
  if (!guard.ok) return guard.response;

  try {
    const contentType = req.headers.get('content-type') || '';
    let stacking_config_id: string, label: string, subdivision: string | undefined, unit_code_field: string | undefined;
    let masterAssetRef: string;
    let masterSizeBytes: number;

    if (contentType.includes('multipart/form-data')) {
      // Upload trực tiếp qua browser — CHỈ khả thi với file vừa/nhỏ (giới hạn
      // body size của platform, xem tmb-storage.ts comment + Section 18 báo
      // cáo). File cỡ như fixture TĐNĐ1 (200MB+) PHẢI ingest qua script
      // server-side (xem scripts/tmp-run-optimizer-tdnd1.ts làm ví dụ), rồi
      // truyền `master_asset_ref` có sẵn (nhánh JSON bên dưới).
      const form = await req.formData();
      stacking_config_id = String(form.get('stacking_config_id') ?? '');
      label = String(form.get('label') ?? '');
      subdivision = form.get('subdivision') ? String(form.get('subdivision')) : undefined;
      unit_code_field = form.get('unit_code_field') ? String(form.get('unit_code_field')) : undefined;
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ success: false, error: 'Thiếu file' }, { status: 400 });
      }
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        // Section 14: không tin đuôi file, kiểm cả MIME type — vẫn chỉ chặn
        // được ở mức cơ bản, analyze() ở bước sau xác nhận thật bằng pdfjs.
        return NextResponse.json({ success: false, error: 'Chỉ chấp nhận file PDF' }, { status: 400 });
      }
      assertProductionUploadAllowed();
      const buffer = Buffer.from(await file.arrayBuffer());
      const ref = `${stacking_config_id}/${Date.now()}-master.pdf`;
      await getTmbAssetStorage().put(ref, buffer);
      masterAssetRef = ref;
      masterSizeBytes = buffer.length;
    } else {
      // JSON: master_asset_ref đã tồn tại sẵn trong storage (ingest qua script
      // server-side cho file lớn) — route chỉ tạo record trỏ tới, KHÔNG tự
      // đọc/ghi lại file (tránh load trùng buffer lớn không cần thiết).
      const body = await req.json();
      stacking_config_id = String(body.stacking_config_id ?? '');
      label = String(body.label ?? '');
      subdivision = body.subdivision ?? undefined;
      unit_code_field = body.unit_code_field ?? undefined;
      masterAssetRef = String(body.master_asset_ref ?? '');
      masterSizeBytes = Number(body.master_size_bytes ?? 0);
      if (!masterAssetRef) {
        return NextResponse.json({ success: false, error: 'Thiếu master_asset_ref (hoặc gửi multipart/form-data kèm file)' }, { status: 400 });
      }
    }

    if (!stacking_config_id || !label) {
      return NextResponse.json({ success: false, error: 'Thiếu stacking_config_id hoặc label' }, { status: 400 });
    }

    const created = await createTmbMapProfile({
      stacking_config_id,
      label,
      subdivision,
      master_asset_ref: masterAssetRef,
      unit_code_field,
    });
    const withSize = masterSizeBytes > 0
      ? await updateTmbMapProfile(created.id, { master_size_bytes: masterSizeBytes })
      : created;

    return NextResponse.json({ success: true, data: withSize });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking/tmb-profiles POST]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
