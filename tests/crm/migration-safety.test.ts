import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('qualified lead migration is additive and has concurrency guards', () => {
  const sql = readFileSync(resolve('prisma/migrations/20260825000002_add_qualified_lead_funnel/migration.sql'), 'utf8');
  assert.doesNotMatch(sql, /\bDROP\b|TRUNCATE|DELETE\s+FROM/i);
  assert.match(sql, /crm_handoffs_active_key_key/);
  assert.match(sql, /crm_handoffs_idempotency_key_key/);
  assert.match(sql, /crm_pipeline_links_customer_id_key/);
  assert.match(sql, /crm_export_audits/);
});
