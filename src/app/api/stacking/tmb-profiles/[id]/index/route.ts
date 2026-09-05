import { NextRequest, NextResponse } from 'next/server';
import { requireTmbAdmin } from '@/lib/tmb-admin-guard';
import { getTmbMapProfile, updateTmbMapProfile, listTmbUnitMappings, upsertTmbUnitMapping } from '@/lib/tmb-repository';
import { readTmbAsset } from '@/lib/tmb-asset-read';
import {
  extractPdfUnitLabels, classifySheetInventoryWithAliases, summarizeSheetClassification,
  parseProfileDecodeConfig,
} from '@/lib/tmb-indexer';
import { normalizeUnitCode } from '@/app/stacking/tmb-map-matching';
import { getStackingConfigs, getStackingListRows } from '@/lib/data-access';
import type { StackingListRow } from '@/lib/types';

// POST /api/stacking/tmb-profiles/[id]/index — admin-only. Auto Unit Indexing
// (Section 7): trích mã căn từ PDF, đối chiếu EXACT với Bảng hàng SỐNG của
// đúng project (stacking_config_id) — CHO PHÉP alias tiền tố profile-scoped
// (TmbMapProfile.glyph_remap.unitAliasRules, xem tmb-indexer.ts) khi Bảng
// hàng dùng mã kinh doanh khác mã lưới kỹ thuật trong PDF (VD TĐNĐ1: "TĐ55-11"
// Sheet <-> "BM55-11" PDF, cùng lô, số giữ nguyên — KHÔNG fuzzy). Auto-tạo
// mapping AUTO_TEXT CHỈ cho mã MATCHED (direct HOẶC alias, mỗi loại đúng 1
// vị trí PDF duy nhất) — ambiguous/unmatched KHÔNG tự chọn, KHÔNG bịa.
// MANUAL mapping đã có LUÔN là authority — AUTO_TEXT KHÔNG BAO GIỜ ghi đè
// (Section 8), kể cả khi chạy lại index nhiều lần. Mã lưu vào TmbUnitMapping
// LUÔN là mã kinh doanh gốc trong Sheet (identity chính), KHÔNG phải mã PDF
// dù match qua alias — provenance ghi lại mã PDF + rule đã dùng để tra cứu.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTmbAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const profile = await getTmbMapProfile(id);
    if (!profile) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });

    const configs = await getStackingConfigs();
    const config = configs.find(c => c.id === profile.stacking_config_id);
    if (!config) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy StackingConfig (nguồn) tương ứng — có thể đã bị xoá' }, { status: 404 });
    }
    if (config.loai !== 'list' || !config.sheet_tab) {
      return NextResponse.json({ success: false, error: 'Nguồn này chưa cấu hình tab Bảng hàng (loai=list + sheet_tab) — auto-index cần Bảng hàng thật' }, { status: 400 });
    }

    const { columns, rows: allRows } = await getStackingListRows(config.sheet_id, config.sheet_tab);
    // Map profile gắn với 1 phân khu cụ thể (profile.subdivision, VD "TĐNĐ1")
    // -> CHỈ đối chiếu đúng tập con Bảng hàng thuộc phân khu đó (khớp
    // "TĐNĐ1.1"/"TĐNĐ1.2"... theo PREFIX, không exact — Sheet dùng sub-phân
    // khu con), tránh lẫn mã của phân khu KHÁC (VD VBM1) vào kết quả reconcile
    // của profile này. Không có subdivision -> dùng toàn bộ tab (hành vi cũ).
    const phanKhuKey = columns.find(c => c.toUpperCase().includes('PHÂN KHU') || c.toUpperCase().includes('PHAN KHU'));
    const rows: StackingListRow[] = profile.subdivision && phanKhuKey
      ? allRows.filter(r => String(r.values[phanKhuKey] ?? '').toUpperCase().startsWith(profile.subdivision!.toUpperCase()))
      : allRows;
    const sheetUnitCodes = rows.map(r => r.maCan);

    const buffer = await readTmbAsset(profile.master_asset_ref);
    const decodeConfig = parseProfileDecodeConfig(profile.glyph_remap);
    const labels = await extractPdfUnitLabels(buffer, { pageNumber: profile.page_number, glyphRemap: decodeConfig.charRemap });
    const classified = classifySheetInventoryWithAliases(labels, sheetUnitCodes, { aliasRules: decodeConfig.unitAliasRules });
    const summary = summarizeSheetClassification(classified);

    const existingMappings = await listTmbUnitMappings(id);
    const manualCodes = new Set(existingMappings.filter(m => m.source === 'MANUAL').map(m => m.normalized_unit_code));

    let autoCreated = 0, autoSkippedManual = 0;
    for (const c of classified) {
      if (c.classification !== 'MATCHED' || !c.position) continue;
      if (manualCodes.has(c.normalizedOriginalCode)) { autoSkippedManual++; continue; }
      await upsertTmbUnitMapping(id, {
        unitCode: c.originalCode, // identity CHÍNH luôn là mã kinh doanh gốc, kể cả match qua alias
        normalizedUnitCode: c.normalizedOriginalCode,
        x: c.position.x,
        y: c.position.y,
        source: 'AUTO_TEXT',
        confidence: c.matchSource === 'alias' ? 0.95 : 1,
        provenance: {
          page: profile.page_number,
          extractedAt: new Date().toISOString(),
          normalizationVersion: 'normalizeUnitCode-v1',
          matchSource: c.matchSource,
          ...(c.matchSource === 'alias' ? { originalCode: c.originalCode, resolvedPdfCode: c.resolvedPdfCode, aliasRuleLabel: c.aliasRuleLabel } : {}),
        },
      });
      autoCreated++;
    }

    const updated = await updateTmbMapProfile(id, { status: 'READY_FOR_REVIEW', error_message: null });

    return NextResponse.json({
      success: true,
      data: {
        profile: updated,
        summary,
        autoCreated,
        autoSkippedManual,
        ambiguous: classified.filter(c => c.classification === 'AMBIGUOUS').map(c => ({ code: c.originalCode, reason: c.reason, sheetRowCount: c.sheetRowCount })),
        unmatched: classified.filter(c => c.classification === 'UNMATCHED').map(c => ({ code: c.originalCode, reason: c.reason })),
        matchedAlias: classified.filter(c => c.classification === 'MATCHED' && c.matchSource === 'alias').map(c => ({ code: c.originalCode, resolvedPdfCode: c.resolvedPdfCode, aliasRuleLabel: c.aliasRuleLabel })),
        sheetInventoryCount: sheetUnitCodes.length,
        sheetInventoryCountNormalized: new Set(sheetUnitCodes.map(normalizeUnitCode)).size,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API tmb-profiles/[id]/index]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
