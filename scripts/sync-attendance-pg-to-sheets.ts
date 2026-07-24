import { prisma } from '../src/lib/db/client';
import { upsertChamCongNgoai } from '../src/lib/google-sheets';
import type { ChamCongNgoai } from '../src/lib/types';

function toChamCongNgoai(row: Awaited<ReturnType<typeof prisma.chamCongNgoai.findMany>>[number]): ChamCongNgoai {
  return {
    id:               row.id,
    id_nhan_vien:     row.id_nhan_vien,
    ho_ten:           row.ho_ten ?? undefined,
    ngay:             row.ngay,
    gio_bat_dau:      row.gio_bat_dau,
    gio_ket_thuc:     row.gio_ket_thuc,
    du_an_khach_hang: row.du_an_khach_hang,
    dia_diem:         row.dia_diem ?? '',
    ghi_chu:          row.ghi_chu ?? undefined,
    hinh_anh:         row.hinh_anh ?? undefined,
    vi_tri_gps:       row.vi_tri_gps ?? undefined,
    ql_truc_tiep:     row.ql_truc_tiep ?? undefined,
    trang_thai:       row.trang_thai as ChamCongNgoai['trang_thai'],
    nguoi_duyet:      row.nguoi_duyet ?? undefined,
    ghi_chu_duyet:    row.ghi_chu_duyet ?? undefined,
    created_at:       row.created_at.toISOString(),
  };
}

async function main() {
  const rows = await prisma.chamCongNgoai.findMany({
    orderBy: { created_at: 'asc' },
  });

  let synced = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      await upsertChamCongNgoai(toChamCongNgoai(row));
      synced++;
    } catch (e) {
      errors++;
      console.error(
        `[attendance-to-sheets] ${row.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  console.log(`[attendance-to-sheets] synced=${synced} errors=${errors}`);
  if (errors > 0) process.exitCode = 1;
}

main()
  .catch(e => {
    console.error('[attendance-to-sheets] fatal:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
