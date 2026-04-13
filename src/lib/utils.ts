// ============================================================
// CRM BĐS — Utility Helpers
// ============================================================

/**
/**
 * Format số tiền VNĐ (chỉ dùng để hiển thị)
 */
export function formatCurrency(value: number): string {
  // 🔥 FIX: đảm bảo luôn là number chuẩn
  const num = Number(value) || 0;

  if (num >= 1_000_000_000) {
    const ty = num / 1_000_000_000;
    return `${ty % 1 === 0 ? ty.toFixed(0) : ty.toFixed(1)} tỷ`;
  }

  if (num >= 1_000_000) {
    const trieu = num / 1_000_000;
    return `${trieu % 1 === 0 ? trieu.toFixed(0) : trieu.toFixed(1)} triệu`;
  }

  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
}

/**
 * Format số tiền đầy đủ
 */
export function formatFullCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format ngày tháng
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format ngày giờ
 */
export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format phần trăm
 */
export function formatPercent(value: number | string): string {
  if (value === null || value === undefined || value === '') return '0%';

  let num = typeof value === 'string'
    ? parseFloat(value.replace('%', ''))
    : value;

  if (isNaN(num)) return '0%';

  // Nếu >1 thì coi là user nhập 3 => 3%
  if (num > 1) {
    num = num / 100;
  }

  return `${(num * 100).toFixed(1)}%`;
}

/**
 * Format số điện thoại
 */
export function formatPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 9) return `0${cleaned}`;
  if (cleaned.length === 10) return cleaned;
  return phone;
}

/**
 * Tạo ID dựa trên timestamp
 */
export function generateId(prefix: string): string {
  return `${prefix}${Date.now()}`;
}

/**
 * Tính % thay đổi
 */
export function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Format % thay đổi
 */
export function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

/**
 * Lấy tháng dạng MM-YYYY
 */
export function getMonthKey(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${month}-${date.getFullYear()}`;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Làm sạch string để search
 */
export function normalizeSearch(str: string): string {
  return str.toLowerCase().trim();
}

/**
 * Check text có match search query không
 */
export function matchSearch(text: string, query: string): boolean {
  if (!query) return true;
  return normalizeSearch(text).includes(normalizeSearch(query));
}
