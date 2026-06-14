import { NextRequest, NextResponse } from 'next/server';
import { getTaiChinhHistory } from '@/lib/google-sheets';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rows = await getTaiChinhHistory();
    const row = rows.find(r => r.id === params.id);
    if (!row) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });
    const data = JSON.parse(row.data_json);
    return NextResponse.json(data);
  } catch (err) {
    console.error('History load error:', err);
    return NextResponse.json({ error: 'Lỗi tải báo cáo' }, { status: 500 });
  }
}
