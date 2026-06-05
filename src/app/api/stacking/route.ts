import { NextRequest, NextResponse } from 'next/server';
import { getStackingSheetList, getStackingUnits, getPipeline, probeStackingSheet } from '@/lib/google-sheets';

// GET /api/stacking?probe=1&sheet_id=xxx         — test kết nối + detect towers
// GET /api/stacking?config_id=...&sheets=1       — list towers từ 1 config
// GET /api/stacking?sheet_id=...&project=...&tower=...  — unit data
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  try {
    // --- Test kết nối ---
    if (searchParams.get('probe') === '1') {
      const raw = searchParams.get('sheet_id') || '';
      const result = await probeStackingSheet(raw);
      return NextResponse.json(result.ok
        ? { success: true, data: result.sheets, allTabs: result.allTabs }
        : { success: false, error: result.error }
      );
    }

    const sheetId = searchParams.get('sheet_id') || '';
    if (!sheetId) {
      return NextResponse.json({ success: false, error: 'Thiếu sheet_id' }, { status: 400 });
    }

    // --- List towers ---
    if (searchParams.get('sheets') === '1') {
      const projectCode = searchParams.get('project_code')?.trim() || undefined;
      const sheets = await getStackingSheetList(sheetId, projectCode);
      return NextResponse.json({ success: true, data: sheets });
    }

    // --- Unit data + pipeline status ---
    const project = searchParams.get('project')?.trim();
    const tower   = searchParams.get('tower')?.trim();

    if (!project || !tower) {
      return NextResponse.json({ success: false, error: 'Thiếu project hoặc tower' }, { status: 400 });
    }

    const [units, pipelines] = await Promise.all([
      getStackingUnits(sheetId, project, tower),
      getPipeline(),
    ]);

    // Annotate trangThai từ pipeline CRM
    const pipelineMap = new Map<string, string>();
    for (const p of pipelines) {
      if (!p.ma_can) continue;
      const existing = pipelineMap.get(p.ma_can);
      if (!existing || p.giai_doan === 'Ký HĐ' || existing === 'con_hang') {
        pipelineMap.set(p.ma_can, p.giai_doan);
      }
    }

    const annotated = units.map(u => {
      const stage = pipelineMap.get(u.maCan);
      return {
        ...u,
        trangThai: !stage ? 'con_hang' : stage === 'Ký HĐ' ? 'da_ban' : 'dang_xem',
      };
    });

    return NextResponse.json({ success: true, data: annotated, total: annotated.length });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
