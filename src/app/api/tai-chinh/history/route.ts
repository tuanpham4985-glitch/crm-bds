import { NextResponse } from 'next/server';
import { getTaiChinhHistory } from '@/lib/google-sheets';

export async function GET() {
  try {
    const rows = await getTaiChinhHistory();
    // Strip data_json from list view — client fetches full data only when loading a specific report
    const list = rows.map(({ data_json: _d, ...rest }) => rest);
    return NextResponse.json(list);
  } catch (err) {
    console.error('History GET error:', err);
    return NextResponse.json({ error: 'Không thể tải lịch sử' }, { status: 500 });
  }
}
