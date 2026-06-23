-- CreateTable
CREATE TABLE "nhan_vien" (
    "id_nhan_vien" TEXT NOT NULL,
    "ho_ten" TEXT NOT NULL,
    "so_dien_thoai" TEXT,
    "email" TEXT NOT NULL,
    "vai_tro" TEXT NOT NULL DEFAULT 'Sale',
    "employee_type" TEXT,
    "gioi_tinh" TEXT,
    "khu_vuc" TEXT,
    "phong_KD" TEXT,
    "ql_truc_tiep" TEXT,
    "so_cccd" TEXT,
    "ngay_cap" TEXT,
    "noi_cap" TEXT,
    "HKTT" TEXT,
    "ngay_sinh" TEXT,
    "ma_so_thue" TEXT,
    "so_nguoi_phu_thuoc" INTEGER,
    "trang_thai" TEXT NOT NULL DEFAULT 'đang làm',
    "ngay_tao" TEXT NOT NULL,
    "avatar_url" TEXT,
    "mat_khau" TEXT,
    "so_tk_ngan_hang" TEXT,
    "ten_ngan_hang_thu_huong" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nhan_vien_pkey" PRIMARY KEY ("id_nhan_vien")
);

-- CreateTable
CREATE TABLE "khach_hang" (
    "id_khach_hang" TEXT NOT NULL,
    "ngay_tao" TEXT NOT NULL,
    "ten_KH" TEXT NOT NULL,
    "so_dien_thoai" TEXT,
    "email" TEXT,
    "nguon" TEXT,
    "nhu_cau" TEXT,
    "ghi_chu" TEXT,
    "sale_phu_trach" TEXT NOT NULL,
    "label_khach" TEXT,
    "du_an" TEXT,
    "sale_lan_1" TEXT,
    "ghi_chu_lan_1" TEXT,
    "sale_lan_2" TEXT,
    "ghi_chu_lan_2" TEXT,
    "sale_lan_3" TEXT,
    "ghi_chu_lan_3" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khach_hang_pkey" PRIMARY KEY ("id_khach_hang")
);

-- CreateTable
CREATE TABLE "pipeline" (
    "id_pipeline" TEXT NOT NULL,
    "id_khach_hang" TEXT NOT NULL,
    "giai_doan" TEXT NOT NULL,
    "gia_tri_thuc_te" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sale_phu_trach" TEXT NOT NULL,
    "id_du_an" TEXT,
    "ten_du_an" TEXT,
    "hoa_hong" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tien_hoa_hong" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ngay_cap_nhat" TEXT,
    "thang" TEXT,
    "ma_can" TEXT,
    "loai_can" TEXT,
    "gdda" TEXT,
    "gdkd" TEXT,
    "phong_kd" TEXT,
    "ty_le_tra_sale" DOUBLE PRECISION,
    "ty_le_kh" DOUBLE PRECISION,
    "ty_le_gdda" DOUBLE PRECISION,
    "ty_le_gdkd" DOUBLE PRECISION,
    "ty_le_mkt" DOUBLE PRECISION,
    "phi_tra_sale" DOUBLE PRECISION,
    "phi_tra_kh" DOUBLE PRECISION,
    "phi_tra_gdda" DOUBLE PRECISION,
    "phi_tra_gdkd" DOUBLE PRECISION,
    "phi_tra_mkt" DOUBLE PRECISION,
    "phi_admin" DOUBLE PRECISION,
    "loi_nhuan" DOUBLE PRECISION,
    "thuong_nong" DOUBLE PRECISION,
    "tkkd" TEXT,
    "phi_tkkd" DOUBLE PRECISION,
    "ho_ten_kh" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id_pipeline")
);

-- CreateTable
CREATE TABLE "du_an" (
    "id_du_an" TEXT NOT NULL,
    "ma_du_an" TEXT,
    "ten_du_an" TEXT NOT NULL,
    "hien_thi" INTEGER NOT NULL DEFAULT 1,
    "hoa_hong_mac_dinh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "link_tai_lieu" TEXT,
    "chu_dau_tu" TEXT,
    "link_du_an" TEXT,
    "stacking_config" TEXT,
    "truong_nhom" TEXT,
    "ds_sale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "du_an_pkey" PRIMARY KEY ("id_du_an")
);

