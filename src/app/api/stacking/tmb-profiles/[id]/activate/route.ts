import { NextRequest, NextResponse } from 'next/server';
import { requireTmbAdmin } from '@/lib/tmb-admin-guard';
import { getTmbMapProfile, updateTmbMapProfile, activateTmbMapProfile } from '@/lib/tmb-repository';

// POST /api/stacking/tmb-profiles/[id]/activate  body: { action: 'activate' | 'deactivate' }
// admin-only. ACTIVATE cần đã optimize xong (web_asset_ref tồn tại) — profile
// chưa có web asset thì Sale sẽ fetch lỗi khi mở TMB, chặn sớm ở đây thay vì
// để lỗi runtime khó hiểu hơn.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTmbAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const profile = await getTmbMapProfile(id);
    if (!profile) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });

    const { action } = await req.json();
    if (action === 'activate') {
      if (!profile.web_asset_ref) {
        return NextResponse.json({ success: false, error: 'Chưa có web asset — chạy "Tối ưu" trước khi kích hoạt' }, { status: 400 });
      }
      // activateTmbMapProfile (tmb-repository.ts) tự deactivate MỌI sibling
      // ACTIVE cùng slot (stacking_config_id+subdivision) trong 1 transaction
      // SERIALIZABLE — đảm bảo bất biến "tối đa 1 ACTIVE mỗi slot", xem audit
      // + comment đầy đủ tại hàm đó (TMB_ACTIVATION_INVARIANT_FIX).
      const updated = await activateTmbMapProfile(id);
      return NextResponse.json({ success: true, data: updated });
    }
    if (action === 'deactivate') {
      const updated = await updateTmbMapProfile(id, { status: 'READY_FOR_REVIEW' });
      return NextResponse.json({ success: true, data: updated });
    }
    return NextResponse.json({ success: false, error: 'action phải là "activate" hoặc "deactivate"' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
