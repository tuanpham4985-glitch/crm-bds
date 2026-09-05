import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { listTmbMapProfiles } from '@/lib/tmb-repository';
import { getTmbAssetStorage } from '@/lib/tmb-storage';

// GET /api/stacking/tmb-assets/[ref] — serve asset từ LocalDevAssetStorage
// (DEV/local only — xem tmb-storage.ts, KHÔNG bền trên Vercel serverless).
// `ref` được encodeURIComponent ở publicUrl() nên decode lại ở đây.
//
// Section 14: Sale chỉ được đọc asset của profile ACTIVE — verify NGƯỢC từ
// ref về đúng 1 profile ACTIVE (hoặc Admin xem asset của profile bất kỳ để
// review trước khi activate), KHÔNG serve asset mồ côi/không thuộc profile
// nào cho ai gọi cũng được.
export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref: rawRef } = await params;
    const ref = decodeURIComponent(rawRef);

    const user = await getCrmSessionUser();
    const admin = isCrmAdmin(user);
    if (!user) return NextResponse.json({ success: false, error: 'Cần đăng nhập' }, { status: 401 });

    // ref = "<stackingConfigId>/<...>" theo convention tạo ref ở các route
    // upload/optimize — tìm đúng profile sở hữu ref này để kiểm tra quyền.
    const owningProfile = await findProfileByAssetRef(ref);
    if (!owningProfile) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });
    if (!admin && owningProfile.status !== 'ACTIVE') {
      return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });
    }

    const storage = getTmbAssetStorage();
    if (!(await storage.exists(ref))) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });
    const data = await storage.get(ref);
    return new NextResponse(new Uint8Array(data), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=3600' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

async function findProfileByAssetRef(ref: string) {
  const all = await listTmbMapProfiles();
  return all.find(p => p.master_asset_ref === ref || p.web_asset_ref === ref) ?? null;
}
