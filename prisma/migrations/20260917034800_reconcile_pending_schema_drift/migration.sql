-- Pre-existing schema drift reconciliation — UNRELATED to HRM Appointment.
--
-- tm_tasks.approver_id and the crm_handoffs.updated_at DB-level default drop
-- were already present in prisma/schema.prisma (committed at 8f5fb5d, before
-- any HRM Appointment work started) but had never been applied to this dev
-- database via a migration. The two index renames below (nhan_vien phong_KD,
-- payroll_adjustments) are cosmetic naming drift from the same gap.
--
-- `prisma migrate dev` auto-diffs the FULL schema, so creating the HRM
-- Appointment migration initially swept these in alongside bo_nhiem_chuc_vu.
-- Split out here so the HRM Appointment migration
-- (20260917034927_add_bo_nhiem_chuc_vu) contains ONLY its own DDL — see
-- HRM_APPOINTMENT_SHEET_SYNC migration remediation report.
--
-- Verified safe: additive/nullable column, and crm_handoffs is only ever
-- written through prisma.crmHandoff.create() (Prisma's @updatedAt sets the
-- value at the application layer regardless of DB default) — no raw SQL
-- writer depends on the dropped default.
-- AlterTable
ALTER TABLE "crm_handoffs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tm_tasks" ADD COLUMN     "approver_id" TEXT;

-- RenameIndex
ALTER INDEX "nhan_vien_phong_kd_idx" RENAME TO "nhan_vien_phong_KD_idx";

-- RenameIndex
ALTER INDEX "payroll_adjustments_nv_thang_nam_idx" RENAME TO "payroll_adjustments_id_nhan_vien_thang_nam_idx";
