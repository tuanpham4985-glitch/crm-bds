import { NextRequest, NextResponse } from 'next/server';
import { requireTmbAdmin } from '@/lib/tmb-admin-guard';
import { getTmbMapProfile, listTmbUnitMappings, upsertTmbUnitMapping, deleteTmbUnitMapping } from '@/lib/tmb-repository';
import { normalizeUnitCode } from '@/app/stacking/tmb-map-matching';

type RouteContext = { params: Promise<{ id: string }> };

// GET  /api/stacking/tmb-profiles/[id]/mappings — admin-only, xem toàn bộ
//      mapping (kể cả profile chưa ACTIVE) để review trước khi kích hoạt.
// PUT  — tạo/sửa mapping thủ công (Section 8) — LUÔN ghi source=MANUAL,
//      trở thành authority cho mã đó (ghi đè AUTO_TEXT nếu có).
// DELETE?unit_code=xxx — xoá 1 mapping.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const guard = await requireTmbAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    const mappings = await listTmbUnitMappings(id);
    return NextResponse.json({ success: true, data: mappings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const guard = await requireTmbAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    const profile = await getTmbMapProfile(id);
    if (!profile) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });

    const body = await req.json();
    const unitCode = String(body.unit_code ?? '').trim();
    const x = Number(body.x);
    const y = Number(body.y);
    if (!unitCode || !Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json({ success: false, error: 'Thiếu unit_code hoặc x/y không hợp lệ' }, { status: 400 });
    }

    const mapping = await upsertTmbUnitMapping(id, {
      unitCode,
      normalizedUnitCode: normalizeUnitCode(unitCode),
      x, y,
      source: 'MANUAL',
      confidence: null,
      provenance: { setAt: new Date().toISOString(), setBy: 'admin_manual' },
    });
    return NextResponse.json({ success: true, data: mapping });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const guard = await requireTmbAdmin();
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const unitCode = searchParams.get('unit_code');
    if (!unitCode) return NextResponse.json({ success: false, error: 'Thiếu unit_code' }, { status: 400 });

    await deleteTmbUnitMapping(id, normalizeUnitCode(unitCode));
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
