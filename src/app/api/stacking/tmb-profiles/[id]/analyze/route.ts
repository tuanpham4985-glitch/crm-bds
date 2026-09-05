import { NextRequest, NextResponse } from 'next/server';
import { requireTmbAdmin } from '@/lib/tmb-admin-guard';
import { getTmbMapProfile, updateTmbMapProfile } from '@/lib/tmb-repository';
import { readTmbAsset } from '@/lib/tmb-asset-read';
import { analyzePdf } from '@/lib/tmb-optimizer';

// POST /api/stacking/tmb-profiles/[id]/analyze — admin-only. Đọc master asset,
// chạy analyzePdf (Section 6), cập nhật page dimensions/rotation/size + status.
// KHÔNG cache chi tiết ảnh/text (xem tmb-repository.ts comment đầu file) —
// trả nguyên `analysis` cho UI review ngay lần gọi này.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTmbAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const profile = await getTmbMapProfile(id);
    if (!profile) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });

    let buffer: Buffer;
    try {
      buffer = await readTmbAsset(profile.master_asset_ref);
    } catch (e) {
      const msg = `Không đọc được master asset: ${e instanceof Error ? e.message : String(e)}`;
      await updateTmbMapProfile(id, { status: 'ERROR', error_message: msg });
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }

    const analysis = await analyzePdf(buffer);
    const updated = await updateTmbMapProfile(id, {
      status: 'ANALYZED',
      error_message: null,
      page_width: analysis.page.width,
      page_height: analysis.page.height,
      rotation: analysis.page.rotation,
      master_size_bytes: analysis.fileSizeBytes,
    });

    return NextResponse.json({ success: true, data: { profile: updated, analysis } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API tmb-profiles/[id]/analyze]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
