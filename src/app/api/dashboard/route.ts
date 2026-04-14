import { NextRequest, NextResponse } from 'next/server';
import { getPipeline, getKhachHang, getNhanVien } from '@/lib/google-sheets';
import type { DashboardData, DoanhThuTheoSale, DoanhThuTheoDuAn, DoanhThuTheoThang, NguonKhachHang } from '@/lib/types';

function getDateRange(period: string): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
  const now = new Date();
  const to = new Date(now);
  let from: Date;
  let prevFrom: Date;
  let prevTo: Date;

  switch (period) {
    case 'week': {
      const dayOfWeek = now.getDay() || 7;
      from = new Date(now);
      from.setDate(now.getDate() - dayOfWeek + 1);
      from.setHours(0, 0, 0, 0);
      prevTo = new Date(from);
      prevTo.setDate(prevTo.getDate() - 1);
      prevFrom = new Date(prevTo);
      prevFrom.setDate(prevFrom.getDate() - 6);
      break;
    }
    case 'month': {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevTo = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      from = new Date(now.getFullYear(), q * 3, 1);
      prevFrom = new Date(now.getFullYear(), (q - 1) * 3, 1);
      prevTo = new Date(now.getFullYear(), q * 3, 0);
      break;
    }
    case 'year': {
      from = new Date(now.getFullYear(), 0, 1);
      prevFrom = new Date(now.getFullYear() - 1, 0, 1);
      prevTo = new Date(now.getFullYear() - 1, 11, 31);
      break;
    }
    default: {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevTo = new Date(now.getFullYear(), now.getMonth(), 0);
    }
  }

  return { from, to, prevFrom, prevTo };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    const compare = searchParams.get('compare') || '';
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const [allPipelines, allCustomers, allEmployees] = await Promise.all([
      getPipeline(),
      getKhachHang(),
      getNhanVien(),
    ]);

    let dateRange = getDateRange(period);
    if (fromParam && toParam) {
      dateRange.from = new Date(fromParam);
      dateRange.to = new Date(toParam + 'T23:59:59');
    }

    // Filter current period
    const currentPipelines = allPipelines.filter(pl => {
      if (!pl.ngay_cap_nhat) return true; // include if no date
      const d = new Date(pl.ngay_cap_nhat);
      return d >= dateRange.from && d <= dateRange.to;
    });

    // Filter previous period for comparison
    const prevPipelines = compare ? allPipelines.filter(pl => {
      if (!pl.ngay_cap_nhat) return false;
      const d = new Date(pl.ngay_cap_nhat);
      if (compare === 'yoy') {
        // Same period, previous year
        const yoyFrom = new Date(dateRange.from);
        yoyFrom.setFullYear(yoyFrom.getFullYear() - 1);
        const yoyTo = new Date(dateRange.to);
        yoyTo.setFullYear(yoyTo.getFullYear() - 1);
        return d >= yoyFrom && d <= yoyTo;
      }
      return d >= dateRange.prevFrom && d <= dateRange.prevTo;
    }) : [];

    // KPI calculations
    const daKy = currentPipelines.filter(pl => pl.giai_doan === 'Ký HĐ');
    const dangXuLy = currentPipelines.filter(pl => 
      !['Ký HĐ', 'Hủy - Không nghe máy', 'Hủy - Không đủ tiền', 'Hủy - Không thích'].includes(pl.giai_doan)
    );

    const prevDaKy = prevPipelines.filter(pl => pl.giai_doan === 'Ký HĐ');
    const prevDangXuLy = prevPipelines.filter(pl => 
      !['Ký HĐ', 'Hủy - Không nghe máy', 'Hủy - Không đủ tiền', 'Hủy - Không thích'].includes(pl.giai_doan)
    );

    // Doanh thu theo sale
    const saleMap = new Map<string, DoanhThuTheoSale>();
    daKy.forEach(pl => {
      const key = pl.sale_phu_trach || 'Chưa phân';
      let existing = saleMap.get(key);
      if (!existing) {
        existing = { nhan_vien: key, doanh_thu: 0, hoa_hong: 0, so_deal: 0 };
        if (key !== 'Chưa phân') {
          const emp = allEmployees.find(nv => nv.ho_ten === key);
          if (emp && emp.avatar_url) {
            existing.avatar_url = emp.avatar_url;
          }
        }
      }
      existing.doanh_thu += pl.gia_tri_thuc_te;
      existing.hoa_hong += pl.tien_hoa_hong;
      existing.so_deal += 1;
      saleMap.set(key, existing);
    });

    // Doanh thu theo dự án
    const duAnMap = new Map<string, DoanhThuTheoDuAn>();
    daKy.forEach(pl => {
      const key = pl.ten_du_an || pl.id_du_an || 'Chưa xác định';
      const existing = duAnMap.get(key) || { du_an: key, doanh_thu: 0, hoa_hong: 0, so_deal: 0 };
      existing.doanh_thu += pl.gia_tri_thuc_te;
      existing.hoa_hong += pl.tien_hoa_hong;
      existing.so_deal += 1;
      duAnMap.set(key, existing);
    });

    // Doanh thu theo tháng
    const thangMap = new Map<string, number>();
    const thangPrevMap = new Map<string, number>();
    daKy.forEach(pl => {
      if (pl.thang) {
        thangMap.set(pl.thang, (thangMap.get(pl.thang) || 0) + pl.gia_tri_thuc_te);
      }
    });
    prevDaKy.forEach(pl => {
      if (pl.thang) {
        thangPrevMap.set(pl.thang, (thangPrevMap.get(pl.thang) || 0) + pl.gia_tri_thuc_te);
      }
    });

    const doanhThuTheoThang: DoanhThuTheoThang[] = Array.from(
      new Set([...thangMap.keys(), ...thangPrevMap.keys()])
    ).sort().map(thang => ({
      thang,
      doanh_thu: thangMap.get(thang) || 0,
      doanh_thu_prev: thangPrevMap.get(thang) || 0,
    }));

    // Nguồn khách hàng
    const nguonMap = new Map<string, number>();
    allCustomers.forEach(kh => {
      const nguon = kh.nguon || 'Khác';
      nguonMap.set(nguon, (nguonMap.get(nguon) || 0) + 1);
    });
    const nguonKhachHang: NguonKhachHang[] = Array.from(nguonMap).map(([nguon, so_luong]) => ({
      nguon,
      so_luong,
    }));

    const data: DashboardData = {
      kpi: {
        tong_deal: currentPipelines.length,
        dang_xu_ly: dangXuLy.length,
        da_ky: daKy.length,
        doanh_thu: daKy.reduce((sum, pl) => sum + pl.gia_tri_thuc_te, 0),
        hoa_hong: daKy.reduce((sum, pl) => sum + pl.tien_hoa_hong, 0),
        ...(compare ? {
          tong_deal_prev: prevPipelines.length,
          dang_xu_ly_prev: prevDangXuLy.length,
          da_ky_prev: prevDaKy.length,
          doanh_thu_prev: prevDaKy.reduce((sum, pl) => sum + pl.gia_tri_thuc_te, 0),
          hoa_hong_prev: prevDaKy.reduce((sum, pl) => sum + pl.tien_hoa_hong, 0),
        } : {}),
      },
      doanh_thu_theo_sale: Array.from(saleMap.values()).sort((a, b) => b.doanh_thu - a.doanh_thu),
      doanh_thu_theo_du_an: Array.from(duAnMap.values()).sort((a, b) => b.doanh_thu - a.doanh_thu),
      doanh_thu_theo_thang: doanhThuTheoThang,
      nguon_khach_hang: nguonKhachHang,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi tải dashboard' }, { status: 500 });
  }
}
