import { NextRequest, NextResponse } from 'next/server';
import { getPipeline, getKhachHang, getNhanVien } from '@/lib/google-sheets';
import type { DashboardData, DoanhThuTheoSale, DoanhThuTheoDuAn, DoanhThuTheoThang, NguonKhachHang, SinhNhatNhanVien } from '@/lib/types';

/**
 * Parse a date string in many formats returned by Google Sheets.
 * Supports: DD/MM/YYYY, YYYY-MM-DD, M/D/YYYY, DD-MM-YYYY, DD.MM.YYYY, ISO timestamps.
 * FIX: was checking year > 2000, now correctly checks year >= 1900.
 */
function parseBirthDate(raw: string): { day: number; month: number; year: number } | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // Handle ISO timestamp: "1990-05-15T00:00:00.000Z" or "1990-05-15T17:00:00Z"
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { day, month, year };
    }
  }

  // Split on / - or . (handle DD/MM/YYYY, YYYY-MM-DD, DD.MM.YYYY)
  const parts = s.split(/[\/\-\.]/);
  if (parts.length !== 3) return null;

  const p1 = parseInt(parts[0], 10);
  const p2 = parseInt(parts[1], 10);
  const p3 = parseInt(parts[2], 10);

  if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;

  // YYYY-MM-DD or YYYY/MM/DD: first part is 4-digit year >= 1900
  if (p1 >= 1900 && p2 >= 1 && p2 <= 12 && p3 >= 1 && p3 <= 31) {
    return { day: p3, month: p2, year: p1 };
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY: last part is 4-digit year >= 1900
  if (p3 >= 1900 && p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
    return { day: p1, month: p2, year: p3 };
  }

  // M/D/YYYY (US format, e.g. Google Sheets EN locale): last part is year, p2 could be day > 12
  if (p3 >= 1900 && p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
    return { day: p2, month: p1, year: p3 };
  }

  return null;
}

/**
 * Parse date safely supporting ISO, US and Vietnamese DD/MM/YYYY formats.
 */
function safeParseDate(s: string): Date | null {
  if (!s) return null;
  const strVal = s.trim();
  if (!strVal) return null;

  // 1. Try native Date parsing (ISO, etc.)
  let d = new Date(strVal);
  if (!isNaN(d.getTime())) return d;

  // 2. Try DD/MM/YYYY HH:mm:ss format
  const match = strVal.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{1,2}):?(\d{1,2})?)?/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-based
    const year = parseInt(match[3], 10);
    const hour = match[4] ? parseInt(match[4], 10) : 0;
    const min = match[5] ? parseInt(match[5], 10) : 0;
    const sec = match[6] ? parseInt(match[6], 10) : 0;
    
    d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

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

    const [allPipelines, allCustomers, allEmployeesRaw] = await Promise.all([
      getPipeline(),
      getKhachHang(),
      getNhanVien(),
    ]);
    // Ẩn nhân viên "Nghỉ việc" khỏi dashboard
    const allEmployees = allEmployeesRaw.filter(nv => nv.trang_thai !== 'Nghỉ việc');

    // === Sinh nhật nhân viên trong tháng hiện tại ===
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentDay = now.getDate();
    const currentYear = now.getFullYear();

    const sinhNhatThangNay: SinhNhatNhanVien[] = allEmployees
      .filter(nv => nv.trang_thai !== 'Nghỉ việc')
      .reduce<SinhNhatNhanVien[]>((acc, nv) => {
        const parsed = parseBirthDate(nv.ngay_sinh || '');
        if (!parsed) return acc;
        if (parsed.month !== currentMonth) return acc;
        const tuoi = currentYear - parsed.year;
        acc.push({
          id_nhan_vien: nv.id_nhan_vien,
          ho_ten: nv.ho_ten,
          ngay_sinh: nv.ngay_sinh || '',
          ngay: parsed.day,
          thang: parsed.month,
          tuoi,
          avatar_url: nv.avatar_url,
          employee_type: nv.employee_type,
          phong_KD: nv.phong_KD,
          la_hom_nay: parsed.day === currentDay,
        });
        return acc;
      }, [])
      .sort((a, b) => a.ngay - b.ngay); // Sắp xếp theo ngày tăng dần

    let dateRange = getDateRange(period);
    if (fromParam && toParam) {
      dateRange.from = new Date(fromParam);
      dateRange.to = new Date(toParam + 'T23:59:59');
    }

    // Debug: log first 3 pipelines to trace what data arrives from Sheets
    if (allPipelines.length > 0) {
      console.log('[Dashboard] Sample pipeline rows:',
        allPipelines.slice(0, 3).map(p => ({
          id: p.id_pipeline,
          giai_doan: p.giai_doan,
          ngay_cap_nhat: p.ngay_cap_nhat,
          thang: p.thang,
          sale: p.sale_phu_trach,
          gia_tri: p.gia_tri_thuc_te,
        }))
      );
    }

    // Build current-period thang keys — both formats: MM-YYYY (CRM) and YYYY-MM (Victory/Apps Script)
    function buildThangKeysInRange(from: Date, to: Date): Set<string> {
      const keys = new Set<string>();
      const cur = new Date(from.getFullYear(), from.getMonth(), 1);
      while (cur <= to) {
        const mm = String(cur.getMonth() + 1).padStart(2, '0');
        const yyyy = String(cur.getFullYear());
        keys.add(`${mm}-${yyyy}`);   // format: 05-2026
        keys.add(`${yyyy}-${mm}`);   // format: 2026-05
        cur.setMonth(cur.getMonth() + 1);
      }
      return keys;
    }

    const currentThangKeys = buildThangKeysInRange(dateRange.from, dateRange.to);

    // Filter current period — primary: ngay_cap_nhat; fallback: thang column
    const currentPipelines = allPipelines.filter(pl => {
      // Try to parse ngay_cap_nhat
      if (pl.ngay_cap_nhat) {
        const d = safeParseDate(pl.ngay_cap_nhat);
        if (d && !isNaN(d.getTime())) {
          return d >= dateRange.from && d <= dateRange.to;
        }
      }
      // Fallback: use thang column (format MM-YYYY) if date parse failed or missing
      if (pl.thang) {
        return currentThangKeys.has(pl.thang);
      }
      // No date info at all → include (safer than excluding)
      return true;
    });

    // Filter previous period for comparison
    const prevThangKeys = compare ? buildThangKeysInRange(dateRange.prevFrom, dateRange.prevTo) : new Set<string>();
    const prevPipelines = compare ? allPipelines.filter(pl => {
      if (pl.ngay_cap_nhat) {
        const d = safeParseDate(pl.ngay_cap_nhat);
        if (d && !isNaN(d.getTime())) {
          if (compare === 'yoy') {
            const yoyFrom = new Date(dateRange.from);
            yoyFrom.setFullYear(yoyFrom.getFullYear() - 1);
            const yoyTo = new Date(dateRange.to);
            yoyTo.setFullYear(yoyTo.getFullYear() - 1);
            return d >= yoyFrom && d <= yoyTo;
          }
          return d >= dateRange.prevFrom && d <= dateRange.prevTo;
        }
      }
      if (pl.thang) return prevThangKeys.has(pl.thang);
      return false;
    }) : [];

    console.log(`[Dashboard] Period: ${period}, current: ${currentPipelines.length} pipelines, prevPipelines: ${prevPipelines.length}`);
    console.log(`[Dashboard] currentThangKeys: ${[...currentThangKeys].join(', ')}`);

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
      sinh_nhat_thang_nay: sinhNhatThangNay,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi tải dashboard' }, { status: 500 });
  }
}
