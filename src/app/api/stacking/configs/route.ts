import { NextRequest, NextResponse } from 'next/server';
import { getStackingConfigs, addStackingConfig, updateStackingConfig, deleteStackingConfig } from '@/lib/data-access';

// GET  /api/stacking/configs          — danh sách configs
// POST /api/stacking/configs          — thêm config mới
// DELETE /api/stacking/configs?id=xxx — xóa config
export async function GET() {
  try {
    const data = await getStackingConfigs();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking/configs GET]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ten_hien_thi, sheet_id, project_code } = body;

    if (!ten_hien_thi || !sheet_id) {
      return NextResponse.json(
        { success: false, error: 'Thiếu ten_hien_thi hoặc sheet_id' },
        { status: 400 }
      );
    }

    const created = await addStackingConfig({ ten_hien_thi, sheet_id, project_code });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking/configs POST]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, project_code, ten_hien_thi } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Thiếu id' }, { status: 400 });
    }
    if (!project_code && !ten_hien_thi) {
      return NextResponse.json({ success: false, error: 'Cần ít nhất project_code hoặc ten_hien_thi' }, { status: 400 });
    }
    const ok = await updateStackingConfig(id, { project_code, ten_hien_thi });
    return NextResponse.json({ success: ok });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Thiếu id' }, { status: 400 });

    const ok = await deleteStackingConfig(id);
    return NextResponse.json({ success: ok });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking/configs DELETE]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
