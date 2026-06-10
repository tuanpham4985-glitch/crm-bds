import { NextRequest, NextResponse } from 'next/server';
import { getPhanKhachConfigs, addPhanKhachConfig, deletePhanKhachConfig } from '@/lib/google-sheets';

export async function GET() {
  try {
    const data = await getPhanKhachConfigs();
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.ten_hien_thi || !body.sheet_id) {
      return NextResponse.json({ success: false, error: 'Thiếu tên hiển thị hoặc Sheet ID' }, { status: 400 });
    }
    const data = await addPhanKhachConfig({ ten_hien_thi: body.ten_hien_thi, sheet_id: body.sheet_id });
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: 'Thiếu id' }, { status: 400 });
    const deleted = await deletePhanKhachConfig(id);
    if (!deleted) return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
