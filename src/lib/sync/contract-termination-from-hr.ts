// ============================================================
// CRM BĐS — Chấm dứt hợp đồng theo cột "Thời gian nghỉ việc" của file HR ngoài
// "VIC_DATA NHÂN SỰ VICTORY HOLDINGS" (tab "DATA NHÂN SỰ").
//
// Trước đây trạng thái HĐ chỉ tính theo ngay_ket_thuc nên nhân viên đã nghỉ
// vẫn hiện HĐ "Còn hiệu lực" tới hết hạn HĐ. Bước này ghi ngay_cham_dut cho HĐ
// còn chạy qua ngày nghỉ việc; ngay_ket_thuc gốc giữ nguyên.
//
// Quy tắc (không tự đoán — trường hợp mâu thuẫn chỉ BÁO, không ghi):
//   - Ô ngày có chữ nhưng không đọc được ngày        → báo "sai định dạng"
//   - Trạng thái "Nghỉ việc" nhưng ô ngày trống       → báo "thiếu ngày nghỉ"
//   - Có ngày nghỉ ĐÃ QUA nhưng trạng thái khác "Nghỉ việc" → báo "mâu thuẫn"
//   - HĐ bắt đầu SAU ngày nghỉ mà vẫn còn hiệu lực     → báo "mâu thuẫn"
//     (thường do gõ sai năm, VD 31/08/2021)
//   - HĐ có ngày nghỉ nằm trong thời hạn               → ngay_cham_dut = ngày nghỉ
//   - HĐ đã hết hạn trước/đúng ngày nghỉ               → không cần chấm dứt
//   - Ô ngày trống + trạng thái khác "Nghỉ việc"       → xoá ngay_cham_dut cũ (nếu có)
//     để file HR luôn là nguồn chuẩn (VD nhân sự nhập nhầm rồi xoá đi)
//
// Dùng bởi: nút "Đồng bộ nhân sự" (/api/nhan-vien/sync)
// ============================================================
import { getContractRepository } from '@/lib/repository';
import type { HopDongMatchFields } from '@/lib/repository/interfaces';
import type { HrContractDateRecord } from '@/lib/google-sheets';
import { toISODate, todayISO } from '@/lib/contract-status';

export type HrResignationRecord = Pick<
  HrContractDateRecord, 'mnv' | 'ho_ten' | 'trang_thai' | 'ngay_nghi_viec' | 'ngay_nghi_viec_raw'
>;

export type TerminationContract = Pick<
  HopDongMatchFields, 'id' | 'id_nhan_vien' | 'so_hop_dong' | 'ngay_bat_dau' | 'ngay_ket_thuc' | 'ngay_cham_dut'
>;

export interface TerminationPlan {
  updates: { id: string; so_hop_dong: string; ngay_cham_dut: string }[];
  missingDate: string[];   // "0006 - Họ tên"
  invalidDate: string[];   // "0062 - Họ tên: \"5/28/2026\""
  conflicts: string[];     // mô tả mâu thuẫn để nhân sự kiểm tra
}

function padId(id: string): string {
  const t = (id ?? '').trim();
  return /^\d{1,4}$/.test(t) ? t.padStart(4, '0') : t;
}

const isNghiViec = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim()
  === 'nghi viec';

const fmtVN = (iso: string) => iso.split('-').reverse().join('/');

export function planContractTerminations(
  records: HrResignationRecord[],
  contracts: TerminationContract[],
  today: string = todayISO(),
): TerminationPlan {
  const plan: TerminationPlan = { updates: [], missingDate: [], invalidDate: [], conflicts: [] };

  const byEmployee = new Map<string, TerminationContract[]>();
  for (const c of contracts) {
    const k = padId(c.id_nhan_vien);
    const list = byEmployee.get(k) ?? [];
    list.push(c);
    byEmployee.set(k, list);
  }

  const setTarget = (c: TerminationContract, target: string) => {
    if ((c.ngay_cham_dut || '') !== target) {
      plan.updates.push({ id: c.id, so_hop_dong: c.so_hop_dong, ngay_cham_dut: target });
    }
  };

  const seen = new Set<string>();
  for (const r of records) {
    const mnv = padId(r.mnv);
    // Trùng MNV trong file HR → chỉ lấy dòng đầu, tránh 2 dòng ghi đè nhau
    if (!mnv || seen.has(mnv)) continue;
    seen.add(mnv);

    const label = `${mnv} - ${r.ho_ten || '(không tên)'}`;
    const raw = (r.ngay_nghi_viec_raw ?? '').trim();
    const nghi = r.ngay_nghi_viec;
    const resigned = isNghiViec(r.trang_thai);
    const empContracts = byEmployee.get(mnv) ?? [];

    if (raw && !nghi) {
      plan.invalidDate.push(`${label}: "${raw}"`);
      continue;
    }

    if (!nghi) {
      if (resigned) {
        plan.missingDate.push(label);
      } else {
        for (const c of empContracts) if (c.ngay_cham_dut) setTarget(c, '');
      }
      continue;
    }

    if (!resigned && nghi < today) {
      plan.conflicts.push(
        `${label}: có ngày nghỉ ${fmtVN(nghi)} nhưng trạng thái là "${r.trang_thai || '(trống)'}"`
      );
      continue;
    }

    for (const c of empContracts) {
      const start = toISODate(c.ngay_bat_dau);
      if (!start) continue;
      const end = toISODate(c.ngay_ket_thuc);

      if (start > nghi) {
        // HĐ ký sau ngày nghỉ: chỉ là mâu thuẫn khi HĐ đó còn đang chạy
        if (resigned && (!end || end >= today)) {
          plan.conflicts.push(
            `${label}: ngày nghỉ ${fmtVN(nghi)} trước ngày bắt đầu HĐ ${c.so_hop_dong} (${fmtVN(start)})`
          );
        }
        if (c.ngay_cham_dut) setTarget(c, '');
        continue;
      }

      setTarget(c, end && end <= nghi ? '' : nghi);
    }
  }

  return plan;
}

export interface SyncContractTerminationsResult {
  terminated: number;   // số HĐ được ghi/cập nhật/xoá ngay_cham_dut
  missingDate: string[];
  invalidDate: string[];
  conflicts: string[];
  errors: string[];
}

export async function syncContractTerminationsFromHr(
  records: HrContractDateRecord[],
): Promise<SyncContractTerminationsResult> {
  const empty = { terminated: 0, missingDate: [], invalidDate: [], conflicts: [] };
  if (records.length > 0 && records[0].ngay_nghi_viec_raw === null) {
    return { ...empty, errors: ['Không tìm thấy cột "Thời gian nghỉ việc" trong file nhân sự — bỏ qua bước chấm dứt HĐ'] };
  }

  const repo = getContractRepository();
  const plan = planContractTerminations(records, await repo.findMatchFields());

  const errors: string[] = [];
  let terminated = 0;
  for (const u of plan.updates) {
    try {
      if (await repo.updateTermination(u.id, u.ngay_cham_dut)) terminated++;
      else errors.push(`Chấm dứt ${u.so_hop_dong}: không tìm thấy bản ghi`);
    } catch (e) {
      errors.push(`Chấm dứt ${u.so_hop_dong} thất bại: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { terminated, missingDate: plan.missingDate, invalidDate: plan.invalidDate, conflicts: plan.conflicts, errors };
}
