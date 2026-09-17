import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageHRM } from '../../src/lib/auth/hrm-authority';

// Cùng logic canManageHRM() đã dùng ở /api/nhan-vien, tách ra để test được
// trực tiếp — approved architecture §8 "API mới phải có server-side HRM
// authorization, không copy auth gap của /api/contracts".

test('canManageHRM: null/chưa đăng nhập bị chặn', () => {
  assert.equal(canManageHRM(null), false);
});

test('canManageHRM: Admin/HR được phép', () => {
  assert.equal(canManageHRM({ vai_tro: 'Admin', employee_type: '' }), true);
  assert.equal(canManageHRM({ vai_tro: 'HR', employee_type: '' }), true);
});

test('canManageHRM: chức danh cấp cao (SENIOR_EMPLOYEE_TYPES) được phép dù vai_tro thường', () => {
  assert.equal(canManageHRM({ vai_tro: 'Sale', employee_type: 'CEO' }), true);
  assert.equal(canManageHRM({ vai_tro: 'Sale', employee_type: 'Chủ tịch' }), true);
});

test('canManageHRM: nhân viên thường (Sale, không chức danh cấp cao) bị chặn', () => {
  assert.equal(canManageHRM({ vai_tro: 'Sale', employee_type: 'NVKD' }), false);
});
