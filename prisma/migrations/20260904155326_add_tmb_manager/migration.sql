-- CreateTable
CREATE TABLE "tmb_map_profile" (
    "id" TEXT NOT NULL,
    "stacking_config_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "subdivision" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'PDF',
    "master_asset_ref" TEXT NOT NULL,
    "web_asset_ref" TEXT,
    "page_number" INTEGER NOT NULL DEFAULT 1,
    "page_width" DOUBLE PRECISION,
    "page_height" DOUBLE PRECISION,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "unit_code_field" TEXT,
    "glyph_remap" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "error_message" TEXT,
    "master_size_bytes" INTEGER,
    "web_size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tmb_map_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tmb_unit_mapping" (
    "id" TEXT NOT NULL,
    "map_profile_id" TEXT NOT NULL,
    "unit_code" TEXT NOT NULL,
    "normalized_unit_code" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "provenance" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tmb_unit_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tmb_map_profile_stacking_config_id_idx" ON "tmb_map_profile"("stacking_config_id");

-- CreateIndex
CREATE INDEX "tmb_map_profile_status_idx" ON "tmb_map_profile"("status");

-- CreateIndex
CREATE INDEX "tmb_unit_mapping_map_profile_id_idx" ON "tmb_unit_mapping"("map_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "tmb_unit_mapping_map_profile_id_normalized_unit_code_key" ON "tmb_unit_mapping"("map_profile_id", "normalized_unit_code");

-- AddForeignKey
ALTER TABLE "tmb_unit_mapping" ADD CONSTRAINT "tmb_unit_mapping_map_profile_id_fkey" FOREIGN KEY ("map_profile_id") REFERENCES "tmb_map_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
