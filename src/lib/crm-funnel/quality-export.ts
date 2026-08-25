import * as XLSX from 'xlsx';
import type { QualityLeadRow } from './analytics';

export const QUALITY_EXPORT_HEADERS = [
  'Tên khách', 'SĐT', 'Dự án', 'Sản phẩm', 'Nhu cầu', 'Ngân sách từ', 'Ngân sách đến',
  'Mục đích', 'Thời gian dự kiến', 'Phương án tài chính', 'Khu vực / yêu cầu',
  'Mức quan tâm', 'Lead Score', 'Lead Rank', 'Nguồn data', 'Telesale', 'Sale nhận khách',
  'Ngày quan tâm', 'Ngày bàn giao', 'Ngày Sale nhận', 'Trạng thái qualification',
  'Trạng thái handoff', 'Trạng thái Pipeline', 'Hành động tiếp theo', 'Ghi chú gần nhất',
] as const;

export type QualityExportRecord = Record<(typeof QUALITY_EXPORT_HEADERS)[number], string | number>;

export function qualityExportRecords(rows: QualityLeadRow[]): QualityExportRecord[] {
  return rows.map(row => ({
    'Tên khách': row.ten_KH, 'SĐT': row.so_dien_thoai, 'Dự án': row.du_an,
    'Sản phẩm': row.san_pham_quan_tam, 'Nhu cầu': row.nhu_cau,
    'Ngân sách từ': row.ngan_sach_min, 'Ngân sách đến': row.ngan_sach_max,
    'Mục đích': row.muc_dich, 'Thời gian dự kiến': row.thoi_gian_du_kien,
    'Phương án tài chính': row.phuong_an_tai_chinh, 'Khu vực / yêu cầu': row.khu_vuc_yeu_cau,
    'Mức quan tâm': row.muc_do_quan_tam, 'Lead Score': row.lead_quality_score,
    'Lead Rank': row.lead_quality_rank, 'Nguồn data': row.nguon_data, 'Telesale': row.telesale,
    'Sale nhận khách': row.sale_nhan, 'Ngày quan tâm': row.ngay_quan_tam,
    'Ngày bàn giao': row.ngay_ban_giao, 'Ngày Sale nhận': row.ngay_sale_nhan,
    'Trạng thái qualification': row.qualification_status, 'Trạng thái handoff': row.handoff_status,
    'Trạng thái Pipeline': row.pipeline_status, 'Hành động tiếp theo': row.hanh_dong_tiep_theo,
    'Ghi chú gần nhất': row.latest_note,
  }));
}

export function createQualityWorkbookBuffer(rows: QualityLeadRow[]): Buffer {
  const records = qualityExportRecords(rows);
  const sheet = XLSX.utils.json_to_sheet(records, { header: [...QUALITY_EXPORT_HEADERS] });
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  sheet['!autofilter'] = { ref: `A1:Y${Math.max(1, records.length + 1)}` };
  sheet['!cols'] = QUALITY_EXPORT_HEADERS.map(header => ({ wch: Math.min(40, Math.max(12, header.length + 3)) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data chất lượng');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}
