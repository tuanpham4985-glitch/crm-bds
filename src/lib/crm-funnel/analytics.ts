import { prisma } from '../db/client';
import { assertTransactionalCrm } from './transactional-workflow';
import { parseJsonList } from '../crm-workflow';
import { HANDOFF_ELIGIBLE_STATUSES } from './handoff-policy';
import type { CrmChamSocEntry, QualifiedLeadFilters } from '../types';
import type { CrmManagerScope } from '../crm-auth';
import type { Prisma } from '../../generated/prisma/client';

export interface QualityLeadRow {
  id_khach_hang: string;
  ten_KH: string;
  so_dien_thoai: string;
  du_an: string;
  san_pham_quan_tam: string;
  nhu_cau: string;
  ngan_sach_min: number;
  ngan_sach_max: number;
  muc_dich: string;
  thoi_gian_du_kien: string;
  phuong_an_tai_chinh: string;
  khu_vuc_yeu_cau: string;
  muc_do_quan_tam: string;
  hanh_dong_tiep_theo: string;
  lead_quality_score: number;
  lead_quality_rank: string;
  qualification_status: string;
  lead_score_breakdown: string;
  nguon_data: string;
  telesale: string;
  sale_nhan: string;
  ngay_tao: string;
  ngay_quan_tam: string;
  ngay_ban_giao: string;
  ngay_sale_nhan: string;
  handoff_status: string;
  pipeline_status: string;
  latest_note: string;
}

// KHACH_HANG_P3A — narrow select: TOÀN BỘ field Customer thực sự được đọc bởi
// queryQualityLeads() + inScope() bên dưới (trace trực tiếp từ source, đếm
// từng `customer.<field>`/`item.<field>` — 27 field, không hơn không kém).
// KHÔNG đổi row scope (vẫn findMany không where) — CHỈ giảm số cột trả về từ
// ~48 xuống 27, loại các cột tài chính/text lịch sử KHÔNG dùng ở đây (VD
// lead_score_history, ghi_chu*, so_lan_lien_he...). CustomerRow suy ra TỪ
// CHÍNH select này (Prisma.KhachHangGetPayload) — thêm/bớt field dùng thật sẽ
// tự động bắt lỗi biên dịch nếu lệch với CUSTOMER_SELECT, không thể lệch âm
// thầm giữa 2 nơi.
const CUSTOMER_SELECT = {
  id_khach_hang: true,
  ten_KH: true,
  so_dien_thoai: true,
  du_an: true,
  san_pham_quan_tam: true,
  nhu_cau: true,
  ngan_sach_min: true,
  ngan_sach_max: true,
  muc_dich: true,
  thoi_gian_du_kien: true,
  phuong_an_tai_chinh: true,
  khu_vuc_yeu_cau: true,
  muc_do_quan_tam: true,
  hanh_dong_tiep_theo: true,
  lead_quality_score: true,
  lead_quality_rank: true,
  qualification_status: true,
  lead_score_breakdown: true,
  nguon: true,
  telesale_phu_trach: true,
  sale_nhan_khach: true,
  ngay_tao: true,
  ngay_quan_tam: true,
  ban_giao_luc: true,
  sale_xac_nhan_luc: true,
  trang_thai_ban_giao: true,
  lich_su_cham_soc: true,
} satisfies Prisma.KhachHangSelect;

type CustomerRow = Prisma.KhachHangGetPayload<{ select: typeof CUSTOMER_SELECT }>;

// DATA_TIEM_NANG_BUSINESS_REDESIGN — trước đây có FULL_SCOPE_SELECT/
// FullScopeCustomerRow riêng cho population ĐẦY ĐỦ (không entry gate) dùng
// tính summary/funnel. Approved redesign: "Data tiềm năng" chỉ còn SỞ HỮU
// đúng 1 population (eligible, CUSTOMER_SELECT) — full-CSKH funnel (Tổng
// data/Đã liên hệ + conversion tương ứng) là CSKH-domain analytics, ra khỏi
// scope trang này (xem DATA_TIEM_NANG_BUSINESS_REDESIGN_APPROVED). Giữ
// ScopeFields (CHỈ 2 field du_an/telesale_phu_trach) làm tham số inScope() —
// không đổi logic hàm, chỉ không còn cần dùng chung với type thứ 2 nào khác.
type ScopeFields = Pick<CustomerRow, 'du_an' | 'telesale_phu_trach'>;

function inScope(customer: ScopeFields, scope: CrmManagerScope): boolean {
  return scope.allCustomers
    || scope.projectNames.includes(customer.du_an || '')
    || scope.directReportNames.includes(customer.telesale_phu_trach || '');
}

