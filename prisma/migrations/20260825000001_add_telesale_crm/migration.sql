ALTER TABLE "khach_hang"
  ADD COLUMN IF NOT EXISTS "telesale_phu_trach" TEXT,
  ADD COLUMN IF NOT EXISTS "sale_nhan_khach" TEXT,
  ADD COLUMN IF NOT EXISTS "trang_thai_cham_soc" TEXT DEFAULT 'Chưa gọi',
  ADD COLUMN IF NOT EXISTS "muc_do_quan_tam" TEXT DEFAULT 'Chưa xác định',
  ADD COLUMN IF NOT EXISTS "ngay_lien_he_cuoi" TEXT,
  ADD COLUMN IF NOT EXISTS "ngay_lien_he_tiep" TEXT,
  ADD COLUMN IF NOT EXISTS "so_lan_lien_he" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lich_su_cham_soc" TEXT,
  ADD COLUMN IF NOT EXISTS "trang_thai_ban_giao" TEXT DEFAULT 'Chưa bàn giao',
  ADD COLUMN IF NOT EXISTS "ban_giao_luc" TEXT,
  ADD COLUMN IF NOT EXISTS "sale_xac_nhan_luc" TEXT,
  ADD COLUMN IF NOT EXISTS "lich_su_ban_giao" TEXT;

CREATE INDEX IF NOT EXISTS "khach_hang_telesale_phu_trach_idx" ON "khach_hang"("telesale_phu_trach");
CREATE INDEX IF NOT EXISTS "khach_hang_sale_nhan_khach_idx" ON "khach_hang"("sale_nhan_khach");
CREATE INDEX IF NOT EXISTS "khach_hang_trang_thai_cham_soc_idx" ON "khach_hang"("trang_thai_cham_soc");
CREATE INDEX IF NOT EXISTS "khach_hang_ngay_lien_he_tiep_idx" ON "khach_hang"("ngay_lien_he_tiep");
