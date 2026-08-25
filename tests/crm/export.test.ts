import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createQualityWorkbookBuffer, QUALITY_EXPORT_HEADERS, qualityExportRecords } from '../../src/lib/crm-funnel/quality-export';
import type { QualityLeadRow } from '../../src/lib/crm-funnel/analytics';

const row: QualityLeadRow = {
  id_khach_hang: 'KH1', ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0900123456', du_an: 'Alpha',
  san_pham_quan_tam: 'Căn A1', nhu_cau: '2PN', ngan_sach_min: 2_000_000_000,
  ngan_sach_max: 3_000_000_000, muc_dich: 'Mua ở', thoi_gian_du_kien: '1-3 tháng',
  phuong_an_tai_chinh: 'Vay 50%', khu_vuc_yeu_cau: 'TP.HCM', muc_do_quan_tam: 'Cao',
  hanh_dong_tiep_theo: 'Hẹn xem', lead_quality_score: 82, lead_quality_rank: 'HOT',
  qualification_status: 'HOT', lead_score_breakdown: '[]', nguon_data: 'Facebook', telesale: 'TS A',
  sale_nhan: 'Sale A', ngay_tao: '2026-08-01', ngay_quan_tam: '2026-08-02',
  ngay_ban_giao: '2026-08-03', ngay_sale_nhan: '2026-08-04', handoff_status: 'ACCEPTED',
  pipeline_status: 'Mới', latest_note: 'Khách hẹn thứ Bảy',
};

test('export projection contains all required columns', () => {
  const record = qualityExportRecords([row])[0];
  assert.deepEqual(Object.keys(record), [...QUALITY_EXPORT_HEADERS]);
  assert.equal(record['SĐT'], '0900123456');
  assert.equal(record['Lead Score'], 82);
});

test('xlsx export can be reopened and retains filtered record', () => {
  const workbook = XLSX.read(createQualityWorkbookBuffer([row]), { type: 'buffer' });
  const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Data chất lượng']);
  assert.equal(values.length, 1);
  assert.equal(values[0]['Tên khách'], 'Nguyễn Văn A');
  assert.equal(values[0]['SĐT'], '0900123456');
});
