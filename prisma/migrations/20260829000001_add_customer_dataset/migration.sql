-- Customer Dataset (Option B, locked business decision — audit
-- DATASET_ARCHITECTURE_NEEDS_AUTHORITY_DECISION resolved) — additive/
-- backward-compatible migration. No existing column dropped, renamed, made
-- NOT NULL without a default, or deduplicated.
--
-- khach_hang.import_batch_id is UNCHANGED (still original-creation
-- provenance, not repurposed as Dataset authority). Dataset is a NEW grouping
-- layer that a CrmImportBatch may optionally belong to (dataset_id nullable —
-- every existing batch keeps working with dataset_id = NULL).
-- CustomerDatasetMembership is the new M:N join enabling one Customer to
-- belong to multiple Datasets while remaining exactly one Customer master
-- row.
--
-- Zero rows are created/backfilled by this migration — no automatic
-- grouping/guessing of existing data. Backfilling Dataset membership for
-- pre-existing Customers/batches is a separate, explicit, Admin-only,
-- preview-then-confirm application action (see
-- src/lib/crm-funnel/dataset.ts#getDatasetBackfillPreflight/
-- applyDatasetBackfill) — never run automatically as part of a migration or
-- deploy.

CREATE TABLE IF NOT EXISTS "datasets" (
  "id"               TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "created_by_id"    TEXT NOT NULL,
  "created_by_name"  TEXT NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "datasets_created_at_idx" ON "datasets"("created_at");

ALTER TABLE "crm_import_batches"
  ADD COLUMN IF NOT EXISTS "dataset_id" TEXT;

CREATE INDEX IF NOT EXISTS "crm_import_batches_dataset_id_idx" ON "crm_import_batches"("dataset_id");

DO $$ BEGIN
  ALTER TABLE "crm_import_batches" ADD CONSTRAINT "crm_import_batches_dataset_id_fkey"
    FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "customer_dataset_memberships" (
  "id"           TEXT NOT NULL,
  "customer_id"  TEXT NOT NULL,
  "dataset_id"   TEXT NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_dataset_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "customer_dataset_memberships_customer_id_dataset_id_key" ON "customer_dataset_memberships"("customer_id", "dataset_id");
CREATE INDEX IF NOT EXISTS "customer_dataset_memberships_customer_id_idx" ON "customer_dataset_memberships"("customer_id");
CREATE INDEX IF NOT EXISTS "customer_dataset_memberships_dataset_id_idx" ON "customer_dataset_memberships"("dataset_id");

DO $$ BEGIN
  ALTER TABLE "customer_dataset_memberships" ADD CONSTRAINT "customer_dataset_memberships_dataset_id_fkey"
    FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
