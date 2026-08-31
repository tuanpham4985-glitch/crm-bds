import { NextRequest, NextResponse } from 'next/server';
import { getStackingSheetList, getStackingUnits, getStackingListRows, getStackingListColumns, getPipeline, getDuAn, probeStackingSheet } from '@/lib/data-access';
import type { DuAn, Pipeline } from '@/lib/types';

// Trạng thái Còn hàng/Đang xem/Đã bán LUÔN đến từ CRM Pipeline (match theo
// mã căn), KHÔNG bao giờ đọc từ màu ô Excel — dùng CHUNG cho cả 2 chế độ
// grid (chung cư) và list (biệt thự/liền kề), không viết lại logic join lần 2.
//
// Lọc pipeline theo dự án: tìm id_du_an có ma_du_an khớp projectCode. Tránh
// trường hợp pipeline dự án A khớp nhầm unit dự án B khi 2 dự án có cấu trúc
// mã căn trùng nhau. Nếu không tìm thấy DU_AN phù hợp → dùng toàn bộ pipeline
// (backward compat, giữ nguyên hành vi cũ khi projectCode rỗng/không khớp).
function buildPipelineStatusMap(
  pipelines: Pipeline[], duAnList: DuAn[], projectCode?: string,
): Map<string, string> {
  const projectDuAnIds = new Set(
    projectCode
      ? duAnList.filter(da => da.ma_du_an?.trim().toUpperCase() === projectCode.trim().toUpperCase()).map(da => da.id_du_an)
      : [],
  );
  const filteredPipelines = projectDuAnIds.size > 0
    ? pipelines.filter(p => p.id_du_an && projectDuAnIds.has(p.id_du_an))
    : pipelines;

  // ⚠ ma_can trong pipeline phải khớp ĐÚNG mã căn hiển thị (VD "AS83-14" cho
  // biệt thự, "B1-12-16A" cho chung cư — 2 quy ước khác nhau, join chỉ dựa
  // vào so khớp chuỗi, không phụ thuộc format). Ưu tiên giai đoạn cao nhất:
  // Ký HĐ > các giai đoạn khác.
  const pipelineMap = new Map<string, string>();
  for (const p of filteredPipelines) {
    if (!p.ma_can) continue;
    const existing = pipelineMap.get(p.ma_can);
    if (!existing || p.giai_doan === 'Ký HĐ' || existing === 'con_hang') {
      pipelineMap.set(p.ma_can, p.giai_doan);
    }
  }
  return pipelineMap;
}

function stageToTrangThai(stage: string | undefined): 'con_hang' | 'dang_xem' | 'da_ban' {
  return !stage ? 'con_hang' : stage === 'Ký HĐ' ? 'da_ban' : 'dang_xem';
}

// GET /api/stacking?probe=1&sheet_id=xxx                       — test kết nối + detect towers
// GET /api/stacking?config_id=...&sheets=1                     — list towers từ 1 config
// GET /api/stacking?sheet_id=...&project=...&tower=...         — unit data (chế độ Lưới)
// GET /api/stacking?mode=list&sheet_id=...&tab=...             — unit data (chế độ Danh sách, biệt thự/liền kề)
// GET /api/stacking?mode=list-columns&sheet_id=...&tab=...     — chỉ lấy tên cột (bước "chọn cột hiển thị" lúc thêm/sửa nguồn)
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

    // --- Chỉ lấy tên cột (bước "chọn cột hiển thị" khi thêm/sửa nguồn) ---
    if (searchParams.get('mode') === 'list-columns') {
      const tab = searchParams.get('tab')?.trim();
      if (!tab) return NextResponse.json({ success: false, error: 'Thiếu tab' }, { status: 400 });
      const columns = await getStackingListColumns(sheetId, tab);
      return NextResponse.json({ success: true, data: columns });
    }

    // --- Unit data (chế độ Danh sách — biệt thự/liền kề) ---
    if (searchParams.get('mode') === 'list') {
      const tab = searchParams.get('tab')?.trim();
      if (!tab) return NextResponse.json({ success: false, error: 'Thiếu tab' }, { status: 400 });
      const projectCode = searchParams.get('project_code')?.trim() || undefined;
      // Cột hiển thị Admin đã chọn lúc thêm/sửa nguồn — join bằng "|" (header
      // cột không chứa ký tự này) để gói gọn trong 1 query param, rỗng = hiện
      // tất cả cột (xem StackingConfig.visible_columns).
      const visibleColumnsParam = searchParams.get('columns');
      const visibleColumns = visibleColumnsParam ? visibleColumnsParam.split('|').filter(Boolean) : undefined;

      const [{ columns, rows }, pipelines, duAnList] = await Promise.all([
        getStackingListRows(sheetId, tab, visibleColumns),
        getPipeline(),
        getDuAn(),
      ]);
      const pipelineMap = buildPipelineStatusMap(pipelines, duAnList, projectCode);
      const annotated = rows.map(row => ({
        ...row,
        trangThai: stageToTrangThai(pipelineMap.get(row.maCan)),
      }));
      return NextResponse.json({ success: true, data: { columns, rows: annotated } });
    }

    // --- Unit data + pipeline status (chế độ Lưới — chung cư) ---
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

    const pipelineMap = buildPipelineStatusMap(pipelines, duAnList, project);
    const annotated = units.map(u => ({ ...u, trangThai: stageToTrangThai(pipelineMap.get(u.maCan)) }));

    return NextResponse.json({ success: true, data: annotated, total: annotated.length });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
