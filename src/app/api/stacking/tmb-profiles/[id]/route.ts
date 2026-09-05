import { NextRequest, NextResponse } from 'next/server';
import { requireTmbAdmin } from '@/lib/tmb-admin-guard';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { getTmbMapProfile, updateTmbMapProfile, deleteTmbMapProfile, listTmbUnitMappings } from '@/lib/tmb-repository';
import { getTmbAssetStorage } from '@/lib/tmb-storage';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/stacking/tmb-profiles/[id] — chi tiết + mapping hiện có.
// Non-admin CHỈ xem được profile ACTIVE (Section 14) — không phân biệt lỗi
// "không tồn tại" vs "không có quyền" để không lộ thông tin profile khác.
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const profile = await getTmbMapProfile(id);
    if (!profile) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });

    const user = await getCrmSessionUser();
    const admin = isCrmAdmin(user);
    if (!admin && profile.status !== 'ACTIVE') {
      return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });
    }

    const mappings = await listTmbUnitMappings(id);
    return NextResponse.json({ success: true, data: { profile, mappings } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = await requireTmbAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const existing = await getTmbMapProfile(id);
    if (!existing) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });

    const body = await req.json();
    const { label, subdivision, unit_code_field, glyph_remap } = body;
    const updated = await updateTmbMapProfile(id, { label, subdivision, unit_code_field, glyph_remap });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE — chỉ xoá record profile + mapping của nó (cascade DB) + best-effort
// dọn asset vật lý. KHÔNG BAO GIỜ động tới Bảng hàng/Sheet/CRM khác (Section 15).
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const guard = await requireTmbAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const existing = await getTmbMapProfile(id);
    if (!existing) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });

    await deleteTmbMapProfile(id);

    // Dọn asset best-effort — lỗi dọn file KHÔNG làm rollback việc xoá record
    // (record là nguồn sự thật cho UI; asset mồ côi có thể dọn sau, không
    // chặn Admin thao tác tiếp). Ref dạng path public/ (VD "/tmb-poc/...", đã
    // commit git cho web asset production — xem tmb-storage.ts comment) KHÔNG
    // thuộc storage abstraction, bỏ qua dọn (Admin tự xoá file git nếu cần).
    const isStorageRef = (ref: string) => !ref.startsWith('/');
    try {
      const storage = getTmbAssetStorage();
      if (isStorageRef(existing.master_asset_ref) && (await storage.exists(existing.master_asset_ref))) {
        await storage.delete(existing.master_asset_ref);
      }
      if (existing.web_asset_ref && isStorageRef(existing.web_asset_ref) && (await storage.exists(existing.web_asset_ref))) {
        await storage.delete(existing.web_asset_ref);
      }
    } catch (cleanupErr) {
      console.warn('[API /stacking/tmb-profiles DELETE] asset cleanup failed (non-fatal)', cleanupErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
