import { NextRequest, NextResponse } from 'next/server';
import { requireTmbAdmin } from '@/lib/tmb-admin-guard';
import { getTmbMapProfile, updateTmbMapProfile } from '@/lib/tmb-repository';
import { readTmbAsset } from '@/lib/tmb-asset-read';
import { getTmbAssetStorage } from '@/lib/tmb-storage';
import { analyzePdf, optimizePdf, checkOptimizationQualityGates } from '@/lib/tmb-optimizer';

// POST /api/stacking/tmb-profiles/[id]/optimize — admin-only. Chạy optimizer
// (Section 5) + quality gates (Section 6). CHỈ ghi web_asset_ref/status khi
// gates PASS — fail thì giữ nguyên master, KHÔNG đánh dấu ACTIVE được (Section
// 6: "do not mark optimized asset ACTIVE" khi gate fail).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireTmbAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const profile = await getTmbMapProfile(id);
    if (!profile) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });

    const masterBuffer = await readTmbAsset(profile.master_asset_ref);
    const originalAnalysis = await analyzePdf(masterBuffer);
    const result = await optimizePdf(masterBuffer);
    const gates = await checkOptimizationQualityGates(originalAnalysis, result.buffer, masterBuffer.length);

    if (!gates.pass) {
      const msg = `Optimize không qua quality gates: ${gates.failures.map(f => `${f.gate}: ${f.detail}`).join('; ')}`;
      await updateTmbMapProfile(id, { status: 'ERROR', error_message: msg });
      return NextResponse.json({ success: false, error: msg, data: { report: result.report, gates } }, { status: 422 });
    }

    if (result.buffer === masterBuffer || result.report.images.every(i => i.skippedReason)) {
      // Không có ảnh nào cần optimize — dùng thẳng master làm web asset, KHÔNG
      // tạo bản sao thừa (Section 6: "Do not optimize merely to hit arbitrary
      // MB target").
      const updated = await updateTmbMapProfile(id, { web_asset_ref: profile.master_asset_ref, web_size_bytes: masterBuffer.length, error_message: null });
      return NextResponse.json({ success: true, data: { profile: updated, report: result.report, gates, note: 'Không cần optimize — dùng thẳng master' } });
    }

    const webRef = `${profile.stacking_config_id}/${id}-web.pdf`;
    await getTmbAssetStorage().put(webRef, result.buffer);
    const updated = await updateTmbMapProfile(id, {
      web_asset_ref: webRef,
      web_size_bytes: result.buffer.length,
      error_message: null,
    });

    return NextResponse.json({ success: true, data: { profile: updated, report: result.report, gates } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API tmb-profiles/[id]/optimize]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
