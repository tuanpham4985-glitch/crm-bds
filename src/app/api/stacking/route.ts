import { NextRequest, NextResponse } from 'next/server';
import { getStackingSheetList, getStackingUnits, getPipeline, getDuAn, probeStackingSheet } from '@/lib/data-access';

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

    const [units, pipelines, duAnList] = await Promise.all([
      getStackingUnits(sheetId, project, tower),
      getPipeline(),
      getDuAn(),
    ]);

    // Lọc pipeline theo dự án: tìm id_du_an có ma_du_an khớp project_code.
    // Tránh trường hợp pipeline MCC khớp nhầm unit MCCN (hoặc ngược lại)
    // khi 2 dự án có cùng cấu trúc tower/tầng/căn số.
    // Nếu không tìm thấy DU_AN phù hợp → dùng toàn bộ pipeline (backward compat).
    const projectDuAnIds = new Set(
      duAnList
        .filter(da => da.ma_du_an?.trim().toUpperCase() === project.trim().toUpperCase())
        .map(da => da.id_du_an)
    );
    const filteredPipelines = projectDuAnIds.size > 0
      ? pipelines.filter(p => p.id_du_an && projectDuAnIds.has(p.id_du_an))
      : pipelines;

    // Annotate trangThai từ pipeline CRM.
    // Ưu tiên giai đoạn cao nhất: Ký HĐ > các giai đoạn khác.
    // ⚠ ma_can trong pipeline phải khớp định dạng: "{TOWER}-{TẦNG}-{CĂN}"
    //   ví dụ "B1-12-16A". Phân biệt dự án qua id_du_an → DU_AN.ma_du_an.
    const pipelineMap = new Map<string, string>();
    for (const p of filteredPipelines) {
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
