import assert from 'node:assert/strict';
import test from 'node:test';
import { planContractTerminations, type HrResignationRecord, type TerminationContract } from '../../src/lib/sync/contract-termination-from-hr';
import { getContractStatus, toISODate } from '../../src/lib/contract-status';

const TODAY = '2026-10-12';

const rec = (mnv: string, trang_thai: string, ngay_nghi_viec: string, raw = ngay_nghi_viec): HrResignationRecord =>
  ({ mnv, ho_ten: `NV ${mnv}`, trang_thai, ngay_nghi_viec, ngay_nghi_viec_raw: raw });

const hd = (id: string, id_nhan_vien: string, ngay_bat_dau: string, ngay_ket_thuc: string, ngay_cham_dut = ''): TerminationContract =>
  ({ id, id_nhan_vien, so_hop_dong: id, ngay_bat_dau, ngay_ket_thuc, ngay_cham_dut });

test('resigned employee: contract running past resignation date gets ngay_cham_dut', () => {
  const plan = planContractTerminations(
    [rec('18', 'Nghỉ việc', '2026-04-11', '11/04/2026')],
    [hd('0018/VIC_HĐLĐ', '0018', '2026-01-01', '2026-12-31')],
    TODAY,
  );
  assert.deepEqual(plan.updates, [{ id: '0018/VIC_HĐLĐ', so_hop_dong: '0018/VIC_HĐLĐ', ngay_cham_dut: '2026-04-11' }]);
});

test('contract that already ended before resignation is not terminated', () => {
  const plan = planContractTerminations(
    [rec('0018', 'Nghỉ việc', '2026-04-11')],
    [hd('TV', '0018', '2025-08-01', '2025-09-30'), hd('CT', '0018', '2026-01-01', '2026-12-31', '2026-04-11')],
    TODAY,
  );
  assert.deepEqual(plan.updates, []);
});

test('missing date for resigned employee is reported, nothing written', () => {
  const plan = planContractTerminations(
    [rec('0006', 'Nghỉ việc', '', '')],
    [hd('A', '0006', '2026-01-08', '2027-01-07')],
    TODAY,
  );
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.missingDate, ['0006 - NV 0006']);
});

test('unparseable date is reported, nothing written', () => {
  const plan = planContractTerminations(
    [rec('0062', 'Nghỉ việc', '', 'nghỉ từ tháng 5')],
    [hd('A', '0062', '2026-01-01', '2026-12-31')],
    TODAY,
  );
  assert.deepEqual(plan.updates, []);
  assert.equal(plan.invalidDate.length, 1);
});

test('past date but status not Nghỉ việc is a conflict, nothing written', () => {
  const plan = planContractTerminations(
    [rec('0125', 'CTV', '2026-10-02')],
    [hd('A', '0125', '2026-01-01', '2026-12-31')],
    TODAY,
  );
  assert.deepEqual(plan.updates, []);
  assert.equal(plan.conflicts.length, 1);
});

test('future resignation date for still-working employee is recorded', () => {
  const plan = planContractTerminations(
    [rec('0100', 'Chính thức', '2026-11-30')],
    [hd('A', '0100', '2026-01-01', '2026-12-31')],
    TODAY,
  );
  assert.deepEqual(plan.updates.map(u => u.ngay_cham_dut), ['2026-11-30']);
});

test('resignation date before an active contract start is a conflict (likely typo)', () => {
  const plan = planContractTerminations(
    [rec('0027', 'Nghỉ việc', '2021-08-31')],
    [hd('A', '0027', '2026-01-01', '2026-12-31')],
    TODAY,
  );
  assert.deepEqual(plan.updates, []);
  assert.equal(plan.conflicts.length, 1);
});

test('cleared date for active employee removes stale ngay_cham_dut', () => {
  const plan = planContractTerminations(
    [rec('0050', 'Chính thức', '', '')],
    [hd('A', '0050', '2026-01-01', '2026-12-31', '2026-05-01')],
    TODAY,
  );
  assert.deepEqual(plan.updates.map(u => u.ngay_cham_dut), ['']);
});

test('getContractStatus: terminated beats end date; same day still active', () => {
  assert.equal(getContractStatus({ ngay_ket_thuc: '2026-12-31', ngay_cham_dut: '2026-04-11' }, TODAY), 'Đã chấm dứt');
  assert.equal(getContractStatus({ ngay_ket_thuc: '2026-12-31', ngay_cham_dut: TODAY }, TODAY), 'Còn hiệu lực');
  assert.equal(getContractStatus({ ngay_ket_thuc: '2026-12-31', ngay_cham_dut: '' }, TODAY), 'Còn hiệu lực');
  assert.equal(getContractStatus({ ngay_ket_thuc: '2026-09-30' }, TODAY), 'Hết hạn');
  assert.equal(getContractStatus({ ngay_ket_thuc: '' }, TODAY), 'Còn hiệu lực');
});

test('toISODate handles ISO and dd/mm/yyyy, rejects invalid month', () => {
  assert.equal(toISODate('2026-04-11T00:00:00.000Z'), '2026-04-11');
  assert.equal(toISODate('11/04/2026'), '2026-04-11');
  assert.equal(toISODate('5/28/2026'), '');
});
