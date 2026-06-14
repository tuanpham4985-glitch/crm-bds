import { NextRequest, NextResponse } from 'next/server';
import { getPipeline, getNhanVien } from '@/lib/google-sheets';

// Temporary debug endpoint — xem raw pipeline data cho một sale cụ thể
// Usage: GET /api/debug-sale?name=Vũ Thị Thu
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name') || '';
  const showAll = searchParams.get('all') === '1';

  const [allPipelines, allEmployees] = await Promise.all([getPipeline(), getNhanVien()]);

  // Tìm nhân viên
  const empMatch = allEmployees.filter(nv =>
    !name || nv.ho_ten.toLowerCase().includes(name.toLowerCase())
  );

  // Tìm pipeline theo sale_phu_trach
  const plMatch = allPipelines.filter(pl =>
    !name || (pl.sale_phu_trach || '').toLowerCase().includes(name.toLowerCase())
  );

  // Thống kê tất cả giá trị thang unique để debug format
  const thangValues = new Map<string, number>();
  for (const pl of plMatch) {
    const t = pl.thang || '(empty)';
    thangValues.set(t, (thangValues.get(t) || 0) + 1);
  }

  // Thống kê tất cả giai_doan
  const giaiDoanValues = new Map<string, number>();
  for (const pl of plMatch) {
    const g = pl.giai_doan || '(empty)';
    giaiDoanValues.set(g, (giaiDoanValues.get(g) || 0) + 1);
  }

  // Thống kê tất cả sale names trong pipeline (để kiểm tra spelling)
  const allSaleNames = new Map<string, number>();
  for (const pl of allPipelines) {
    const s = pl.sale_phu_trach || '(empty)';
    allSaleNames.set(s, (allSaleNames.get(s) || 0) + 1);
  }

  // Tìm những tên giống Vũ Thị Thu (fuzzy)
  const similarNames = name
    ? Array.from(allSaleNames.keys()).filter(n =>
        n.toLowerCase().includes('thu') ||
        n.toLowerCase().includes('vu') ||
        n.toLowerCase().includes('vũ')
      )
    : [];

  return NextResponse.json({
    search: name || '(no filter)',
    employees_found: empMatch.map(e => ({
      id: e.id_nhan_vien,
      ho_ten: e.ho_ten,
      trang_thai: e.trang_thai,
      employee_type: e.employee_type,
    })),
    pipeline_count: plMatch.length,
    thang_values: Object.fromEntries(thangValues),
    giai_doan_values: Object.fromEntries(giaiDoanValues),
    ky_hd_deals: plMatch
      .filter(pl => pl.giai_doan === 'Ký HĐ')
      .map(pl => ({
        id: pl.id_pipeline,
        sale: pl.sale_phu_trach,
        giai_doan: pl.giai_doan,
        gia_tri: pl.gia_tri_thuc_te,
        thang: pl.thang,
        ngay_cap_nhat: pl.ngay_cap_nhat,
        ten_du_an: pl.ten_du_an,
        phong_kd: pl.phong_kd,
      })),
    similar_sale_names_in_pipeline: similarNames,
    ...(showAll ? {
      all_pipelines: plMatch.map(pl => ({
        id: pl.id_pipeline,
        sale: pl.sale_phu_trach,
        giai_doan: pl.giai_doan,
        gia_tri: pl.gia_tri_thuc_te,
        thang: pl.thang,
        ngay_cap_nhat: pl.ngay_cap_nhat,
      }))
    } : {}),
  });
}
