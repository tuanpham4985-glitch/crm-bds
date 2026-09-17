-- CreateTable
CREATE TABLE "bo_nhiem_chuc_vu" (
    "id" TEXT NOT NULL,
    "id_nhan_vien" TEXT NOT NULL,
    "ten_nhan_vien" TEXT,
    "phong_ban" TEXT,
    "du_an" TEXT,
    "chuc_vu_bo_nhiem" TEXT NOT NULL,
    "ngay_bo_nhiem" TEXT NOT NULL,
    "so_quyet_dinh_bo_nhiem" TEXT,
    "nguoi_ky_bo_nhiem" TEXT,
    "file_quyet_dinh_bo_nhiem" TEXT,
    "ngay_mien_nhiem" TEXT,
    "so_quyet_dinh_mien_nhiem" TEXT,
    "nguoi_ky_mien_nhiem" TEXT,
    "file_quyet_dinh_mien_nhiem" TEXT,
    "ghi_chu" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bo_nhiem_chuc_vu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bo_nhiem_chuc_vu_id_nhan_vien_idx" ON "bo_nhiem_chuc_vu"("id_nhan_vien");

-- CreateIndex
CREATE INDEX "bo_nhiem_chuc_vu_id_nhan_vien_ngay_bo_nhiem_idx" ON "bo_nhiem_chuc_vu"("id_nhan_vien", "ngay_bo_nhiem");
