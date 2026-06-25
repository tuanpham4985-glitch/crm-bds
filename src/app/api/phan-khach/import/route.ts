import { NextRequest, NextResponse } from 'next/server';
import { getPhanKhachConfigs, importFromPhanKhachConfig } from '@/lib/data-access';

export async function POST(request: NextRequest) {
  try {
    const { config_id, du_an } = await request.json();
    if (!config_id) {
      return NextResponse.json({ success: false, error: 'Thiếu config_id' }, { status: 400 });
    }

    const configs = await getPhanKhachConfigs();
    const config = configs.find(c => c.id === config_id);
    if (!config) {
      return NextResponse.json({ success: false, error: 'Config không tồn tại' }, { status: 404 });
    }

    const result = await importFromPhanKhachConfig(config.sheet_id, du_an ?? '');
    console.log(`[Import] sheet=${config.sheet_id} → imported=${result.imported}, duplicates=${result.duplicates}, updated=${result.updated}`);
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
