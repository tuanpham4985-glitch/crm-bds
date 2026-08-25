-- Import Batch tracking — additive/backward-compatible migration.
-- No existing column is dropped, renamed, made NOT NULL without a default, or deduplicated.
-- All existing khach_hang rows get import_batch_id = NULL (legacy, untracked import).

ALTER TABLE "khach_hang"
  ADD COLUMN IF NOT EXISTS "import_batch_id" TEXT;

CREATE INDEX IF NOT EXISTS "khach_hang_import_batch_id_idx" ON "khach_hang"("import_batch_id");

CREATE TABLE IF NOT EXISTS "crm_import_batches" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "imported_by_id" TEXT NOT NULL,
  "imported_by_name" TEXT NOT NULL,
  "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total_rows" INTEGER NOT NULL,
  "created_count" INTEGER NOT NULL,
  "duplicate_count" INTEGER NOT NULL,
  "invalid_count" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  CONSTRAINT "crm_import_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_import_batches_imported_at_idx" ON "crm_import_batches"("imported_at");
