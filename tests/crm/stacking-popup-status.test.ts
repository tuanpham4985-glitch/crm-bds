import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { effectiveDotStatus } from '../../src/lib/stacking-list';

test('popup: Sheet sold marker overrides available status without changing source data', () => {
  const row = { trangThai: 'con_hang' as const, marker: 'da_ban' as const };
  assert.equal(effectiveDotStatus(row), 'da_ban');
  assert.equal(row.trangThai, 'con_hang');
});

test('popup: CRM sold status stays sold; Check Admin alone does not mark a unit sold', () => {
  assert.equal(effectiveDotStatus({ trangThai: 'da_ban' }), 'da_ban');
  assert.equal(effectiveDotStatus({ trangThai: 'con_hang', marker: 'check_admin' }), 'con_hang');
});

test('list popup uses one rounded effective-status badge and suppresses extra markers for sold units', () => {
  const source = readFileSync('src/app/stacking/page.tsx', 'utf8');
  const modal = source.slice(source.indexOf('function ListUnitDetailModal('));
  const statusSection = modal.slice(0, modal.indexOf('{/* Thông tin cơ bản */}'));
  assert.match(statusSection, /const displayStatus = effectiveDotStatus\(row\)/);
  assert.match(statusSection, /STATUS_LABEL\[displayStatus\]/);
  assert.match(statusSection, /STATUS_COLOR\[displayStatus\]/);
  assert.match(statusSection, /borderRadius: 999/);
  assert.match(statusSection, /displayStatus !== 'da_ban' && row\.marker === 'check_admin'/);
  assert.doesNotMatch(statusSection, /STATUS_LABEL\[row\.trangThai\]/);
});
