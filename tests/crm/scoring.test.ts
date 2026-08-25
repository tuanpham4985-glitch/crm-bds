import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLeadQuality } from '../../src/lib/crm-funnel/scoring';
import { LEAD_SCORE_THRESHOLDS, LEAD_SCORE_WEIGHTS } from '../../src/lib/crm-funnel/config';
import { isHandoffEligible } from '../../src/lib/crm-funnel/handoff-policy';

const emptyLead = {
  du_an: '', san_pham_quan_tam: '', nhu_cau: '', ngan_sach_min: 0, ngan_sach_max: 0,
  muc_dich: undefined, thoi_gian_du_kien: undefined, phuong_an_tai_chinh: '',
  khu_vuc_yeu_cau: '', muc_do_quan_tam: 'Chưa xác định' as const,
  hanh_dong_tiep_theo: '', trang_thai_cham_soc: 'Chưa gọi' as const,
};

test('raw lead is deterministic and unqualified', () => {
  const first = calculateLeadQuality(emptyLead);
  const second = calculateLeadQuality(emptyLead);
  assert.deepEqual(first, second);
  assert.equal(first.score, 0);
  assert.equal(first.rank, 'UNQUALIFIED');
  assert.equal(first.qualificationStatus, 'RAW');
});

test('Quan tâm alone is not Qualified Lead', () => {
  const result = calculateLeadQuality({ ...emptyLead, trang_thai_cham_soc: 'Quan tâm', muc_do_quan_tam: 'Trung bình' });
  assert.equal(result.score, 18);
  assert.equal(result.qualificationStatus, 'INTERESTED');
  assert.ok(result.score < LEAD_SCORE_THRESHOLDS.QUALIFIED);
});

test('complete near-term lead reaches HOT with explainable 100 points', () => {
  const result = calculateLeadQuality({
    ...emptyLead, trang_thai_cham_soc: 'Quan tâm', muc_do_quan_tam: 'Rất cao',
    du_an: 'Dự án A', san_pham_quan_tam: 'Căn 2PN', nhu_cau: 'Ở thực',
    ngan_sach_min: 2_000_000_000, ngan_sach_max: 3_000_000_000, muc_dich: 'Để ở',
    thoi_gian_du_kien: 'Trong 1 tháng', phuong_an_tai_chinh: 'Vốn 50%, vay 50%',
    khu_vuc_yeu_cau: 'Quận 2', hanh_dong_tiep_theo: 'Hẹn xem nhà',
  });
  assert.equal(result.score, 100);
  assert.equal(result.rank, 'HOT');
  assert.equal(result.qualificationStatus, 'HOT');
  assert.equal(result.breakdown.reduce((sum, item) => sum + item.points, 0), 100);
});

test('nguon_data không còn cộng điểm chất lượng cho từng khách (chỉ dùng để phân tích aggregate theo nguồn)', () => {
  const withSource = calculateLeadQuality({ ...emptyLead, trang_thai_cham_soc: 'Quan tâm', muc_do_quan_tam: 'Cao' });
  assert.ok(!withSource.breakdown.some(item => item.key === 'source'));
  assert.ok(!('source' in LEAD_SCORE_WEIGHTS));
  assert.equal(Object.values(LEAD_SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0), 100);
});

test('INTERESTED (khách xác nhận quan tâm) đủ điều kiện handoff, không cần đạt QUALIFIED/HOT', () => {
  const result = calculateLeadQuality({ ...emptyLead, trang_thai_cham_soc: 'Quan tâm', muc_do_quan_tam: 'Trung bình' });
  assert.equal(result.qualificationStatus, 'INTERESTED');
  assert.ok(result.score < LEAD_SCORE_THRESHOLDS.QUALIFIED);
  assert.equal(isHandoffEligible(result.qualificationStatus), true);
});

test('WARM + INTERESTED vẫn handoff được: qualification score thấp không chặn bàn giao', () => {
  const result = calculateLeadQuality({
    ...emptyLead, trang_thai_cham_soc: 'Quan tâm', muc_do_quan_tam: 'Cao',
    du_an: 'Dự án A', nhu_cau: 'Ở thực', thoi_gian_du_kien: '6-12 tháng',
  });
  assert.equal(result.rank, 'WARM');
  assert.equal(result.qualificationStatus, 'INTERESTED');
  assert.equal(isHandoffEligible(result.qualificationStatus), true);
});

test('RAW/CONTACTED/UNQUALIFIED không đủ điều kiện handoff', () => {
  assert.equal(isHandoffEligible('RAW'), false);
  assert.equal(isHandoffEligible('CONTACTED'), false);
  assert.equal(isHandoffEligible('UNQUALIFIED'), false);
  assert.equal(isHandoffEligible(undefined), false);
});

test('terminal invalid interaction never becomes qualified even with complete fields', () => {
  const result = calculateLeadQuality({
    ...emptyLead, trang_thai_cham_soc: 'Sai số', muc_do_quan_tam: 'Rất cao', du_an: 'A',
    san_pham_quan_tam: 'B', nhu_cau: 'C', ngan_sach_min: 1, muc_dich: 'Đầu tư',
    thoi_gian_du_kien: 'Trong 1 tháng', phuong_an_tai_chinh: 'Tiền mặt',
    khu_vuc_yeu_cau: 'HCM', hanh_dong_tiep_theo: 'Gọi lại',
  });
  assert.equal(result.qualificationStatus, 'UNQUALIFIED');
});
