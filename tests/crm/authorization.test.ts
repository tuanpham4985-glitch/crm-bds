import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCrmManagerScope, customerInManagerScope, isCrmAdmin } from '../../src/lib/crm-auth';
import { canActOnHandoff, isOwnershipLocked, validRejectionReason } from '../../src/lib/crm-funnel/handoff-policy';
import { validateQualificationInput } from '../../src/lib/crm-funnel/qualification-input';
import { signSessionValue, verifySessionValue } from '../../src/lib/auth/session-signature';

const manager = { id_nhan_vien: 'NV1', ho_ten: 'Quản lý A', email: 'a@example.com', vai_tro: 'User' };

test('quality dashboard scope includes only managed project/direct reports', () => {
  const scope = buildCrmManagerScope(manager, [
    { id_du_an: 'DA1', ten_du_an: 'Alpha', truong_nhom: 'Quản lý A' },
    { id_du_an: 'DA2', ten_du_an: 'Beta', truong_nhom: 'Người khác' },
  ] as never[], [
    { id_nhan_vien: 'TS1', ho_ten: 'Telesale 1', ql_truc_tiep: 'Quản lý A' },
  ] as never[]);
  assert.equal(scope.canManageQuality, true);
  assert.equal(customerInManagerScope({ du_an: 'Alpha' }, scope), true);
  assert.equal(customerInManagerScope({ telesale_phu_trach: 'Telesale 1' }, scope), true);
  assert.equal(customerInManagerScope({ du_an: 'Beta', telesale_phu_trach: 'Telesale 2' }, scope), false);
});

test('Telesale cannot accept/reject for another receiver or reassign', () => {
  assert.equal(canActOnHandoff({ action: 'handoff', isManager: false, isReceiver: false }), false);
  assert.equal(canActOnHandoff({ action: 'accept', isManager: true, isReceiver: false }), false);
  assert.equal(canActOnHandoff({ action: 'reject', isManager: false, isReceiver: true }), true);
});

test('accepted ownership is locked and rejection reason is mandatory', () => {
  assert.equal(isOwnershipLocked('Đã nhận'), true);
  assert.equal(validRejectionReason(''), false);
  assert.equal(validRejectionReason('Không phù hợp khu vực'), true);
});

test('ordinary Telesale is not CRM admin', () => {
  assert.equal(isCrmAdmin({ ...manager, vai_tro: 'Telesale', employee_type: 'Telesale' }), false);
});

test('qualification rejects client-calculated score and invalid budget', () => {
  assert.match(validateQualificationInput({ lead_quality_score: 99 }) || '', /server tính/);
  assert.match(validateQualificationInput({ ngan_sach_min: 200, ngan_sach_max: 100 }) || '', /không được lớn hơn/);
  assert.equal(validateQualificationInput({ muc_dich: 'Đầu tư', ngan_sach_min: 100 }), null);
});

test('CRM session authorization rejects tampered identity cookie', () => {
  const value = Buffer.from(JSON.stringify({ id_nhan_vien: 'NV1', vai_tro: 'User' })).toString('base64');
  const signature = signSessionValue(value, 'test-secret');
  assert.equal(verifySessionValue(value, signature, 'test-secret'), true);
  assert.equal(verifySessionValue(`${value}tampered`, signature, 'test-secret'), false);
});
