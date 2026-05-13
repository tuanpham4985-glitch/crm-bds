import { NextResponse } from 'next/server';
import { getNhanVien } from '@/lib/google-sheets';

export async function GET() {
  try {
    const employees = await getNhanVien();
    const debug = employees.map(nv => ({
      ho_ten: nv.ho_ten,
      ngay_sinh_raw: nv.ngay_sinh,
      ngay_sinh_type: typeof nv.ngay_sinh,
      ngay_sinh_len: nv.ngay_sinh?.length ?? 0,
      trang_thai: nv.trang_thai,
    }));
    return NextResponse.json({ success: true, total: employees.length, data: debug });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
