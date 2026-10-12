// ============================================================
// Trạng thái hợp đồng — dùng chung cho trang Hợp đồng, trang Nhân viên và
// bước đồng bộ ngày nghỉ việc từ file HR.
//
// Trạng thái KHÔNG lưu trong DB, luôn tính từ ngày:
//   - ngay_cham_dut đã qua      → "Đã chấm dứt" (nhân viên nghỉ trước hạn HĐ)
//   - ngay_ket_thuc đã qua      → "Hết hạn"
//   - còn lại / không thời hạn  → "Còn hiệu lực"
// "Đã qua" = trước hôm nay; đúng ngày đó vẫn tính là còn hiệu lực.
// ============================================================

export type ContractStatus = 'Còn hiệu lực' | 'Hết hạn' | 'Đã chấm dứt';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Chuẩn hoá ngày (ISO "YYYY-MM-DD..." hoặc "dd/mm/yyyy") về "YYYY-MM-DD"; '' nếu không đọc được. */
export function toISODate(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const d = +dmy[1], m = +dmy[2];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${dmy[3]}-${pad2(m)}-${pad2(d)}`;
  }
  return '';
}

export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function getContractStatus(
  hd: { ngay_ket_thuc?: string | null; ngay_cham_dut?: string | null },
  today: string = todayISO(),
): ContractStatus {
  const chamDut = toISODate(hd.ngay_cham_dut);
  if (chamDut && chamDut < today) return 'Đã chấm dứt';
  const end = toISODate(hd.ngay_ket_thuc);
  if (end) return end < today ? 'Hết hạn' : 'Còn hiệu lực';
  if (!hd.ngay_ket_thuc?.trim()) return 'Còn hiệu lực';
  // Định dạng lạ — giữ cách so sánh cũ bằng Date
  const endDate = new Date(hd.ngay_ket_thuc);
  if (isNaN(endDate.getTime())) return 'Còn hiệu lực';
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return endDate < t ? 'Hết hạn' : 'Còn hiệu lực';
}
