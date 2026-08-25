import { NextRequest, NextResponse } from 'next/server';
import { probePhanKhachSheet } from '@/lib/data-access';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getCrmSessionUser();
    if (!isCrmAdmin(user)) return NextResponse.json({ ok: false, msg: 'Không có quyền kiểm tra nguồn data' }, { status: 403 });
    const { sheet_id } = await request.json();
    if (!sheet_id) {
      return NextResponse.json({ ok: false, msg: 'Thiếu sheet_id' }, { status: 400 });
    }
    const result = await probePhanKhachSheet(sheet_id);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, msg }, { status: 500 });
  }
}
