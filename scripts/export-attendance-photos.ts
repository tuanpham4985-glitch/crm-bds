// ============================================================
// CRM BĐS — Trích xuất ảnh Chấm công online ra file .jpeg
//
// Đọc sheet CHAM_CONG_NGOAI, giải mã chuỗi base64 trong cột
// `hinh_anh` và ghi ra file ảnh thật (.jpg/.png) để làm báo cáo.
//
// Usage:
//   npm run export:ccn-photos                 # tháng hiện tại
//   npm run export:ccn-photos -- --month=7 --year=2026
//   npm run export:ccn-photos -- --month=7 --year=2026 --approved
//   npm run export:ccn-photos -- --out=D:/BaoCao/anh
//
// Cờ:
//   --month, --year : lọc theo tháng/năm (mặc định: tháng hiện tại)
//   --approved      : chỉ xuất đơn đã duyệt (da_duyet)
//   --out=<folder>  : thư mục đích (mặc định: exports/cham-cong-photos/T<mm>_<yyyy>)
//
// Kết quả: mỗi ảnh 1 file <ngay>_<maNV>_<hoTen>_<id>.jpg + file index.csv
// ============================================================

import { promises as fs } from 'fs';
import * as path from 'path';
import { getChamCongNgoai } from '../src/lib/google-sheets';

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

// Bỏ ký tự không hợp lệ trong tên file
function safe(s: string): string {
  return (s || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// data:image/jpeg;base64,XXXX  ->  { ext, buffer }
function decodeDataUri(dataUri: string): { ext: string; buffer: Buffer } | null {
  const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,([\s\S]*)$/.exec(dataUri.trim());
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  return { ext, buffer: Buffer.from(m[2], 'base64') };
}

async function main() {
  const now = new Date();
  const month = Number(arg('month') ?? now.getMonth() + 1);
  const year = Number(arg('year') ?? now.getFullYear());
  const approvedOnly = hasFlag('approved');

  const mm = String(month).padStart(2, '0');
  const outDir = arg('out') ?? path.join('exports', 'cham-cong-photos', `T${mm}_${year}`);
  await fs.mkdir(outDir, { recursive: true });

  console.log(`[export-ccn-photos] Đọc CHAM_CONG_NGOAI…`);
  const all = await getChamCongNgoai();

  const rows = all.filter(r => {
    if (!r.ngay) return false;
    const [y, m] = r.ngay.split('-').map(Number);
    if (m !== month || y !== year) return false;
    if (approvedOnly && r.trang_thai !== 'da_duyet') return false;
    return true;
  });

  console.log(
    `[export-ccn-photos] Tháng ${mm}/${year}` +
    `${approvedOnly ? ' (chỉ đã duyệt)' : ''}: ${rows.length} đơn`,
  );

  let saved = 0;
  let noImage = 0;
  let bad = 0;
  const index: string[] = ['file,ma_nv,ho_ten,ngay,gio,trang_thai,dia_diem,ly_do'];

  for (const r of rows) {
    if (!r.hinh_anh || !r.hinh_anh.startsWith('data:image')) {
      noImage++;
      continue;
    }
    const decoded = decodeDataUri(r.hinh_anh);
    if (!decoded) {
      bad++;
      console.warn(`  ! Không giải mã được ảnh của đơn ${r.id}`);
      continue;
    }
    const base = `${r.ngay}_${safe(r.id_nhan_vien)}_${safe(r.ho_ten || '')}_${r.id}`.slice(0, 120);
    const fileName = `${base}.${decoded.ext}`;
    await fs.writeFile(path.join(outDir, fileName), decoded.buffer);
    saved++;

    const csvCell = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    index.push([
      csvCell(fileName), csvCell(r.id_nhan_vien), csvCell(r.ho_ten || ''),
      csvCell(r.ngay), csvCell(`${r.gio_bat_dau}-${r.gio_ket_thuc}`),
      csvCell(r.trang_thai), csvCell(r.dia_diem || ''), csvCell(r.du_an_khach_hang || ''),
    ].join(','));
  }

  await fs.writeFile(path.join(outDir, 'index.csv'), '\uFEFF' + index.join('\n'), 'utf8');

  console.log(
    `[export-ccn-photos] Xong. Lưu ${saved} ảnh` +
    `, ${noImage} đơn không có ảnh, ${bad} ảnh lỗi.`,
  );
  console.log(`[export-ccn-photos] Thư mục: ${path.resolve(outDir)}`);
  console.log(`[export-ccn-photos] Kèm index.csv để tra cứu ảnh ↔ nhân viên.`);
}

main().catch(err => {
  console.error('[export-ccn-photos] LỖI:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
