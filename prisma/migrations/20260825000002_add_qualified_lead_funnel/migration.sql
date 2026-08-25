-- Qualified Lead Funnel — additive/backward-compatible migration.
-- No existing column is dropped, renamed, made NOT NULL without a default, or deduplicated.

ALTER TABLE "khach_hang"
  ADD COLUMN IF NOT EXISTS "san_pham_quan_tam" TEXT,
  ADD COLUMN IF NOT EXISTS "ngan_sach_min" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ngan_sach_max" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "muc_dich" TEXT,
  ADD COLUMN IF NOT EXISTS "thoi_gian_du_kien" TEXT,
  ADD COLUMN IF NOT EXISTS "phuong_an_tai_chinh" TEXT,
  ADD COLUMN IF NOT EXISTS "khu_vuc_yeu_cau" TEXT,
  ADD COLUMN IF NOT EXISTS "hanh_dong_tiep_theo" TEXT,
  ADD COLUMN IF NOT EXISTS "qualification_status" TEXT NOT NULL DEFAULT 'RAW',
  ADD COLUMN IF NOT EXISTS "lead_quality_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lead_quality_rank" TEXT NOT NULL DEFAULT 'UNQUALIFIED',
  ADD COLUMN IF NOT EXISTS "lead_score_breakdown" TEXT,
  ADD COLUMN IF NOT EXISTS "lead_score_history" TEXT,
  ADD COLUMN IF NOT EXISTS "ngay_quan_tam" TEXT,
  ADD COLUMN IF NOT EXISTS "qualified_at" TEXT,
  ADD COLUMN IF NOT EXISTS "hot_at" TEXT,
  ADD COLUMN IF NOT EXISTS "row_version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "khach_hang_qualification_status_idx" ON "khach_hang"("qualification_status");
CREATE INDEX IF NOT EXISTS "khach_hang_lead_quality_rank_idx" ON "khach_hang"("lead_quality_rank");
CREATE INDEX IF NOT EXISTS "khach_hang_lead_quality_score_idx" ON "khach_hang"("lead_quality_score");
CREATE INDEX IF NOT EXISTS "khach_hang_ngay_quan_tam_idx" ON "khach_hang"("ngay_quan_tam");

CREATE TABLE IF NOT EXISTS "crm_handoffs" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "active_key" TEXT,
  "status" TEXT NOT NULL,
  "telesale_id" TEXT,
  "telesale_name" TEXT NOT NULL,
  "sale_id" TEXT,
  "sale_name" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_by_id" TEXT,
  "accepted_by_name" TEXT,
  "accepted_at" TIMESTAMP(3),
  "rejected_by_id" TEXT,
  "rejected_by_name" TEXT,
  "rejected_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "manager_note" TEXT,
  "qualification_score" INTEGER NOT NULL DEFAULT 0,
  "qualification_rank" TEXT NOT NULL DEFAULT 'UNQUALIFIED',
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_handoffs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_handoffs_idempotency_key_key" ON "crm_handoffs"("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_handoffs_active_key_key" ON "crm_handoffs"("active_key");
CREATE INDEX IF NOT EXISTS "crm_handoffs_customer_id_created_at_idx" ON "crm_handoffs"("customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "crm_handoffs_sale_name_status_idx" ON "crm_handoffs"("sale_name", "status");
CREATE INDEX IF NOT EXISTS "crm_handoffs_status_idx" ON "crm_handoffs"("status");

CREATE TABLE IF NOT EXISTS "crm_pipeline_links" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "pipeline_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_pipeline_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_pipeline_links_customer_id_key" ON "crm_pipeline_links"("customer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_pipeline_links_pipeline_id_key" ON "crm_pipeline_links"("pipeline_id");

CREATE TABLE IF NOT EXISTS "crm_export_audits" (
  "id" TEXT NOT NULL,
  "exported_by_id" TEXT NOT NULL,
  "exported_by_name" TEXT NOT NULL,
  "exported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "filters_json" TEXT NOT NULL,
  "record_count" INTEGER NOT NULL,
  "export_type" TEXT NOT NULL,
  "destination" TEXT,
  CONSTRAINT "crm_export_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_export_audits_exported_by_id_exported_at_idx" ON "crm_export_audits"("exported_by_id", "exported_at");
CREATE INDEX IF NOT EXISTS "crm_export_audits_export_type_exported_at_idx" ON "crm_export_audits"("export_type", "exported_at");
