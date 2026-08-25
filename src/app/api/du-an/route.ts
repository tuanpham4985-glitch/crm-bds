import { NextRequest, NextResponse } from 'next/server';
import { getDuAn, addDuAn, updateDuAn, deleteDuAn } from '@/lib/data-access';
import { generateId } from '@/lib/utils';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';

export async function GET() {
  try {
    const data = await getDuAn();
    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error) {
    console.error('DuAn GET error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi đọc dữ liệu' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCrmSessionUser();
    if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Không có quyền thêm dự án' }, { status: 403 });
    const body = await request.json();
    const da = {
      ...body,
      id_du_an: generateId('DA_'),
    };
    await addDuAn(da);
    return NextResponse.json({ success: true, data: da });
  } catch (error) {
    console.error('DuAn POST error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi thêm dự án' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCrmSessionUser();
    if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const current = (await getDuAn()).find(item => item.id_du_an === body.id_du_an);
    if (!current) return NextResponse.json({ success: false, error: 'Không tìm thấy dự án' }, { status: 404 });
    const admin = isCrmAdmin(user);
    if (!admin && current.truong_nhom !== user.ho_ten) {
      return NextResponse.json({ success: false, error: 'Không có quyền cập nhật dự án' }, { status: 403 });
    }
    const safeBody = admin ? body : {
      ...current,
      truong_nhom: current.truong_nhom,
      ds_sale: body.ds_sale ?? current.ds_sale,
    };
    const updated = await updateDuAn(safeBody);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy dự án' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('DuAn PUT error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi cập nhật' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCrmSessionUser();
    if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Không có quyền xóa dự án' }, { status: 403 });
    const { id } = await request.json();
    const deleted = await deleteDuAn(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy dự án' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DuAn DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi xóa' }, { status: 500 });
  }
}
