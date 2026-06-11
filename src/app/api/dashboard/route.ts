import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPipeline, getKhachHang, getNhanVien, getCongViec, getTongHopGiaoDich } from '@/lib/google-sheets';
import type { DashboardData, DoanhThuTheoSale, DoanhThuTheoDuAn, DoanhThuTheoThang, NguonKhachHang, SinhNhatNhanVien, PipelineFunnelItem, CrmTotals, TongHopStats, TongHopCompareItem, TongHopPhongKD, TongHopDuAn } from '@/lib/types';
import { GIAI_DOAN_PIPELINE } from '@/lib/constants';
import { SENIOR_EMPLOYEE_TYPES } from '@/lib/constants';

async function getIsAdmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('crm_session');
    if (!session) return false;
    const decoded = decodeURIComponent(escape(atob(session.value)));
    const user = JSON.parse(decoded);
    return user.vai_tro === 'Admin' || (SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(user.employee_type || '');
  } catch {
    return false;
  }
}

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
    const isAdmin = await getIsAdmin();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    const compare = searchParams.get('compare') || '';
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const [allPipelines, allCustomers, allEmployeesRaw, allCongViec] = await Promise.all([
      getPipeline(),
      getKhachHang(),
      getNhanVien(),
      getCongViec(),
    ]);

    // Fetch external Tổng hợp sheet in parallel (non-blocking if env not set)
    let tongHopRows: Awaited<ReturnType<typeof getTongHopGiaoDich>> = [];
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

    // Fetch tonghop data with date filter (silent fail if sheet not configured)
    try {
      tongHopRows = await getTongHopGiaoDich(dateRange.from, dateRange.to);
    } catch {
      tongHopRows = [];
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

    // Extend "to" by 1 day buffer to absorb UTC+7 timezone offset.
    // (Deals created at e.g. 11:00 VN time = 04:00 UTC, so server's "now" at 04:50 UTC
    //  would place a 11:00 VN deal *in the future* if naively compared in UTC)
    const toWithBuffer = new Date(dateRange.to);
    toWithBuffer.setDate(toWithBuffer.getDate() + 1);

    // Filter current period — PRIMARY: thang column (timezone-safe); FALLBACK: ngay_cap_nhat
    const currentPipelines = allPipelines.filter(pl => {
      // Primary: match by thang (format YYYY-MM or MM-YYYY) — no timezone issues
      if (pl.thang) {
        return currentThangKeys.has(pl.thang);
      }
      // Fallback: try to parse ngay_cap_nhat (add 1-day buffer to handle UTC+7 offset)
      if (pl.ngay_cap_nhat) {
        const d = safeParseDate(pl.ngay_cap_nhat);
        if (d && !isNaN(d.getTime())) {
          return d >= dateRange.from && d <= toWithBuffer;
        }
      }
      // No date info at all → include
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

    // Doanh thu theo sale — loại trừ "Đối tác" (không tính vào bảng xếp hạng nội bộ)
    const saleMap = new Map<string, DoanhThuTheoSale>();
    daKy.forEach(pl => {
      // Bỏ qua deal của Đối tác (kiểm tra cả sale_phu_trach và phong_kd)
      const isDoiTac =
        (pl.sale_phu_trach || '').toLowerCase().includes('đối tác') ||
        (pl.phong_kd || '').toLowerCase().includes('đối tác');
      if (isDoiTac) return;

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

    // KH chưa assign sale
    const kh_chua_assign = allCustomers.filter(kh => !kh.sale_phu_trach).length;

    // Funnel chuyển đổi — đếm tất cả pipeline theo giai đoạn (toàn thời gian)
    const funnelCountMap = new Map<string, number>();
    allPipelines.forEach(pl => {
      funnelCountMap.set(pl.giai_doan, (funnelCountMap.get(pl.giai_doan) || 0) + 1);
    });
    const pipeline_funnel: PipelineFunnelItem[] = GIAI_DOAN_PIPELINE.map(gd => ({
      giai_doan: gd,
      count: funnelCountMap.get(gd) || 0,
    }));

    const leaderboard = Array.from(saleMap.values()).sort((a, b) => b.doanh_thu - a.doanh_thu);

    // ── CRM module totals (admin verification panel) ──────────────────────────
    const activeStages = new Set(['Mới', 'Đã liên hệ', 'Hẹn xem', 'Đặt cọc', 'Ký HĐ']);
    const stageColors: Record<string, string> = {
      'Mới': '#94a3b8', 'Đã liên hệ': '#60a5fa', 'Hẹn xem': '#fbbf24',
      'Đặt cọc': '#34d399', 'Ký HĐ': '#22c55e',
      'Hủy - Không nghe máy': '#fb7185', 'Hủy - Không đủ tiền': '#fb7185', 'Hủy - Không thích': '#fb7185',
    };
    const statusColors: Record<string, string> = {
      'Chưa xử lý': '#fbbf24', 'Đang xử lý': '#60a5fa', 'Hoàn thành': '#34d399', 'Huỷ': '#94a3b8',
    };

    const pipelineStageMap = new Map<string, number>();
    allPipelines.forEach(pl => pipelineStageMap.set(pl.giai_doan, (pipelineStageMap.get(pl.giai_doan) || 0) + 1));

    const cvStatusMap = new Map<string, number>();
    allCongViec.forEach(cv => cvStatusMap.set(cv.trang_thai, (cvStatusMap.get(cv.trang_thai) || 0) + 1));

    const khNguonMap = new Map<string, number>();
    allCustomers.forEach(kh => { const n = kh.nguon || 'Khác'; khNguonMap.set(n, (khNguonMap.get(n) || 0) + 1); });

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const kh_moi_thang = allCustomers.filter(kh => {
      const d = safeParseDate(kh.ngay_tao);
      return d && d >= monthStart;
    }).length;

    const crm_totals: CrmTotals = {
      kh_total: allCustomers.length,
      kh_moi_thang,
      kh_by_nguon: Array.from(khNguonMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => ({ label, count })),
      pipeline_total: allPipelines.length,
      pipeline_active: allPipelines.filter(pl => activeStages.has(pl.giai_doan)).length,
      pipeline_by_stage: Array.from(pipelineStageMap.entries())
        .map(([label, count]) => ({ label, count, color: stageColors[label] })),
      cv_total: allCongViec.length,
      cv_by_status: Array.from(cvStatusMap.entries())
        .map(([label, count]) => ({ label, count, color: statusColors[label] })),
    };

    // ── Tổng hợp giao dịch stats ─────────────────────────────────────────────
    // Nếu có external sheet → dùng; fallback về pipeline data đã ký

    // Classify loại căn: 1BR/2BR/3BR/Penhouse/Penthouse → Cao tầng, còn lại → Thấp tầng
    const classifyLoaiCan = (loaiCan: string): 'Cao tầng' | 'Thấp tầng' =>
      /^([1-9]BR[+]?|penh?ouse|studio)/i.test((loaiCan || '').trim()) ? 'Cao tầng' : 'Thấp tầng';

    // Check if a string indicates Đối tác (partner, not internal team)
    const isDoiTacStr = (s: string): boolean => s.toLowerCase().includes('đối tác');

    const buildTongHopStats = (): TongHopStats => {
      if (tongHopRows.length > 0) {
        // Aggregate from external sheet
        const tong_doanh_so = tongHopRows.reduce((s, r) => s + r.gia_tri, 0);
        const tong_so_can   = tongHopRows.length;
        const gia_tri_tb_can = tong_so_can > 0 ? Math.round(tong_doanh_so / tong_so_can) : 0;

        // Loại hình: classify from Loại căn column (r.loai_hinh = raw value e.g. "1BR", "Shophouse")
        const loaiHinhMap = new Map<string, { so_can: number; doanh_so: number }>();
        tongHopRows.forEach(r => {
          const key = classifyLoaiCan(r.loai_hinh);
          const cur = loaiHinhMap.get(key) ?? { so_can: 0, doanh_so: 0 };
          loaiHinhMap.set(key, { so_can: cur.so_can + 1, doanh_so: cur.doanh_so + r.gia_tri });
        });

        // Nguồn (Nội bộ / Đối tác)
        const nguonMap = new Map<string, { so_can: number; doanh_so: number }>();
        tongHopRows.forEach(r => {
          const key = r.loai_nguon || 'Khác';
          const cur = nguonMap.get(key) ?? { so_can: 0, doanh_so: 0 };
          nguonMap.set(key, { so_can: cur.so_can + 1, doanh_so: cur.doanh_so + r.gia_tri });
        });

        // Phòng KD Top 5 — nội bộ only (exclude Đối tác)
        const phongKDMap = new Map<string, { so_can: number; doanh_so: number }>();
        tongHopRows.forEach(r => {
          if (!r.phong_kd) return;
          if (isDoiTacStr(r.phong_kd) || isDoiTacStr(r.loai_nguon)) return;
          const cur = phongKDMap.get(r.phong_kd) ?? { so_can: 0, doanh_so: 0 };
          phongKDMap.set(r.phong_kd, { so_can: cur.so_can + 1, doanh_so: cur.doanh_so + r.gia_tri });
        });

        // Khu vực (chi_nhanh grouping)
        const khuVucMap = new Map<string, { so_can: number; doanh_so: number }>();
        tongHopRows.forEach(r => {
          if (!r.chi_nhanh) return;
          const cur = khuVucMap.get(r.chi_nhanh) ?? { so_can: 0, doanh_so: 0 };
          khuVucMap.set(r.chi_nhanh, { so_can: cur.so_can + 1, doanh_so: cur.doanh_so + r.gia_tri });
        });

        // Dự án
        const topDuAnMap = new Map<string, { so_can: number; doanh_so: number }>();
        tongHopRows.forEach(r => {
          if (!r.du_an) return;
          const cur = topDuAnMap.get(r.du_an) ?? { so_can: 0, doanh_so: 0 };
          topDuAnMap.set(r.du_an, { so_can: cur.so_can + 1, doanh_so: cur.doanh_so + r.gia_tri });
        });

        const toArr = (m: Map<string, { so_can: number; doanh_so: number }>): TongHopCompareItem[] =>
          Array.from(m.entries())
            .map(([loai, v]) => ({ loai, so_can: v.so_can, doanh_so: v.doanh_so }))
            .sort((a, b) => b.doanh_so - a.doanh_so);

        return {
          tong_doanh_so, tong_so_can, gia_tri_tb_can,
          loai_hinh: toArr(loaiHinhMap),
          loai_nguon: toArr(nguonMap),
          top_phong_kd: Array.from(phongKDMap.entries())
            .map(([ten, v]) => ({ ten, so_can: v.so_can, doanh_so: v.doanh_so }))
            .sort((a, b) => b.doanh_so - a.doanh_so)
            .slice(0, 5),
          khu_vuc: toArr(khuVucMap).slice(0, 10),
          top_du_an: Array.from(topDuAnMap.entries())
            .map(([ten, v]) => ({ ten, so_can: v.so_can, doanh_so: v.doanh_so } as TongHopDuAn))
            .sort((a, b) => b.doanh_so - a.doanh_so)
            .slice(0, 10),
        };
      }

      // Fallback: dùng pipeline data
      const tong_doanh_so  = daKy.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0);
      const tong_so_can    = daKy.length;
      const gia_tri_tb_can = tong_so_can > 0 ? Math.round(tong_doanh_so / tong_so_can) : 0;

      // Nội bộ vs Đối tác từ pipeline
      let noiBoCount = 0, noiBoDS = 0, doiTacCount = 0, doiTacDS = 0;
      daKy.forEach(pl => {
        const isDoiTac =
          (pl.sale_phu_trach || '').toLowerCase().includes('đối tác') ||
          (pl.phong_kd || '').toLowerCase().includes('đối tác');
        if (isDoiTac) { doiTacCount++; doiTacDS += pl.gia_tri_thuc_te; }
        else          { noiBoCount++;  noiBoDS  += pl.gia_tri_thuc_te; }
      });

      // Top phòng KD từ pipeline — nội bộ only (exclude Đối tác)
      const phongMap = new Map<string, { so_can: number; doanh_so: number }>();
      daKy.forEach(pl => {
        const isDoiTac =
          (pl.sale_phu_trach || '').toLowerCase().includes('đối tác') ||
          (pl.phong_kd || '').toLowerCase().includes('đối tác');
        if (isDoiTac) return;
        const key = pl.phong_kd || 'Chưa phân';
        const cur = phongMap.get(key) ?? { so_can: 0, doanh_so: 0 };
        phongMap.set(key, { so_can: cur.so_can + 1, doanh_so: cur.doanh_so + pl.gia_tri_thuc_te });
      });

      return {
        tong_doanh_so, tong_so_can, gia_tri_tb_can,
        loai_hinh: [],
        loai_nguon: [
          { loai: 'Nội bộ',  so_can: noiBoCount,  doanh_so: noiBoDS },
          { loai: 'Đối tác', so_can: doiTacCount, doanh_so: doiTacDS },
        ].filter(x => x.so_can > 0),
        top_phong_kd: Array.from(phongMap.entries())
          .map(([ten, v]) => ({ ten, so_can: v.so_can, doanh_so: v.doanh_so }))
          .sort((a, b) => b.doanh_so - a.doanh_so)
          .slice(0, 5),
        khu_vuc: [],
        top_du_an: Array.from(duAnMap.values())
          .map(d => ({ ten: d.du_an, so_can: d.so_deal, doanh_so: d.doanh_thu } as TongHopDuAn))
          .sort((a, b) => b.doanh_so - a.doanh_so)
          .slice(0, 10),
      };
    };

    const tonghop = isAdmin ? buildTongHopStats() : undefined;

    const data: DashboardData = isAdmin ? {
      kpi: {
        tong_deal: currentPipelines.length,
        dang_xu_ly: dangXuLy.length,
        da_ky: daKy.length,
        doanh_thu: daKy.reduce((sum, pl) => sum + pl.gia_tri_thuc_te, 0),
        hoa_hong: daKy.reduce((sum, pl) => sum + pl.tien_hoa_hong, 0),
        kh_chua_assign,
        ...(compare ? {
          tong_deal_prev: prevPipelines.length,
          dang_xu_ly_prev: prevDangXuLy.length,
          da_ky_prev: prevDaKy.length,
          doanh_thu_prev: prevDaKy.reduce((sum, pl) => sum + pl.gia_tri_thuc_te, 0),
          hoa_hong_prev: prevDaKy.reduce((sum, pl) => sum + pl.tien_hoa_hong, 0),
        } : {}),
      },
      doanh_thu_theo_sale: leaderboard,
      doanh_thu_theo_du_an: Array.from(duAnMap.values()).sort((a, b) => b.doanh_thu - a.doanh_thu),
      doanh_thu_theo_thang: doanhThuTheoThang,
      nguon_khach_hang: nguonKhachHang,
      sinh_nhat_thang_nay: sinhNhatThangNay,
      pipeline_funnel,
      crm_totals,
      tonghop,
    } : {
      kpi: { tong_deal: 0, dang_xu_ly: 0, da_ky: 0, doanh_thu: 0, hoa_hong: 0, kh_chua_assign: 0 },
      doanh_thu_theo_sale: leaderboard,
      doanh_thu_theo_du_an: [],
      doanh_thu_theo_thang: [],
      nguon_khach_hang: [],
      sinh_nhat_thang_nay: sinhNhatThangNay,
      pipeline_funnel: [],
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi tải dashboard' }, { status: 500 });
  }
}
