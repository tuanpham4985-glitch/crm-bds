import { NextResponse } from 'next/server';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { resolvePrivateGroupsForEmployee } from '@/lib/crm-funnel/private-group';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// GET /api/private-groups/mine — Nhóm riêng mà CHÍNH actor đang đăng nhập là
// Leader HOẶC Sale member (deduped theo id), dùng cho UI "Thêm khách hàng"
// quyết định 0/1/nhiều nhóm (xem resolveManualCustomerGroup) — KHÁC với GET
// /api/private-groups (danh sách nhóm actor ĐƯỢC XEM, Admin thấy TẤT CẢ nhóm
// dù không phải Leader/member — không dùng được cho mục đích này).
//
// TransactionalCrmRequiredError (Postgres CRM chưa bật) -> trả success:true,
// data:[] thay vì 503 như các route Private Group khác: endpoint này CHỈ
// dùng để quyết định nhánh UI 0/1/nhiều nhóm trong flow "Thêm khách hàng"
// (luôn phải hoạt động được kể cả khi Postgres CRM tắt — Private Group đơn
// giản coi như không có nhóm nào, giữ đúng hành vi legacy "customer thường").
export async function GET() {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { leaderOf, memberOf } = await resolvePrivateGroupsForEmployee(user.id_nhan_vien);
    const distinct = new Map<string, string>();
    for (const g of [...leaderOf, ...memberOf]) distinct.set(g.id, g.name);
    const data = [...distinct.entries()].map(([id, name]) => ({ id, name }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: true, data: [] });
    console.error('[PrivateGroup mine]', error);
    return NextResponse.json({ success: false, error: 'Không thể tải Nhóm riêng của bạn' }, { status: 500 });
  }
}
