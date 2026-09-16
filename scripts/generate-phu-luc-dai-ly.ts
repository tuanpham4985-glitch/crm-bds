// Sinh hàng loạt "Phụ lục sửa đổi, bổ sung HĐLĐ" (NVKD cơ hữu Đại Lý) cho các nhân viên
// đang có hợp đồng còn hiệu lực, TRỪ các chức danh quản lý cấp cao.
//
// Phạm vi (theo xác nhận của người dùng ngày 2026-09-15, mở rộng 2 lần trong cùng ngày:
// lần 1 thêm "Thử việc" + "CTV", lần 2 thêm "Học việc" — ban đầu chỉ gồm "Chính thức"):
//   - Loại trừ chức danh: Chủ tịch, TP HCNS, CEO, TP TC-KT,
//     GĐ phát triển thương hiệu cá nhân - Social Sales
//   - CHỈ xét nhân viên có trạng thái (trang_thai) thuộc: Chính thức, Thử việc, CTV, Học việc
//     (loại trừ: Nghỉ việc, trống — không được yêu cầu đưa vào đợt này).
//   - CHỈ sinh cho nhân viên có ít nhất 1 hợp đồng đang "Còn hiệu lực" (bất kỳ loại nào)
//     để lấy ngày ký làm căn cứ trong Phụ lục — không có hợp đồng thì không có ngày để dẫn chiếu.
//   - Ngày ký Phụ lục cố định 17/07/2026 cho toàn bộ đợt (theo yêu cầu người dùng).
//
// Gọi thẳng Postgres repository (không qua data-access.ts) vì các hàm ở đó dùng
// unstable_cache — lỗi "incrementalCache missing" khi chạy ngoài Next.js runtime,
// rồi âm thầm fallback sang Google Sheets (dữ liệu cũ, không khớp Postgres hiện hành).
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getEmployeeRepository, getContractRepository } from '../src/lib/repository';

const EXCLUDED_TITLES = new Set(
  ['Chủ tịch', 'TP HCNS', 'CEO', 'TP TC-KT', 'GĐ phát triển thương hiệu cá nhân - Social Sales']
    .map(t => t.trim().toLowerCase())
);

const INCLUDED_STATUSES = new Set(['chính thức', 'thử việc', 'ctv', 'học việc']);

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'templates', 'MAU_VIC_PHU_LUC_DAI_LY.docx');
const OUTPUT_DIR = path.join(process.cwd(), 'output', 'phu-luc-dai-ly');

function getContractStatus(ngay_ket_thuc: string): string {
  if (!ngay_ket_thuc) return 'Còn hiệu lực';
  const endDate = new Date(ngay_ket_thuc);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return endDate < today ? 'Hết hạn' : 'Còn hiệu lực';
}

function formatDateVN(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  if (!s) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return s;
}

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();
}

async function main() {
  const employees = await getEmployeeRepository().findAll();
  const contracts = await getContractRepository().findAll();

  const content = fs.readFileSync(TEMPLATE_PATH);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const generated: string[] = [];
  const skippedNoActiveContract: string[] = [];
  const skippedExcludedTitle: string[] = [];
  const skippedStatus: string[] = [];

  for (const e of employees) {
    const et = (e.employee_type || '').trim().toLowerCase();
    if (EXCLUDED_TITLES.has(et)) {
      skippedExcludedTitle.push(`${e.id_nhan_vien}\t${e.ho_ten}\t${e.employee_type}`);
      continue;
    }
    const trangThai = (e.trang_thai || '').trim().toLowerCase();
    if (!INCLUDED_STATUSES.has(trangThai)) {
      skippedStatus.push(`${e.id_nhan_vien}\t${e.ho_ten}\t${e.employee_type}\t${e.trang_thai || '(trống)'}`);
      continue;
    }

    const empContracts = contracts.filter(c => c.id_nhan_vien === e.id_nhan_vien);
    const active = empContracts.filter(c => getContractStatus(c.ngay_ket_thuc) === 'Còn hiệu lực');

    if (active.length === 0) {
      skippedNoActiveContract.push(`${e.id_nhan_vien}\t${e.ho_ten}\t${e.employee_type}\t${e.trang_thai}\t(không có HĐ hiệu lực)`);
      continue;
    }

    // Nếu có nhiều HĐ còn hiệu lực (không nên xảy ra), lấy HĐ mới nhất theo ngày bắt đầu
    const contract = active.sort((a, b) =>
      new Date(b.ngay_bat_dau).getTime() - new Date(a.ngay_bat_dau).getTime()
    )[0];

    const exportData: Record<string, string> = {
      ho_ten: e.ho_ten || '',
      gioi_tinh: e.gioi_tinh || '',
      ngay_sinh: formatDateVN(e.ngay_sinh),
      HKTT: e.HKTT || '',
      dia_chi: e.HKTT || '',
      so_cccd: e.so_cccd || '',
      ngay_cap: formatDateVN(e.ngay_cap),
      noi_cap: e.noi_cap || '',
      ngay_ky_hdld: formatDateVN(contract.ngay_bat_dau),
      // Ngày ký Phụ lục = ngày ký HĐLĐ (theo yêu cầu người dùng 2026-09-17,
      // thay cho hằng số cố định 17/07/2026 trước đó).
      ngay_ky_phu_luc: formatDateVN(contract.ngay_bat_dau),
    };

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });
    doc.setData(exportData);
    doc.render();

    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const safeHopDong = contract.so_hop_dong.replace(/\//g, '-');
    const fileName = `PhuLuc_${sanitizeFileName(e.ho_ten)}_${safeHopDong}.docx`;
    fs.writeFileSync(path.join(OUTPUT_DIR, fileName), buf);

    generated.push(`${e.id_nhan_vien}\t${e.ho_ten}\t${e.employee_type}\t${contract.so_hop_dong}\t${fileName}`);
  }

  console.log(`\n=== ĐÃ SINH: ${generated.length} phụ lục ===`);
  generated.forEach(l => console.log(l));

  console.log(`\n=== BỎ QUA - chức danh loại trừ: ${skippedExcludedTitle.length} ===`);
  skippedExcludedTitle.forEach(l => console.log(l));

  console.log(`\n=== BỎ QUA - trạng thái ngoài diện xử lý (Nghỉ việc/Học việc/trống): ${skippedStatus.length} ===`);
  skippedStatus.forEach(l => console.log(l));

  console.log(`\n=== BỎ QUA - không có HĐ còn hiệu lực: ${skippedNoActiveContract.length} ===`);
  skippedNoActiveContract.forEach(l => console.log(l));

  console.log(`\nOutput dir: ${OUTPUT_DIR}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
