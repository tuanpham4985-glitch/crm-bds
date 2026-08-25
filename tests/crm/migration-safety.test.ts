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

test('import batch migration is additive: nullable column + new table only, no destructive statement', () => {
  const sql = readFileSync(resolve('prisma/migrations/20260825000003_add_crm_import_batch/migration.sql'), 'utf8');
  assert.doesNotMatch(sql, /\bDROP\b|TRUNCATE|DELETE\s+FROM|ALTER COLUMN.*NOT NULL/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "import_batch_id" TEXT/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "crm_import_batches"/);
  // Cột mới phải nullable (không có NOT NULL) để mọi khách hàng legacy vẫn hợp lệ (import_batch_id = NULL).
  assert.doesNotMatch(sql, /"import_batch_id" TEXT NOT NULL/);
});
