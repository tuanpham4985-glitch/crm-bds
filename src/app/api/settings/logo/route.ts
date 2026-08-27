import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSettingsSheet } from '@/lib/settings-store';

const LOGO_KEY = 'company_logo';
// Cache logo in memory (5 phút) để tránh đọc Sheets mỗi request
let _logoCache: { data: string | null; ts: number } | null = null;
const LOGO_CACHE_TTL = 5 * 60_000;

// ── GET: trả về logo hiện tại ────────────────────────────────
export async function GET() {
  try {
    // Trả cache nếu còn mới
    if (_logoCache && Date.now() - _logoCache.ts < LOGO_CACHE_TTL) {
      return NextResponse.json({ success: true, data: _logoCache.data });
    }

    const sheet = await getSettingsSheet();
    const rows = await sheet.getRows();
    const row = rows.find(r => r.get('key') === LOGO_KEY);
    const logo = row ? (row.get('value') as string | null) : null;

    _logoCache = { data: logo, ts: Date.now() };
    return NextResponse.json({ success: true, data: logo });
  } catch (err) {
    console.error('[settings/logo GET]', err);
    return NextResponse.json({ success: false, error: 'Không thể tải logo' }, { status: 500 });
  }
}

// ── POST: lưu logo mới (chỉ Admin) ───────────────────────────
export async function POST(req: NextRequest) {
  try {
    // Kiểm tra quyền Admin
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('crm_session')?.value;
    if (!sessionCookie) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });

    let session: any;
    try {
      session = JSON.parse(decodeURIComponent(escape(atob(sessionCookie))));
    } catch {
      return NextResponse.json({ success: false, error: 'Session không hợp lệ' }, { status: 401 });
    }
    if (session.vai_tro !== 'Admin') {
      return NextResponse.json({ success: false, error: 'Chỉ Admin mới được đổi logo' }, { status: 403 });
    }

    const { logo } = await req.json();
    if (!logo || typeof logo !== 'string') {
      return NextResponse.json({ success: false, error: 'Thiếu dữ liệu logo' }, { status: 400 });
    }
    // Giới hạn base64 < 49,000 ký tự (~36KB binary) để nằm dưới Google Sheets cell limit (50,000 chars)
    if (logo.length > 49_000) {
      return NextResponse.json({ success: false, error: 'Logo quá lớn. Vui lòng dùng ảnh nhỏ hơn.' }, { status: 400 });
    }

    const sheet = await getSettingsSheet();
    const rows = await sheet.getRows();
    const existing = rows.find(r => r.get('key') === LOGO_KEY);

    if (existing) {
      existing.set('value', logo);
      await existing.save();
    } else {
      await sheet.addRow({ key: LOGO_KEY, value: logo });
    }

    // Cập nhật cache
    _logoCache = { data: logo, ts: Date.now() };
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[settings/logo POST]', err);
    return NextResponse.json({ success: false, error: 'Không thể lưu logo' }, { status: 500 });
  }
}

// ── DELETE: xoá logo ──────────────────────────────────────────
export async function DELETE() {
  try {
    const sheet = await getSettingsSheet();
    const rows = await sheet.getRows();
    const existing = rows.find(r => r.get('key') === LOGO_KEY);
    if (existing) await existing.delete();

    _logoCache = { data: null, ts: Date.now() };
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[settings/logo DELETE]', err);
    return NextResponse.json({ success: false, error: 'Không thể xoá logo' }, { status: 500 });
  }
}
