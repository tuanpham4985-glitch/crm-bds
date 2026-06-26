-- Performance indexes for CRM BDS (applied directly — bypasses drift)
-- NhanVien
CREATE INDEX IF NOT EXISTS "nhan_vien_trang_thai_idx" ON "nhan_vien"("trang_thai");
CREATE INDEX IF NOT EXISTS "nhan_vien_phong_kd_idx" ON "nhan_vien"("phong_KD");
-- KhachHang
CREATE INDEX IF NOT EXISTS "khach_hang_sale_phu_trach_idx" ON "khach_hang"("sale_phu_trach");
-- Pipeline
CREATE INDEX IF NOT EXISTS "pipeline_sale_phu_trach_idx" ON "pipeline"("sale_phu_trach");
CREATE INDEX IF NOT EXISTS "pipeline_giai_doan_idx" ON "pipeline"("giai_doan");
CREATE INDEX IF NOT EXISTS "pipeline_ngay_cap_nhat_idx" ON "pipeline"("ngay_cap_nhat");
-- CongViec
CREATE INDEX IF NOT EXISTS "cong_viec_id_pipeline_idx" ON "cong_viec"("id_pipeline");
CREATE INDEX IF NOT EXISTS "cong_viec_sale_phu_trach_idx" ON "cong_viec"("sale_phu_trach");
CREATE INDEX IF NOT EXISTS "cong_viec_trang_thai_idx" ON "cong_viec"("trang_thai");
-- HopDong
CREATE INDEX IF NOT EXISTS "hop_dong_id_nhan_vien_idx" ON "hop_dong"("id_nhan_vien");
-- PayrollItemRecord
CREATE INDEX IF NOT EXISTS "payroll_items_payroll_id_idx" ON "payroll_items"("payroll_id");
-- PayrollAdjustment
CREATE INDEX IF NOT EXISTS "payroll_adjustments_nv_thang_nam_idx" ON "payroll_adjustments"("id_nhan_vien","thang","nam");
-- ChamCongNgoai
CREATE INDEX IF NOT EXISTS "cham_cong_ngoai_id_nhan_vien_idx" ON "cham_cong_ngoai"("id_nhan_vien");
CREATE INDEX IF NOT EXISTS "cham_cong_ngoai_ql_truc_tiep_idx" ON "cham_cong_ngoai"("ql_truc_tiep");
CREATE INDEX IF NOT EXISTS "cham_cong_ngoai_trang_thai_idx" ON "cham_cong_ngoai"("trang_thai");
-- TmTask
CREATE INDEX IF NOT EXISTS "tm_tasks_owner_id_idx" ON "tm_tasks"("owner_id");
CREATE INDEX IF NOT EXISTS "tm_tasks_status_idx" ON "tm_tasks"("status");
CREATE INDEX IF NOT EXISTS "tm_tasks_project_id_idx" ON "tm_tasks"("project_id");
CREATE INDEX IF NOT EXISTS "tm_tasks_department_id_idx" ON "tm_tasks"("department_id");
CREATE INDEX IF NOT EXISTS "tm_tasks_due_date_idx" ON "tm_tasks"("due_date");
-- TmSubtask
CREATE INDEX IF NOT EXISTS "tm_subtasks_parent_task_id_idx" ON "tm_subtasks"("parent_task_id");
CREATE INDEX IF NOT EXISTS "tm_subtasks_owner_id_idx" ON "tm_subtasks"("owner_id");
CREATE INDEX IF NOT EXISTS "tm_subtasks_status_idx" ON "tm_subtasks"("status");
-- TmChecklist
CREATE INDEX IF NOT EXISTS "tm_checklists_task_id_idx" ON "tm_checklists"("task_id");
-- TmComment
CREATE INDEX IF NOT EXISTS "tm_comments_task_id_idx" ON "tm_comments"("task_id");
CREATE INDEX IF NOT EXISTS "tm_comments_user_id_idx" ON "tm_comments"("user_id");
-- TmNotification
CREATE INDEX IF NOT EXISTS "tm_notifications_user_id_status_idx" ON "tm_notifications"("user_id","status");
-- TmActivityLog
CREATE INDEX IF NOT EXISTS "tm_activity_logs_task_id_idx" ON "tm_activity_logs"("task_id");
CREATE INDEX IF NOT EXISTS "tm_activity_logs_user_id_idx" ON "tm_activity_logs"("user_id");
