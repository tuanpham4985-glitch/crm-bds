// Đối chiếu ngày HĐ Thử việc / HĐLĐ Chính thức (XĐTH 12 tháng) từ file HR ngoài
// "VIC_DATA NHÂN SỰ VICTORY HOLDINGS" (tab "DATA NHÂN SỰ", cột AD-AG) với dữ liệu
// Hợp đồng đang có trong CRM (bảng hop_dong / Postgres) — tạo mới hoặc cập nhật
// cho khớp. MẶC ĐỊNH CHỈ IN RA KẾ HOẠCH (dry-run), KHÔNG ghi gì cả.
//
// Chạy xem trước (không ghi):
//   npx tsx --env-file=.env.local scripts/sync-contract-dates-from-hr.ts
// Chạy thật (ghi vào Postgres):
//   npx tsx --env-file=.env.local scripts/sync-contract-dates-from-hr.ts --apply
//
// Quy tắc (theo xác nhận người dùng ngày 2026-09-15):
//   - Đối chiếu và cập nhật TOÀN BỘ (không chỉ nhân viên đang thiếu hợp đồng).
//   - Khớp nhân viên qua MNV (file HR) = id_nhan_vien (CRM), có pad về 4 chữ số.
//   - Với mỗi nhân viên: cột AD/AE (HĐ Thử việc) → hợp đồng loại "Thử việc";
//     cột AF/AG (HĐLĐ XĐTH 12 tháng) → hợp đồng loại "Chính thức".
//   - Khớp hợp đồng hiện có theo id_nhan_vien + contract_type chứa "thử việc"/
//     "chính thức" (không phân biệt khối KD/BO) — nếu có nhiều bản ghi cùng loại,
//     lấy bản có ngày bắt đầu mới nhất.
//   - Không có bản ghi phù hợp → TẠO MỚI. Có nhưng ngày khác → CẬP NHẬT. Ngày
//     khớp sẵn → BỎ QUA.
import { getEmployeeRepository, getContractRepository } from '../src/lib/repository';
import { getContractDatesFromHrFile } from '../src/lib/google-sheets';
import { detectEmployeeClassification, getContractTemplate } from '../src/lib/contractEngine';
import type { HopDong } from '../src/lib/types';

const APPLY = process.argv.includes('--apply');

function padId(id: string): string {
  if (!id) return '';
  const t = id.trim();
  if (/^\d{1,4}$/.test(t)) return t.padStart(4, '0');
  return t;
}

function extractEmployeeNumber(id: string): string {
  const m = id.match(/\d+/);
  return m ? m[0] : id;
}

// TKKD CỐ Ý không có mức mặc định (để 0) — theo xác nhận người dùng: lương TKKD
// dao động không cố định như NVKD/TPKD/GĐKD, cần điền tay theo từng người.
const SALARY_DEFAULTS: Record<string, number> = { NVKD: 5_350_000, TPKD: 5_500_000, GĐKD: 6_000_000, GDDA: 6_000_000 };
const BO_SALARY_EXCLUDE = new Set(['NVKD', 'TPKD', 'GĐKD', 'GDDA', 'Chủ tịch', 'CEO']);
const BO_DEFAULT_SALARY = 7_000_000;
// Mirror hop-dong/page.tsx's getDefaultSalary — chỉ dùng khi TẠO MỚI hợp đồng
// (chưa có lương trong file HR nguồn, nên đoán theo cùng quy ước UI đang dùng).
function getDefaultSalary(employeeType: string, department: string): number {
  if (SALARY_DEFAULTS[employeeType] != null) return SALARY_DEFAULTS[employeeType];
  if (department === 'BO' && !BO_SALARY_EXCLUDE.has(employeeType)) return BO_DEFAULT_SALARY;
  return 0;
}

let _idCounter = 0;
function genId(): string {
  _idCounter++;
  return `HD${Date.now()}${_idCounter}`;
}

type Category = 'Thử việc' | 'Chính thức';

interface PlanItem {
  action: 'CREATE' | 'UPDATE' | 'SKIP';
  category: Category;
  id_nhan_vien: string;
  ho_ten: string;
  oldTu?: string;
  oldDen?: string;
  newTu: string;
  newDen: string;
  reason?: string;
  write?: HopDong;
}

