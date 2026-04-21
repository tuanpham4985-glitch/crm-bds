import { NextRequest, NextResponse } from 'next/server';
import { getHopDong, addHopDong, updateHopDong, deleteHopDong } from '@/lib/google-sheets';
import { generateId } from '@/lib/utils';

export async function GET() {
  try {
    const data = await getHopDong();
    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error) {
    console.error('Contracts GET error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi đọc dữ liệu hợp đồng' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[Contracts API] Incoming POST body:', JSON.stringify(body, null, 2));

    const hd = {
      ...body,
      id: generateId('HD'),
      created_at: new Date().toISOString(),
    };
    
    console.log('[Contracts API] Attempting to add HopDong to Google Sheets:', JSON.stringify(hd, null, 2));
    await addHopDong(hd);
    console.log('[Contracts API] Successfully written to Google Sheets');
    
    return NextResponse.json({ success: true, data: hd });
  } catch (error) {
    console.error('Contracts POST error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updated = await updateHopDong(body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy hợp đồng' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('Contracts PUT error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi cập nhật hợp đồng' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    const deleted = await deleteHopDong(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy hợp đồng' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contracts DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi xóa hợp đồng' }, { status: 500 });
  }
}
