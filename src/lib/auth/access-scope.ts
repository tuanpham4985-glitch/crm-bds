// Phạm vi truy cập theo trạng thái nhân viên — module THUẦN (không import DB /
// next/headers) để dùng chung cho proxy.ts, API auth và Sidebar (client).
//
// - 'full': nhân viên đang làm bình thường, quyền theo vai trò như cũ.
// - 'attendance_only': nhân viên "Học việc" — được đăng nhập nhưng CHỈ dùng
//   tab Chấm công online. proxy.ts chặn mọi trang/API khác ở phía máy chủ,
//   Sidebar chỉ hiện đúng 1 mục.

export type AccessScope = 'full' | 'attendance_only';

/** Tên chuẩn của trạng thái học việc trong HRM (hiển thị trong danh sách chọn). */
export const TRANG_THAI_HOC_VIEC = 'Học việc NVKD';

/**
 * Các cách ghi (lowercase) cùng chỉ MỘT trạng thái học việc: tên chuẩn hiện tại
 * + tên cũ còn trong dữ liệu ("Học việc", "Học viên"). Nhân viên ở trạng thái
 * này chỉ được dùng Chấm công online.
 */
export const ATTENDANCE_ONLY_STATUSES = ['học việc nvkd', 'học việc', 'học viên'];

export const ATTENDANCE_ONLY_HOME = '/cham-cong-ngoai';

export function isHocViecStatus(trangThai: string | null | undefined): boolean {
  return ATTENDANCE_ONLY_STATUSES.includes((trangThai || '').trim().toLowerCase());
}

export const isAttendanceOnlyStatus = isHocViecStatus;

/** Gộp tên cũ (Học việc / Học viên) về tên chuẩn để hiển thị, lọc và lưu. */
export function normalizeTrangThaiNV(trangThai: string): string;
export function normalizeTrangThaiNV(trangThai: string | null | undefined): string | null | undefined;
export function normalizeTrangThaiNV(trangThai: string | null | undefined) {
  return isHocViecStatus(trangThai) ? TRANG_THAI_HOC_VIEC : trangThai;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

// API được phép: phiên đăng nhập, đổi mật khẩu, chấm công online,
// đăng ký thông báo đẩy, và đọc logo công ty (Sidebar).
const ATTENDANCE_ONLY_API_PREFIXES = [
  '/api/cham-cong-ngoai',
  '/api/push/subscribe',
  '/api/push/unsubscribe',
  '/api/pwa',
];
const ATTENDANCE_ONLY_API_EXACT = ['/api/auth', '/api/auth/change-password'];

// File tĩnh trong public/ (ảnh, font…) mà trang có thể tải
const STATIC_ASSET_RE = /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|css|js|json|webmanifest|txt)$/i;

export function isPathAllowedForAttendanceOnly(pathname: string, method: string): boolean {
  if (pathname.startsWith('/api/')) {
    if (ATTENDANCE_ONLY_API_EXACT.includes(pathname)) return true;
    if (ATTENDANCE_ONLY_API_PREFIXES.some(p => matchesPrefix(pathname, p))) return true;
    return pathname === '/api/settings/logo' && method === 'GET';
  }
  if (matchesPrefix(pathname, ATTENDANCE_ONLY_HOME) || matchesPrefix(pathname, '/login')) return true;
  return STATIC_ASSET_RE.test(pathname);
}