async function main() {
  const hrRecords = await getContractDatesFromHrFile();
  const employees = await getEmployeeRepository().findAll();
  const contracts = await getContractRepository().findAll();

  const empById = new Map(employees.map(e => [padId(e.id_nhan_vien), e]));
  const plan: PlanItem[] = [];

  for (const hr of hrRecords) {
    const mnv = padId(hr.mnv);
    if (!mnv) continue;
    const emp = empById.get(mnv);
    const hoTen = hr.ho_ten || emp?.ho_ten || '';

    if (!emp) {
      if (hr.tv_tu_ngay || hr.ct_tu_ngay) {
        plan.push({ action: 'SKIP', category: 'Thử việc', id_nhan_vien: mnv, ho_ten: hoTen, newTu: '', newDen: '', reason: 'Không tìm thấy MNV này trong CRM (NHAN_VIEN)' });
      }
      continue;
    }

    const chucDanh = hr.chuc_danh || emp.employee_type || '';
    const { department } = detectEmployeeClassification(emp.vai_tro || 'Sale', 'Thử việc', chucDanh);

    const categories: { label: Category; tu: string; den: string; apiCategory: 'PROBATION' | 'OFFICIAL'; suffix: string }[] = [
      { label: 'Thử việc', tu: hr.tv_tu_ngay, den: hr.tv_den_ngay, apiCategory: 'PROBATION', suffix: 'VIC_HĐTV' },
      { label: 'Chính thức', tu: hr.ct_tu_ngay, den: hr.ct_den_ngay, apiCategory: 'OFFICIAL', suffix: 'VIC_HĐLĐ' },
    ];

    for (const cat of categories) {
      if (!cat.tu) continue; // Không có dữ liệu HR cho loại HĐ này

      const matches = contracts.filter(
        c => c.id_nhan_vien === mnv && c.contract_type?.toLowerCase().includes(cat.label.toLowerCase())
      );
      const existing = matches.length
        ? matches.sort((a, b) => new Date(b.ngay_bat_dau).getTime() - new Date(a.ngay_bat_dau).getTime())[0]
        : null;

      if (!existing) {
        const template = getContractTemplate(cat.apiCategory, department);
        const so_hop_dong = `${extractEmployeeNumber(mnv)}/${cat.suffix}`;
        const write: HopDong = {
          id: genId(),
          id_nhan_vien: mnv,
          ten_nhan_vien: hoTen,
          so_hop_dong,
          phong_KD: emp.phong_KD || '',
          employee_type: chucDanh,
          department,
          contract_type: template?.contract_type || `${cat.label} (${department})`,
          template_file: template?.template_file || '',
          ngay_bat_dau: cat.tu,
          ngay_ket_thuc: cat.den,
          luong_co_ban: getDefaultSalary(chucDanh, department),
          ghi_chu: '',
          created_at: new Date().toISOString(),
        };
        plan.push({ action: 'CREATE', category: cat.label, id_nhan_vien: mnv, ho_ten: hoTen, newTu: cat.tu, newDen: cat.den, write });
      } else if (existing.ngay_bat_dau === cat.tu && (existing.ngay_ket_thuc || '') === cat.den) {
        plan.push({ action: 'SKIP', category: cat.label, id_nhan_vien: mnv, ho_ten: hoTen, newTu: cat.tu, newDen: cat.den, reason: 'Ngày đã khớp' });
      } else {
        const write: HopDong = { ...existing, ngay_bat_dau: cat.tu, ngay_ket_thuc: cat.den };
        plan.push({
          action: 'UPDATE', category: cat.label, id_nhan_vien: mnv, ho_ten: hoTen,
          oldTu: existing.ngay_bat_dau, oldDen: existing.ngay_ket_thuc || '',
          newTu: cat.tu, newDen: cat.den, write,
        });
      }
    }
  }

  const creates = plan.filter(p => p.action === 'CREATE');
  const updates = plan.filter(p => p.action === 'UPDATE');
  const skips   = plan.filter(p => p.action === 'SKIP');

  console.log(`\n=== SẼ TẠO MỚI: ${creates.length} hợp đồng ===`);
  creates.forEach(p => console.log(`${p.id_nhan_vien}\t${p.ho_ten}\t${p.category}\t${p.newTu} → ${p.newDen}\t(so_hop_dong: ${p.write!.so_hop_dong}, lương mặc định: ${p.write!.luong_co_ban.toLocaleString('vi-VN')})`));

  console.log(`\n=== SẼ CẬP NHẬT: ${updates.length} hợp đồng ===`);
  updates.forEach(p => console.log(`${p.id_nhan_vien}\t${p.ho_ten}\t${p.category}\t${p.oldTu} → ${p.oldDen}  ==>  ${p.newTu} → ${p.newDen}\t(id: ${p.write!.id}, so_hop_dong: ${p.write!.so_hop_dong})`));

  console.log(`\n=== BỎ QUA: ${skips.length} (đếm theo lý do) ===`);
  const reasonCounts = new Map<string, number>();
  skips.forEach(p => reasonCounts.set(p.reason || '', (reasonCounts.get(p.reason || '') || 0) + 1));
  reasonCounts.forEach((count, reason) => console.log(`${count}\t${reason}`));
  const notFound = skips.filter(p => p.reason?.includes('Không tìm thấy'));
  if (notFound.length) {
    console.log(`\n--- Chi tiết MNV không khớp CRM (${notFound.length}) ---`);
    notFound.forEach(p => console.log(`${p.id_nhan_vien}\t${p.ho_ten}`));
  }

  if (!APPLY) {
    console.log(`\n[DRY-RUN] Chưa ghi gì vào CRM. Chạy lại với --apply để thực sự ghi.`);
    process.exit(0);
  }

  console.log(`\n[APPLY] Đang ghi ${creates.length} tạo mới + ${updates.length} cập nhật vào Postgres...`);
  let okCreate = 0, okUpdate = 0;
  const errors: string[] = [];
  for (const p of [...creates, ...updates]) {
    try {
      if (p.action === 'CREATE') {
        await getContractRepository().create(p.write!);
        okCreate++;
      } else {
        await getContractRepository().update(p.write!);
        okUpdate++;
      }
    } catch (e: any) {
      errors.push(`${p.id_nhan_vien} ${p.ho_ten} (${p.category}): ${e?.message || String(e)}`);
    }
  }
  console.log(`[APPLY] Xong — tạo mới: ${okCreate}, cập nhật: ${okUpdate}, lỗi: ${errors.length}`);
  errors.forEach(e => console.log(`  LỖI: ${e}`));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
