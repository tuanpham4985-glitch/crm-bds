import { NextRequest, NextResponse } from 'next/server';
import { getTongHopGiaoDich, getNhanVien } from '@/lib/data-access';
import { buildTravelSalesLeaderboard, applyLeaderboardDisplayRules } from '@/lib/dashboard-travel-sales';

// DASHBOARD_RACE_LEADERBOARD_LIGHTWEIGHT_ENDPOINT — trước đây "Request B" của
// Dashboard mount (GlobalChampionWidget/CỰC CHIẾN) gọi thẳng /api/dashboard
// (từ RACE_START_DATE tới hôm nay) chỉ để lấy result.data.doanh_thu_theo_sale,
// nhưng route đó vẫn chạy TOÀN BỘ Dashboard aggregation (Customer summary,
// getPipeline/funnel/crm_totals...) — xem audit DASHBOARD_DOUBLE_FETCH_AUDIT.
// Endpoint này tính ĐÚNG data widget cần: getTongHopGiaoDich(from,to,'signed')
// + buildTravelSalesLeaderboard() + applyLeaderboardDisplayRules() — CÙNG
// authoritative helper mà /api/dashboard dùng cho field doanh_thu_theo_sale ở
// reportMode mặc định (KHÔNG copy/paste logic riêng). Không nhận report_mode
// (widget này không dùng reportMode='race'/'standard' — request B hiện tại
// luôn gọi KHÔNG kèm report_mode, tức reportMode='default' phía route cũ).
//
// Auth: /api/dashboard hiện KHÔNG chặn theo isAdmin cho field
// doanh_thu_theo_sale — cả nhánh admin lẫn non-admin trong response đều trả
// selectedLeaderboard (bảng xếp hạng công khai cho mọi nhân viên đã đăng
// nhập). Endpoint này giữ NGUYÊN mức mở đó — không tự thêm gate isAdmin mới
// (sẽ là thắt chặt quyền truy cập ngoài phạm vi task).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    if (!fromParam || !toParam) {
      return NextResponse.json({ success: false, error: 'Thiếu from/to' }, { status: 400 });
    }
    // Cùng cách parse "from"/"to" với /api/dashboard (fromParam && toParam
    // branch) — to +'T23:59:59' để bao trọn ngày cuối khoảng.
    const from = new Date(fromParam);
    const to = new Date(toParam + 'T23:59:59');

    const [tongHopRows, allEmployeesRaw] = await Promise.all([
      getTongHopGiaoDich(from, to, 'signed'),
      getNhanVien(),
    ]);

    const leaderboard = applyLeaderboardDisplayRules(buildTravelSalesLeaderboard(tongHopRows), allEmployeesRaw);
    return NextResponse.json({ success: true, data: leaderboard });
  } catch (error) {
    console.error('Dashboard leaderboard error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi tải bảng xếp hạng' }, { status: 500 });
  }
}
