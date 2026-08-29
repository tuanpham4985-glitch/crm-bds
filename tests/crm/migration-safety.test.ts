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

test('customer dataset migration is additive: nullable FK column + 2 new tables only, no destructive statement, no auto-backfill', () => {
  const sql = readFileSync(resolve('prisma/migrations/20260829000001_add_customer_dataset/migration.sql'), 'utf8');
  assert.doesNotMatch(sql, /\bDROP\b|TRUNCATE|DELETE\s+FROM|ALTER COLUMN.*NOT NULL/i);
  assert.doesNotMatch(sql, /INSERT INTO/i, 'migration KHÔNG được tự backfill/gán Dataset cho customer/batch cũ nào — remediation là hành động Admin riêng, không phải 1 phần migration');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "datasets"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "customer_dataset_memberships"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "dataset_id" TEXT/);
  // dataset_id trên crm_import_batches phải nullable — mọi batch cũ (trước khi Dataset tồn tại) vẫn hợp lệ.
  assert.doesNotMatch(sql, /"dataset_id" TEXT NOT NULL/);
  // FK membership -> dataset phải RESTRICT (không CASCADE) — xóa Dataset không được kéo xóa Customer nào.
  assert.match(sql, /customer_dataset_memberships_dataset_id_fkey[\s\S]{0,120}ON DELETE RESTRICT/);
  // FK batch -> dataset là SET NULL (xóa Dataset không phá batch, chỉ gỡ liên kết).
  assert.match(sql, /crm_import_batches_dataset_id_fkey[\s\S]{0,120}ON DELETE SET NULL/);
  // unique (customer_id, dataset_id) — nền tảng cho createMany skipDuplicates idempotent.
  assert.match(sql, /customer_dataset_memberships_customer_id_dataset_id_key/);
});
