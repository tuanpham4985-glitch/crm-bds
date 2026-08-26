-- Campaign Foundation (M1A) — additive/backward-compatible migration.
-- No existing column is dropped, renamed, made NOT NULL without a default, or deduplicated.
-- Existing khach_hang rows and existing CRM workflow are unaffected: this migration only
-- adds 2 new tables and 1 nullable provenance column. Zero CampaignMembership rows are
-- created by this migration — no backfill, no inference from existing customers.

ALTER TABLE "crm_handoffs"
  ADD COLUMN IF NOT EXISTS "campaign_membership_id" TEXT;

CREATE INDEX IF NOT EXISTS "crm_handoffs_campaign_membership_id_idx" ON "crm_handoffs"("campaign_membership_id");

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "id_du_an" TEXT,
  "ten_du_an" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "start_date" TEXT,
  "end_date" TEXT,
  "description" TEXT,
  "owner_id" TEXT,
  "owner_name" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "campaigns_status_idx" ON "campaigns"("status");
CREATE INDEX IF NOT EXISTS "campaigns_id_du_an_idx" ON "campaigns"("id_du_an");

CREATE TABLE IF NOT EXISTS "campaign_memberships" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "telesale_id" TEXT,
  "telesale_name" TEXT,
  "assignment_status" TEXT NOT NULL DEFAULT 'UNASSIGNED',
  "assigned_at" TIMESTAMP(3),
  "assigned_by_id" TEXT,
  "assigned_by_name" TEXT,
  "trang_thai_cham_soc" TEXT DEFAULT 'Chưa gọi',
  "muc_do_quan_tam" TEXT DEFAULT 'Chưa xác định',
  "so_lan_lien_he" INTEGER NOT NULL DEFAULT 0,
  "lich_su_cham_soc" TEXT,
  "ngay_lien_he_cuoi" TEXT,
  "ngay_lien_he_tiep" TEXT,
  "qualification_status" TEXT NOT NULL DEFAULT 'RAW',
  "lead_quality_score" INTEGER NOT NULL DEFAULT 0,
  "lead_quality_rank" TEXT NOT NULL DEFAULT 'UNQUALIFIED',
  "lead_score_breakdown" TEXT,
  "lead_score_history" TEXT,
  "outcome" TEXT,
  "handoff_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campaign_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_memberships_customer_id_campaign_id_key" ON "campaign_memberships"("customer_id", "campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_memberships_campaign_id_idx" ON "campaign_memberships"("campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_memberships_customer_id_idx" ON "campaign_memberships"("customer_id");
CREATE INDEX IF NOT EXISTS "campaign_memberships_telesale_id_idx" ON "campaign_memberships"("telesale_id");
CREATE INDEX IF NOT EXISTS "campaign_memberships_assignment_status_idx" ON "campaign_memberships"("assignment_status");

DO $$ BEGIN
  ALTER TABLE "campaign_memberships" ADD CONSTRAINT "campaign_memberships_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
