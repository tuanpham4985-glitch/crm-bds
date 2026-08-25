import { prisma } from '../db/client';
import { assertTransactionalCrm } from './transactional-workflow';
import { parseJsonList } from '../crm-workflow';
import type { CrmChamSocEntry, QualifiedLeadFilters } from '../types';
import type { CrmManagerScope } from '../crm-auth';

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

type CustomerRow = Awaited<ReturnType<typeof prisma.khachHang.findMany>>[number];

function inScope(customer: CustomerRow, scope: CrmManagerScope): boolean {
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

function matches(row: QualityLeadRow, filters: QualifiedLeadFilters): boolean {
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

function summarize(rows: QualityLeadRow[]) {
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

export async function queryQualityLeads(filters: QualifiedLeadFilters, scope: CrmManagerScope) {
  assertTransactionalCrm();
  const customers = (await prisma.khachHang.findMany({ orderBy: { ngay_tao: 'desc' } })).filter(customer => inScope(customer, scope));
  const ids = customers.map(customer => customer.id_khach_hang);
  const [pipelines, handoffs] = await Promise.all([
    prisma.pipeline.findMany({ where: { id_khach_hang: { in: ids } }, orderBy: { updated_at: 'desc' } }),
    prisma.crmHandoff.findMany({ where: { customer_id: { in: ids } }, orderBy: { created_at: 'desc' } }),
  ]);
  const pipelineByCustomer = new Map<string, typeof pipelines[number]>();
  pipelines.forEach(item => { if (!pipelineByCustomer.has(item.id_khach_hang)) pipelineByCustomer.set(item.id_khach_hang, item); });
  const handoffByCustomer = new Map<string, typeof handoffs[number]>();
  handoffs.forEach(item => { if (!handoffByCustomer.has(item.customer_id)) handoffByCustomer.set(item.customer_id, item); });

  const rows: QualityLeadRow[] = customers.map(customer => {
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

  const summary = summarize(rows);
  const options = {
    projects: [...new Set(customers.map(item => item.du_an).filter(Boolean))].sort(),
    telesales: [...new Set(customers.map(item => item.telesale_phu_trach).filter(Boolean))].sort(),
    sales: [...new Set(customers.map(item => item.sale_nhan_khach).filter(Boolean))].sort(),
    sources: [...new Set(customers.map(item => item.nguon).filter(Boolean))].sort(),
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