-- CreateTable
CREATE TABLE "cong_viec" (
    "id_cong_viec" TEXT NOT NULL,
    "ngay_tao" TEXT NOT NULL,
    "ghi_chu" TEXT,
    "id_pipeline" TEXT NOT NULL,
    "trang_thai" TEXT NOT NULL,
    "ngay_hen" TEXT,
    "sale_phu_trach" TEXT NOT NULL,
    "ket_qua" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cong_viec_pkey" PRIMARY KEY ("id_cong_viec")
);

-- CreateTable
CREATE TABLE "hop_dong" (
    "id" TEXT NOT NULL,
    "id_nhan_vien" TEXT NOT NULL,
    "ten_nhan_vien" TEXT,
    "so_hop_dong" TEXT NOT NULL,
    "phong_KD" TEXT,
    "employee_type" TEXT,
    "department" TEXT NOT NULL,
    "contract_type" TEXT NOT NULL,
    "template_file" TEXT,
    "ngay_bat_dau" TEXT NOT NULL,
    "ngay_ket_thuc" TEXT,
    "luong_co_ban" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ghi_chu" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hop_dong_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bang_luong" (
    "id" TEXT NOT NULL,
    "id_nhan_vien" TEXT NOT NULL,
    "thang" INTEGER NOT NULL,
    "nam" INTEGER NOT NULL,
    "luong_co_ban" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "doanh_thu" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hoa_hong" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thuong" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "phat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "so_ngay_cong_chuan" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "so_ngay_lam_viec_thuc_te" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "so_ngay_nghi_khong_luong" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "so_gio_ot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salary_by_day" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ot_pay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bao_hiem" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bh_company" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tong_luong" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross" DOUBLE PRECISION,
    "isProbation" BOOLEAN NOT NULL DEFAULT false,
    "isCollaborator" BOOLEAN NOT NULL DEFAULT false,
    "isIntern" BOOLEAN NOT NULL DEFAULT false,
    "trang_thai" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bang_luong_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_records" (
    "id" TEXT NOT NULL,
    "id_nhan_vien" TEXT NOT NULL,
    "thang" INTEGER NOT NULL,
    "nam" INTEGER NOT NULL,
    "gross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_deduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "net" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "luong_dong_bh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thu_nhap_chiu_thue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tong_chi_phi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trang_thai" TEXT NOT NULL DEFAULT 'draft',
    "locked_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" TEXT NOT NULL,
    "payroll_id" TEXT NOT NULL,
    "loai_khoan" TEXT NOT NULL,
    "nhom" TEXT NOT NULL,
    "so_tien" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ghi_chu" TEXT,
    "tinh_bhxh" BOOLEAN NOT NULL DEFAULT false,
    "tinh_thue" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "id_nhan_vien" TEXT NOT NULL,
    "thang" INTEGER NOT NULL,
    "nam" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cham_cong_ngoai" (
    "id" TEXT NOT NULL,
    "id_nhan_vien" TEXT NOT NULL,
    "ho_ten" TEXT,
    "ngay" TEXT NOT NULL,
    "gio_bat_dau" TEXT NOT NULL,
    "gio_ket_thuc" TEXT NOT NULL,
    "du_an_khach_hang" TEXT NOT NULL,
    "dia_diem" TEXT,
    "ghi_chu" TEXT,
    "hinh_anh" TEXT,
    "vi_tri_gps" TEXT,
    "ql_truc_tiep" TEXT,
    "trang_thai" TEXT NOT NULL DEFAULT 'cho_duyet',
    "nguoi_duyet" TEXT,
    "ghi_chu_duyet" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cham_cong_ngoai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_users" (
    "user_id" TEXT NOT NULL,
    "employee_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "department_id" TEXT NOT NULL,
    "team_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "position" TEXT,
    "avatar_url" TEXT,
    "zalo_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tm_users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "tm_departments" (
    "dept_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "manager_id" TEXT,
    "parent_dept_id" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tm_departments_pkey" PRIMARY KEY ("dept_id")
);

-- CreateTable
CREATE TABLE "tm_projects" (
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "owner_id" TEXT NOT NULL,
    "department_ids" TEXT,
    "member_ids" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "start_date" TEXT,
    "end_date" TEXT,
    "budget" DOUBLE PRECISION,
    "tags" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "tm_projects_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "tm_tasks" (
    "task_id" TEXT NOT NULL,
    "task_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "description" TEXT,
    "project_id" TEXT,
    "department_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "collaborator_ids" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "progress_pct" INTEGER NOT NULL DEFAULT 0,
    "start_date" TEXT,
    "due_date" TEXT,
    "estimated_hours" DOUBLE PRECISION,
    "actual_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kpi_target" TEXT,
    "kpi_actual" TEXT,
    "approval_level" INTEGER NOT NULL DEFAULT 1,
    "approval_status" TEXT NOT NULL DEFAULT 'not_required',
    "approved_by" TEXT,
    "approved_at" TEXT,
    "rejection_reason" TEXT,
    "tags" TEXT,
    "email_reminder" TEXT,
    "email_reminder_sent" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tm_tasks_pkey" PRIMARY KEY ("task_id")
);

-- CreateTable
CREATE TABLE "tm_subtasks" (
    "subtask_id" TEXT NOT NULL,
    "subtask_code" TEXT NOT NULL,
    "parent_task_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "description" TEXT,
    "owner_id" TEXT NOT NULL,
    "collaborator_ids" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "progress_pct" INTEGER NOT NULL DEFAULT 0,
    "start_date" TEXT,
    "due_date" TEXT,
    "estimated_hours" DOUBLE PRECISION,
    "actual_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tm_subtasks_pkey" PRIMARY KEY ("subtask_id")
);

-- CreateTable
CREATE TABLE "tm_checklists" (
    "checklist_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "task_type" TEXT NOT NULL DEFAULT 'task',
    "title" TEXT NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "done_by" TEXT,
    "done_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tm_checklists_pkey" PRIMARY KEY ("checklist_id")
);

-- CreateTable
CREATE TABLE "tm_comments" (
    "comment_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "task_type" TEXT NOT NULL DEFAULT 'task',
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" TEXT,
    "attachment_urls" TEXT,
    "parent_comment_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),

    CONSTRAINT "tm_comments_pkey" PRIMARY KEY ("comment_id")
);

-- CreateTable
CREATE TABLE "tm_notifications" (
    "notif_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'inapp',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tm_notifications_pkey" PRIMARY KEY ("notif_id")
);

-- CreateTable
CREATE TABLE "tm_activity_logs" (
    "log_id" TEXT NOT NULL,
    "task_id" TEXT,
    "task_type" TEXT,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "metadata" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tm_activity_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nhan_vien_email_key" ON "nhan_vien"("email");

-- CreateIndex
CREATE UNIQUE INDEX "hop_dong_so_hop_dong_key" ON "hop_dong"("so_hop_dong");

-- CreateIndex
CREATE UNIQUE INDEX "bang_luong_id_nhan_vien_thang_nam_key" ON "bang_luong"("id_nhan_vien", "thang", "nam");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_records_id_nhan_vien_thang_nam_key" ON "payroll_records"("id_nhan_vien", "thang", "nam");

-- CreateIndex
CREATE UNIQUE INDEX "tm_users_employee_code_key" ON "tm_users"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "tm_users_email_key" ON "tm_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tm_departments_code_key" ON "tm_departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tm_tasks_task_code_key" ON "tm_tasks"("task_code");

-- CreateIndex
CREATE UNIQUE INDEX "tm_subtasks_subtask_code_key" ON "tm_subtasks"("subtask_code");

-- AddForeignKey
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_id_khach_hang_fkey" FOREIGN KEY ("id_khach_hang") REFERENCES "khach_hang"("id_khach_hang") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cong_viec" ADD CONSTRAINT "cong_viec_id_pipeline_fkey" FOREIGN KEY ("id_pipeline") REFERENCES "pipeline"("id_pipeline") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hop_dong" ADD CONSTRAINT "hop_dong_id_nhan_vien_fkey" FOREIGN KEY ("id_nhan_vien") REFERENCES "nhan_vien"("id_nhan_vien") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payroll_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_tasks" ADD CONSTRAINT "tm_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "tm_projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_tasks" ADD CONSTRAINT "tm_tasks_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "tm_departments"("dept_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_tasks" ADD CONSTRAINT "tm_tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tm_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_tasks" ADD CONSTRAINT "tm_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "tm_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_subtasks" ADD CONSTRAINT "tm_subtasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tm_tasks"("task_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_notifications" ADD CONSTRAINT "tm_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tm_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_activity_logs" ADD CONSTRAINT "tm_activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tm_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
