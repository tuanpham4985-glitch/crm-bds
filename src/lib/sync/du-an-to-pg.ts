// Đồng bộ Google Sheets DU_AN → PostgreSQL.
// Google Sheets là nguồn dữ liệu được người dùng cập nhật trực tiếp; PostgreSQL
// là bản sao đọc nhanh khi module CRM được bật.

import { prisma } from '../db/client';
import { getDuAn } from '../google-sheets';

export interface SyncDuAnResult {
  total: number;
  synced: number;
  skipped: number;
  errors: number;
}

export async function syncDuAnToPostgres(): Promise<SyncDuAnResult> {
  const rows = await getDuAn();
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const da of rows) {
    if (!da.id_du_an) {
      skipped++;
      continue;
    }

    const data = {
      ma_du_an:          da.ma_du_an,
      ten_du_an:         da.ten_du_an,
      hien_thi:          da.hien_thi,
      hoa_hong_mac_dinh: da.hoa_hong_mac_dinh,
      link_tai_lieu:     da.link_tai_lieu || null,
      chu_dau_tu:        da.chu_dau_tu || null,
      link_du_an:        da.link_du_an || null,
      stacking_config:   da.stacking_config || null,
      truong_nhom:       da.truong_nhom || null,
      ds_sale:           da.ds_sale || null,
    };

    try {
      await prisma.duAn.upsert({
        where: { id_du_an: da.id_du_an },
        create: { id_du_an: da.id_du_an, ...data },
        update: data,
      });
      synced++;
    } catch (error) {
      errors++;
      console.error(
        `[sync:du-an] Không thể đồng bộ ${da.id_du_an}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { total: rows.length, synced, skipped, errors };
}
