-- "Nhóm riêng" CSKH work queue — additive/backward-compatible migration.
-- ONLY adds nullable/defaulted columns to the EXISTING "private_group_customers"
-- table (created by 20260903000001_add_private_groups). No column dropped,
-- renamed, made NOT NULL without a default, and no other table touched
-- (private_groups, private_group_members, khach_hang, campaigns,
-- campaign_memberships, ... all UNCHANGED). Every existing row in
-- private_group_customers gets the column defaults below — zero data loss,
-- zero row rewritten beyond adding the new columns.
--
-- Field names/types are a DELIBERATE mirror of campaign_memberships' CSKH +
-- qualification columns (see 20260826000002_add_campaign_membership_qualification_fields)
-- — NOT incidental duplication: src/lib/crm-funnel/scoring.ts#calculateLeadQuality
-- and src/lib/crm-funnel/membership-workflow.ts#planMembershipInteraction/
-- planMembershipQualification are pure functions that only need matching
-- field NAMES/TYPES (not a specific table) — mirroring lets
-- private_group_customers reuse those exact functions instead of a second,
-- divergent scoring/idempotency implementation for "Nhóm riêng" CSKH.
--
-- Deliberately OMITTED (vs campaign_memberships): assignment_status,
-- telesale_id/telesale_name/assigned_at/assigned_by_*, outcome, handoff_id —
-- Private Group already has its own entered_by_id/assigned_to_id for "who
-- cares for this customer in this group" (unrelated concept), and Private
-- Group CSKH NEVER creates a CrmHandoff/Pipeline (locked business decision).

ALTER TABLE "private_group_customers"
  ADD COLUMN IF NOT EXISTS "trang_thai_cham_soc"  TEXT    DEFAULT 'Chưa gọi',
  ADD COLUMN IF NOT EXISTS "muc_do_quan_tam"       TEXT    DEFAULT 'Chưa xác định',
  ADD COLUMN IF NOT EXISTS "so_lan_lien_he"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lich_su_cham_soc"      TEXT,
  ADD COLUMN IF NOT EXISTS "ngay_lien_he_cuoi"     TEXT,
  ADD COLUMN IF NOT EXISTS "ngay_lien_he_tiep"     TEXT,
  ADD COLUMN IF NOT EXISTS "qualification_status"  TEXT    NOT NULL DEFAULT 'RAW',
  ADD COLUMN IF NOT EXISTS "lead_quality_score"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lead_quality_rank"     TEXT    NOT NULL DEFAULT 'UNQUALIFIED',
  ADD COLUMN IF NOT EXISTS "lead_score_breakdown"  TEXT,
  ADD COLUMN IF NOT EXISTS "lead_score_history"    TEXT,
  ADD COLUMN IF NOT EXISTS "san_pham_quan_tam"     TEXT,
  ADD COLUMN IF NOT EXISTS "nhu_cau"               TEXT,
  ADD COLUMN IF NOT EXISTS "ngan_sach_min"          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ngan_sach_max"          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "muc_dich"              TEXT,
  ADD COLUMN IF NOT EXISTS "thoi_gian_du_kien"     TEXT,
  ADD COLUMN IF NOT EXISTS "phuong_an_tai_chinh"   TEXT,
  ADD COLUMN IF NOT EXISTS "khu_vuc_yeu_cau"       TEXT,
  ADD COLUMN IF NOT EXISTS "hanh_dong_tiep_theo"   TEXT,
  ADD COLUMN IF NOT EXISTS "row_version"           INTEGER NOT NULL DEFAULT 0;
