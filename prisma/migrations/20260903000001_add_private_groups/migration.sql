-- Private Group ("Nhóm riêng") — additive/backward-compatible migration.
-- No existing column dropped, renamed, made NOT NULL without a default, or
-- deduplicated. 3 brand-new tables only, zero rows touched on any existing
-- table (khach_hang, nhan_vien, campaigns, datasets, ... all UNCHANGED).
--
-- Model tối thiểu cho mô hình Sale tự khai thác data — KHÔNG phải Dataset,
-- Campaign, hay DuAn.ds_sale (3 entity đó giữ nguyên, không đụng tới).
-- customer_id/leader_id/employee_id là string ref thuần (không FK tới
-- khach_hang/nhan_vien — 2 bảng đó có thể sống ở Google Sheets thay vì
-- Postgres tuỳ feature flag PG_ENABLED_MODULES, một FK cứng sẽ vỡ nếu vậy;
-- cùng convention đã dùng cho campaign_memberships/crm_handoffs/
-- customer_dataset_memberships).
--
-- private_group_customers.customer_id UNIQUE TOÀN CỤC (không chỉ unique
-- trong 1 group) — 1 Customer chỉ thuộc đúng 1 Private Group tại 1 thời
-- điểm, enforce ở tầng DB (không chỉ application) cho đúng yêu cầu chặn
-- "Customer đã thuộc 1 Nhóm riêng khác".

CREATE TABLE IF NOT EXISTS "private_groups" (
  "id"               TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "leader_id"        TEXT NOT NULL,
  "leader_name"      TEXT NOT NULL,
  "created_by_id"    TEXT NOT NULL,
  "created_by_name"  TEXT NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "private_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "private_groups_leader_id_idx" ON "private_groups"("leader_id");

CREATE TABLE IF NOT EXISTS "private_group_members" (
  "id"             TEXT NOT NULL,
  "group_id"       TEXT NOT NULL,
  "employee_id"    TEXT NOT NULL,
  "employee_name"  TEXT NOT NULL,
  "added_by_id"    TEXT NOT NULL,
  "added_by_name"  TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "private_group_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "private_group_members_group_id_employee_id_key" ON "private_group_members"("group_id", "employee_id");
CREATE INDEX IF NOT EXISTS "private_group_members_group_id_idx" ON "private_group_members"("group_id");
CREATE INDEX IF NOT EXISTS "private_group_members_employee_id_idx" ON "private_group_members"("employee_id");

DO $$ BEGIN
  ALTER TABLE "private_group_members" ADD CONSTRAINT "private_group_members_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "private_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "private_group_customers" (
  "id"                TEXT NOT NULL,
  "group_id"          TEXT NOT NULL,
  "customer_id"       TEXT NOT NULL,
  "entered_by_id"     TEXT NOT NULL,
  "entered_by_name"   TEXT NOT NULL,
  "assigned_to_id"    TEXT NOT NULL,
  "assigned_to_name"  TEXT NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "private_group_customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "private_group_customers_customer_id_key" ON "private_group_customers"("customer_id");
CREATE INDEX IF NOT EXISTS "private_group_customers_group_id_idx" ON "private_group_customers"("group_id");
CREATE INDEX IF NOT EXISTS "private_group_customers_assigned_to_id_idx" ON "private_group_customers"("assigned_to_id");

DO $$ BEGIN
  ALTER TABLE "private_group_customers" ADD CONSTRAINT "private_group_customers_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "private_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
