import { NextResponse } from 'next/server';
import { getHopDong, addHopDong, updateHopDong, deleteHopDong } from '@/lib/google-sheets';

export async function GET() {
  try {
    const data = await getHopDong();
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API Contracts] GET Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = `HD${Date.now()}`;
    const newContract = {
      ...body,
      id,
      created_at: new Date().toISOString(),
    };
    await addHopDong(newContract);
    return NextResponse.json({ success: true, data: newContract });
  } catch (error: any) {
    console.error('[API Contracts] POST Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: 'Missing contract ID' }, { status: 400 });
    }
    const success = await updateHopDong(body);
    if (!success) {
      return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API Contracts] PUT Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: 'Missing contract ID' }, { status: 400 });
    }
    const success = await deleteHopDong(body.id);
    if (!success) {
      return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API Contracts] DELETE Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
