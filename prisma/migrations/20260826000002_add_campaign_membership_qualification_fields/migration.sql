-- CampaignMembership qualification-input fields (M1B.1) — additive/backward-
-- compatible. No existing column is dropped, renamed, made NOT NULL without a
-- default, or deduplicated. Mirrors the KhachHang qualification-input field
-- names/types so scoring.ts's ScoreableLead input works unchanged against
-- Membership rows (see src/lib/crm-funnel/scoring.ts). No backfill/inference
-- from khach_hang: every new column starts NULL (or 0 for row_version) for
-- all existing campaign_memberships rows.

ALTER TABLE "campaign_memberships"
  ADD COLUMN IF NOT EXISTS "san_pham_quan_tam" TEXT,
  ADD COLUMN IF NOT EXISTS "nhu_cau" TEXT,
  ADD COLUMN IF NOT EXISTS "ngan_sach_min" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ngan_sach_max" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "muc_dich" TEXT,
  ADD COLUMN IF NOT EXISTS "thoi_gian_du_kien" TEXT,
  ADD COLUMN IF NOT EXISTS "phuong_an_tai_chinh" TEXT,
  ADD COLUMN IF NOT EXISTS "khu_vuc_yeu_cau" TEXT,
  ADD COLUMN IF NOT EXISTS "hanh_dong_tiep_theo" TEXT,
  ADD COLUMN IF NOT EXISTS "row_version" INTEGER NOT NULL DEFAULT 0;