function withinDate(value: string | null, from?: string, to?: string): boolean {
  if (!value) return !from && !to;
  const timestamp = new Date(value).getTime();
  if (from && timestamp < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && timestamp > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}

// DATA_TIEM_NANG_ENTRY_GATE remediation — export CHỈ để test regression gọi
// THẬT (không mirror) chứng minh rows-population/summary-population tách biệt
// đúng bằng dữ liệu giả lập (xem tests/crm/quality-leads-entry-gate.test.ts).
// KHÔNG đổi logic hàm, không phải capability mới cho app code (app code không
// import 2 hàm này — chỉ queryQualityLeads dùng nội bộ như cũ).
export function matches(row: QualityLeadRow, filters: QualifiedLeadFilters): boolean {
  if (filters.project && row.du_an !== filters.project) return false;
  if (filters.telesale && row.telesale !== filters.telesale) return false;
  if (filters.sale && row.sale_nhan !== filters.sale) return false;
  if (filters.source && row.nguon_data !== filters.source) return false;
  if (!withinDate(row.ngay_tao, filters.from, filters.to)) return false;
  if (filters.scoreMin !== undefined && row.lead_quality_score < filters.scoreMin) return false;
  if (filters.scoreMax !== undefined && row.lead_quality_score > filters.scoreMax) return false;
  if (filters.rank && row.lead_quality_rank !== filters.rank) return false;
  if (filters.interest && row.muc_do_quan_tam !== filters.interest) return false;
  if (filters.budgetMin !== undefined && row.ngan_sach_max < filters.budgetMin) return false;
  if (filters.budgetMax !== undefined && row.ngan_sach_min > filters.budgetMax) return false;
  if (filters.purpose && row.muc_dich !== filters.purpose) return false;
  if (filters.timeframe && row.thoi_gian_du_kien !== filters.timeframe) return false;
  if (filters.handoffStatus && row.handoff_status !== filters.handoffStatus) return false;
  if (filters.pipelineStatus && row.pipeline_status !== filters.pipelineStatus) return false;
  if (filters.search) {
    const query = filters.search.toLowerCase();
    if (![row.ten_KH, row.so_dien_thoai, row.du_an, row.san_pham_quan_tam].some(value => value.toLowerCase().includes(query))) return false;
  }
  return true;
}

export function summarize(rows: QualityLeadRow[]) {
  const transactionStages = new Set(['Đặt cọc', 'Ký HĐ']);
  const metrics = {
    total: rows.length,
    contacted: rows.filter(row => !['', 'RAW'].includes(row.qualification_status)).length,
    interested: rows.filter(row => ['INTERESTED', 'QUALIFIED', 'HOT'].includes(row.qualification_status)).length,
    qualified: rows.filter(row => ['QUALIFIED', 'HOT'].includes(row.qualification_status)).length,
    hot: rows.filter(row => row.qualification_status === 'HOT').length,
    transactions: rows.filter(row => transactionStages.has(row.pipeline_status)).length,
  };
  const conversion = {
    contactRate: metrics.total ? metrics.contacted / metrics.total : 0,
    interestRate: metrics.contacted ? metrics.interested / metrics.contacted : 0,
    qualifiedRate: metrics.interested ? metrics.qualified / metrics.interested : 0,
    hotRate: metrics.qualified ? metrics.hot / metrics.qualified : 0,
    transactionRate: metrics.qualified ? metrics.transactions / metrics.qualified : 0,
  };
  const group = (key: 'telesale' | 'nguon_data') => {
    const map = new Map<string, QualityLeadRow[]>();
    rows.forEach(row => map.set(row[key] || 'Chưa xác định', [...(map.get(row[key] || 'Chưa xác định') || []), row]));
    return [...map.entries()].map(([name, items]) => {
      const itemMetrics = summarizeBasic(items);
      return { name, ...itemMetrics, qualifiedRate: itemMetrics.total ? itemMetrics.qualified / itemMetrics.total : 0, hotRate: itemMetrics.total ? itemMetrics.hot / itemMetrics.total : 0 };
    }).sort((a, b) => b.qualified - a.qualified || b.total - a.total);
  };
  return { metrics, conversion, byTelesale: group('telesale'), bySource: group('nguon_data') };
}

function summarizeBasic(rows: QualityLeadRow[]) {
  return {
    total: rows.length,
    contacted: rows.filter(row => !['', 'RAW'].includes(row.qualification_status)).length,
    interested: rows.filter(row => ['INTERESTED', 'QUALIFIED', 'HOT'].includes(row.qualification_status)).length,
    qualified: rows.filter(row => ['QUALIFIED', 'HOT'].includes(row.qualification_status)).length,
    hot: rows.filter(row => row.qualification_status === 'HOT').length,
    transactions: rows.filter(row => ['Đặt cọc', 'Ký HĐ'].includes(row.pipeline_status)).length,
  };
}

// DATA_TIEM_NANG_ENTRY_GATE — "Data tiềm năng" KHÔNG phải danh sách toàn bộ
// Khách hàng. Chốt nghiệp vụ: RAW/CONTACTED (chưa gọi / đã gọi nhưng chưa xác
// nhận "Quan tâm") KHÔNG được xuất hiện — entry gate tối thiểu là
// qualification_status ∈ {INTERESTED, QUALIFIED, HOT}, đúng CÙNG tập
// HANDOFF_ELIGIBLE_STATUSES (handoff-policy.ts) đã dùng làm gate bàn giao —
// tái dùng NGUYÊN authority đó, không tự phát minh threshold/enum mới. Đẩy
// xuống Prisma WHERE thay vì fetch full table rồi filter trong JS (trước đây
// đọc TOÀN BỘ ~6998 Customer chỉ để lọc ra vài trăm/nghìn dòng thật sự đủ
// điều kiện — production-confirmed qua pg_stat_user_tables A/B test).
const DATA_TIEM_NANG_WHERE: Prisma.KhachHangWhereInput = {
  qualification_status: { in: [...HANDOFF_ELIGIBLE_STATUSES] },
};

export async function queryQualityLeads(filters: QualifiedLeadFilters, scope: CrmManagerScope) {
  assertTransactionalCrm();

  // DATA_TIEM_NANG_BUSINESS_REDESIGN_APPROVED — "Data tiềm năng" sở hữu ĐÚNG 1
  // population: eligible (qualification_status ∈ HANDOFF_ELIGIBLE_STATUSES).
  // Trước đây có Population A (full-scope, không entry gate) riêng cho
  // summary/funnel để giữ contactRate/interestRate không lệch denominator —
  // nhưng Architecture Review đã quyết định các số đó (Tổng data/Đã liên hệ +
  // 2 conversion đầu) là CSKH-domain analytics, KHÔNG thuộc quyền sở hữu của
  // trang này nữa (ra khỏi trang, không di chuyển đi đâu trong task này).
  // Summary/funnel/byTelesale/bySource giờ tính TRỰC TIẾP trên `rows` (đã lọc
  // eligible + filters) — không còn query Customer thứ 2.
  const eligibleCustomers = (await prisma.khachHang.findMany({ where: DATA_TIEM_NANG_WHERE, select: CUSTOMER_SELECT, orderBy: { ngay_tao: 'desc' } }))
    .filter(customer => inScope(customer, scope));
  const eligibleIds = eligibleCustomers.map(customer => customer.id_khach_hang);

  // Pipeline join thu hẹp về eligibleIds (trước đây fullScopeIds) — không còn
  // population full-scope nào cần pipeline_status nữa.
  const pipelines = await prisma.pipeline.findMany({ where: { id_khach_hang: { in: eligibleIds } }, orderBy: { updated_at: 'desc' } });
  const pipelineByCustomer = new Map<string, typeof pipelines[number]>();
  pipelines.forEach(item => { if (!pipelineByCustomer.has(item.id_khach_hang)) pipelineByCustomer.set(item.id_khach_hang, item); });

  // Handoff join: giữ nguyên scope eligibleIds như trước redesign (đã đúng).
  const handoffs = await prisma.crmHandoff.findMany({ where: { customer_id: { in: eligibleIds } }, orderBy: { created_at: 'desc' } });
  const handoffByCustomer = new Map<string, typeof handoffs[number]>();
  handoffs.forEach(item => { if (!handoffByCustomer.has(item.customer_id)) handoffByCustomer.set(item.customer_id, item); });

  const rows: QualityLeadRow[] = eligibleCustomers.map(customer => {
    const history = parseJsonList<CrmChamSocEntry>(customer.lich_su_cham_soc ?? undefined);
    const latest = history.at(-1);
    const pipeline = pipelineByCustomer.get(customer.id_khach_hang);
    const handoff = handoffByCustomer.get(customer.id_khach_hang);
    return {
      id_khach_hang: customer.id_khach_hang, ten_KH: customer.ten_KH, so_dien_thoai: customer.so_dien_thoai || '',
      du_an: customer.du_an || '', san_pham_quan_tam: customer.san_pham_quan_tam || '', nhu_cau: customer.nhu_cau || '',
      ngan_sach_min: customer.ngan_sach_min || 0, ngan_sach_max: customer.ngan_sach_max || 0,
      muc_dich: customer.muc_dich || '', thoi_gian_du_kien: customer.thoi_gian_du_kien || '',
      phuong_an_tai_chinh: customer.phuong_an_tai_chinh || '', khu_vuc_yeu_cau: customer.khu_vuc_yeu_cau || '',
      muc_do_quan_tam: customer.muc_do_quan_tam || 'Chưa xác định', hanh_dong_tiep_theo: customer.hanh_dong_tiep_theo || '',
      lead_quality_score: customer.lead_quality_score, lead_quality_rank: customer.lead_quality_rank,
      qualification_status: customer.qualification_status, lead_score_breakdown: customer.lead_score_breakdown || '[]',
      nguon_data: customer.nguon || '', telesale: customer.telesale_phu_trach || '', sale_nhan: customer.sale_nhan_khach || '',
      ngay_tao: customer.ngay_tao, ngay_quan_tam: customer.ngay_quan_tam || '',
      ngay_ban_giao: handoff?.created_at.toISOString() || customer.ban_giao_luc || '',
      ngay_sale_nhan: handoff?.accepted_at?.toISOString() || customer.sale_xac_nhan_luc || '',
      handoff_status: customer.trang_thai_ban_giao || 'Chưa bàn giao', pipeline_status: pipeline?.giai_doan || '',
      latest_note: latest?.ghi_chu || '',
    };
  }).filter(row => matches(row, filters));

  // DATA_TIEM_NANG_BUSINESS_REDESIGN_APPROVED — summary/conversion/byTelesale/
  // bySource giờ tính TỪ `rows` (eligible + filters đã áp dụng), KHÔNG còn
  // summaryRows/fullScopeCustomers riêng. Denominator đổi TỪ "toàn bộ CSKH
  // trong scope" SANG "toàn bộ Data tiềm năng (INTERESTED/QUALIFIED/HOT)
  // trong scope" — thay đổi CÓ CHỦ Ý theo quyết định nghiệp vụ đã duyệt.
  const summary = summarize(rows);

  // Options (FILTER_OPTION_METADATA) — nguồn TỪ eligible population (đúng
  // population mà filters/rows thao tác trên). `pipelines` giờ đã tự thu hẹp
  // về eligibleIds (xem join phía trên) nên không cần lọc lại eligibleIdSet.
  const options = {
    projects: [...new Set(eligibleCustomers.map(item => item.du_an).filter(Boolean))].sort(),
    telesales: [...new Set(eligibleCustomers.map(item => item.telesale_phu_trach).filter(Boolean))].sort(),
    sales: [...new Set(eligibleCustomers.map(item => item.sale_nhan_khach).filter(Boolean))].sort(),
    sources: [...new Set(eligibleCustomers.map(item => item.nguon).filter(Boolean))].sort(),
    pipelineStatuses: [...new Set(pipelines.map(item => item.giai_doan).filter(Boolean))].sort(),
  };
  return { rows, ...summary, options };
}

export function parseQualityFilters(searchParams: URLSearchParams): QualifiedLeadFilters {
  const number = (key: string) => searchParams.has(key) && searchParams.get(key) !== '' ? Number(searchParams.get(key)) : undefined;
  return {
    project: searchParams.get('project') || undefined, telesale: searchParams.get('telesale') || undefined,
    sale: searchParams.get('sale') || undefined, source: searchParams.get('source') || undefined,
    from: searchParams.get('from') || undefined, to: searchParams.get('to') || undefined,
    scoreMin: number('scoreMin'), scoreMax: number('scoreMax'), rank: searchParams.get('rank') as QualifiedLeadFilters['rank'] || undefined,
    interest: searchParams.get('interest') as QualifiedLeadFilters['interest'] || undefined,
    budgetMin: number('budgetMin'), budgetMax: number('budgetMax'), purpose: searchParams.get('purpose') as QualifiedLeadFilters['purpose'] || undefined,
    timeframe: searchParams.get('timeframe') as QualifiedLeadFilters['timeframe'] || undefined,
    handoffStatus: searchParams.get('handoffStatus') as QualifiedLeadFilters['handoffStatus'] || undefined,
    pipelineStatus: searchParams.get('pipelineStatus') || undefined, search: searchParams.get('search') || undefined,
  };
}
