// ============================================================
// CRM BĐS — Đồng bộ ngày HĐ Thử việc / HĐLĐ Chính thức (XĐTH 12 tháng)
// từ file HR ngoài "VIC_DATA NHÂN SỰ VICTORY HOLDINGS" (tab "DATA NHÂN SỰ",
// cột AD-AG) vào bảng hop_dong trong CRM.
//
// Đối chiếu TOÀN BỘ (không chỉ nhân viên đang thiếu hợp đồng) — nhân viên nào
// có ngày trong file HR mà CRM chưa có/khác thì tạo mới hoặc cập nhật.
// Khớp hợp đồng hiện có theo id_nhan_vien + contract_type chứa "thử việc"/
// "chính thức"; nhiều bản ghi cùng loại thì lấy bản có ngày bắt đầu mới nhất.
//
// NEON_TRANSFER: đọc bảng hop_dong qua findMatchFields() (6 cột hẹp thay vì cả
// hàng) và gộp toàn bộ bản ghi tạo mới vào 1 lệnh createMany() thay vì N lệnh
// create() rời rạc — cùng tinh thần narrow-select/giảm round-trip đã áp dụng ở
// IMPORT_DUPLICATE_CHECK_P0/IMPORT_BATCH_P1 (xem memory crm_neon_transfer_optimization).
//
// Dùng bởi: nút "Đồng bộ nhân sự" (/api/nhan-vien/sync)
// ============================================================
import { getEmployeeRepository, getContractRepository } from '@/lib/repository';
import { getContractDatesFromHrFile } from '@/lib/google-sheets';
import { detectEmployeeClassification, getContractTemplate } from '@/lib/contractEngine';
import type { HopDong } from '@/lib/types';

function padId(id: string): string {
  if (!id) return '';
  const t = id.trim();
  return /^\d{1,4}$/.test(t) ? t.padStart(4, '0') : t;
}

function extractEmployeeNumber(id: string): string {
  const m = id.match(/\d+/);
  return m ? m[0] : id;
}

// Mirror hop-dong/page.tsx's getDefaultSalary — chỉ dùng khi TẠO MỚI hợp đồng
// (file HR không có cột lương). TKKD CỐ Ý không có mức mặc định — lương TKKD
// dao động không cố định như NVKD/TPKD/GĐKD (theo xác nhận người dùng 2026-09-15).
const SALARY_DEFAULTS: Record<string, number> = { NVKD: 5_350_000, TPKD: 5_500_000, GĐKD: 6_000_000, GDDA: 6_000_000 };
const BO_SALARY_EXCLUDE = new Set(['NVKD', 'TPKD', 'GĐKD', 'GDDA', 'Chủ tịch', 'CEO']);
const BO_DEFAULT_SALARY = 7_000_000;
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

export interface SyncContractDatesResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function syncContractDatesFromHrFile(): Promise<SyncContractDatesResult> {
  const [hrRecords, employees, contractsNarrow] = await Promise.all([
    getContractDatesFromHrFile(),
    getEmployeeRepository().findAll(),
    getContractRepository().findMatchFields(),
  ]);

  const empById = new Map(employees.map(e => [padId(e.id_nhan_vien), e]));
  const toCreate: HopDong[] = [];
  const toUpdate: { id: string; ngay_bat_dau: string; ngay_ket_thuc: string }[] = [];
  let skipped = 0;

  for (const hr of hrRecords) {
    const mnv = padId(hr.mnv);
    if (!mnv) continue;
    const emp = empById.get(mnv);
    if (!emp) { if (hr.tv_tu_ngay || hr.ct_tu_ngay) skipped++; continue; }

    const hoTen = hr.ho_ten || emp.ho_ten || '';
    const chucDanh = hr.chuc_danh || emp.employee_type || '';
    const { department } = detectEmployeeClassification(emp.vai_tro || 'Sale', 'Thử việc', chucDanh);

    const categories: { label: Category; tu: string; den: string; apiCategory: 'PROBATION' | 'OFFICIAL'; suffix: string }[] = [
      { label: 'Thử việc', tu: hr.tv_tu_ngay, den: hr.tv_den_ngay, apiCategory: 'PROBATION', suffix: 'VIC_HĐTV' },
      { label: 'Chính thức', tu: hr.ct_tu_ngay, den: hr.ct_den_ngay, apiCategory: 'OFFICIAL', suffix: 'VIC_HĐLĐ' },
    ];

    for (const cat of categories) {
      if (!cat.tu) continue;

      const matches = contractsNarrow.filter(
        c => c.id_nhan_vien === mnv && c.contract_type?.toLowerCase().includes(cat.label.toLowerCase())
      );
      const existing = matches.length
        ? matches.sort((a, b) => new Date(b.ngay_bat_dau).getTime() - new Date(a.ngay_bat_dau).getTime())[0]
        : null;

      if (!existing) {
        const template = getContractTemplate(cat.apiCategory, department);
        toCreate.push({
          id: genId(),
          id_nhan_vien: mnv,
          ten_nhan_vien: hoTen,
          so_hop_dong: `${extractEmployeeNumber(mnv)}/${cat.suffix}`,
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
        });
      } else if (existing.ngay_bat_dau === cat.tu && (existing.ngay_ket_thuc || '') === cat.den) {
        skipped++;
      } else {
        toUpdate.push({ id: existing.id, ngay_bat_dau: cat.tu, ngay_ket_thuc: cat.den });
      }
    }
  }

  const errors: string[] = [];
  let created = 0, updated = 0;

  if (toCreate.length > 0) {
    try {
      await getContractRepository().createMany(toCreate);
      created = toCreate.length;
    } catch (e) {
      errors.push(`createMany thất bại: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Prisma không có updateMany với giá trị khác nhau theo từng dòng trong 1 lệnh —
  // vẫn cần N lệnh, nhưng updateDates() chỉ ghi đúng 2 cột ngày, không đọc/ghi
  // lại cả hàng như update(full) + findById() sẽ tốn thêm.
  for (const u of toUpdate) {
    try {
      const ok = await getContractRepository().updateDates(u.id, u.ngay_bat_dau, u.ngay_ket_thuc);
      if (ok) updated++; else errors.push(`Update ${u.id}: không tìm thấy bản ghi`);
    } catch (e) {
      errors.push(`Update ${u.id} thất bại: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { created, updated, skipped, errors };
}
