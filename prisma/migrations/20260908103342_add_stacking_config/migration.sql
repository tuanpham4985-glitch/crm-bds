-- PROPOSED — NOT APPLIED (audit STACKING_CONFIG_QUOTA_INDEPENDENCE)
-- This migration has been hand-authored to match the schema.prisma addition
-- but has intentionally NOT been run against any database (`prisma migrate
-- deploy`/`db push` were never executed). It is included here purely as the
-- reviewable artifact of the proposed change, per the task's explicit
-- "STOP BEFORE APPLYING IT" instruction. Remove this comment block (or the
-- reviewer's own tooling will) once approved and actually applied.

-- CreateTable
CREATE TABLE "stacking_config" (
    "id" TEXT NOT NULL,
    "ten_hien_thi" TEXT NOT NULL,
    "sheet_id" TEXT NOT NULL,
    "project_code" TEXT,
    "trang_thai" TEXT NOT NULL DEFAULT 'active',
    "ngay_tao" TEXT NOT NULL,
    "loai" TEXT NOT NULL DEFAULT 'grid',
    "sheet_tab" TEXT,
    "visible_columns" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stacking_config_pkey" PRIMARY KEY ("id")
);
