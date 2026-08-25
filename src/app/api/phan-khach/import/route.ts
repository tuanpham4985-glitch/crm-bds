import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, getPhanKhachConfigs, importFromPhanKhachConfig } from '@/lib/data-access';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getCrmSessionUser();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    const { config_id, du_an } = await request.json();
    const targetProject = (await getDuAn()).find(project => project.ten_du_an === du_an);
    if (!isCrmAdmin(user) && targetProject?.truong_nhom !== user.ho_ten) {
      return NextResponse.json({ success: false, error: 'Không có quyền import data cho dự án này' }, { status: 403 });
    }
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
