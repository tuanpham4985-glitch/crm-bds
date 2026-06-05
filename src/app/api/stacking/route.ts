import { NextRequest, NextResponse } from 'next/server';
import { getStackingSheetList, getStackingUnits, probeStackingSheet } from '@/lib/google-sheets';

// GET /api/stacking?probe=1&sheet_id=xxx         — test kết nối + detect towers
// GET /api/stacking?config_id=...&sheets=1       — list towers từ 1 config
// GET /api/stacking?sheet_id=...&project=...&tower=...  — unit data
//
// Lưu ý: KHÔNG cross-reference pipeline CRM vào trangThai.
// Trạng thái căn (con_hang / dang_xem / da_ban) chỉ lấy từ Google Sheets.
// Cross-reference pipeline dễ gây sai lệch nghiêm trọng vì ma_can trong
// pipeline nhập tay, không đảm bảo khớp format với maCan stacking.
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

    // --- Unit data (trực tiếp từ Google Sheets, không cross CRM) ---
    const project = searchParams.get('project')?.trim();
    const tower   = searchParams.get('tower')?.trim();

    if (!project || !tower) {
      return NextResponse.json({ success: false, error: 'Thiếu project hoặc tower' }, { status: 400 });
    }

    const units = await getStackingUnits(sheetId, project, tower);

    return NextResponse.json({ success: true, data: units, total: units.length });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
