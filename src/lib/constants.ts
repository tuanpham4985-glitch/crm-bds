// ============================================================
// CRM BĐS — Constants
// ============================================================

export const GIAI_DOAN_PIPELINE = [
  'Mới',
  'Đã liên hệ',
  'Hẹn xem',
  'Đặt cọc',
  'Ký HĐ',
  'Hủy - Không nghe máy',
  'Hủy - Không đủ tiền',
  'Hủy - Không thích',
] as const;

export const GIAI_DOAN_ACTIVE = ['Mới', 'Đã liên hệ', 'Hẹn xem', 'Đặt cọc', 'Ký HĐ'] as const;
export const GIAI_DOAN_HUY = ['Hủy - Không nghe máy', 'Hủy - Không đủ tiền', 'Hủy - Không thích'] as const;

export const TRANG_THAI_KH = [
  'Mới',
  'Đã gọi',
  'Hẹn xem',
  'Quan tâm',
  'Cọc',
  'Chốt',
  'Thất bại',
] as const;

export const TRANG_THAI_CONG_VIEC = [
  'Chưa làm',
  'Đang làm',
  'Hoàn thành',
  'Quá hạn',
] as const;

export const NGUON = [
  'Facebook',
  'Zalo',
  'Ads',
  'Telesale',
  'Khác',
] as const;

export const VAI_TRO = ['Admin', 'Sale'] as const;

// === HỢP ĐỒNG ===
export const LOAI_HOP_DONG = ['Thử việc', 'Chính thức', 'CTV'] as const;

export const TRANG_THAI_HOP_DONG_COLORS: Record<string, { bg: string; text: string }> = {
  'Còn hiệu lực': { bg: '#ecfdf5', text: '#065f46' },
  'Hết hạn': { bg: '#fff1f2', text: '#9f1239' },
};

// Giai đoạn color mapping
export const GIAI_DOAN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Mới': { bg: '#f1f5f9', text: '#475569', border: '#94a3b8' },
  'Đã liên hệ': { bg: '#eff6ff', text: '#1d4ed8', border: '#60a5fa' },
  'Hẹn xem': { bg: '#fffbeb', text: '#b45309', border: '#fbbf24' },
  'Đặt cọc': { bg: '#ecfdf5', text: '#047857', border: '#34d399' },
  'Ký HĐ': { bg: '#f0fdf4', text: '#15803d', border: '#22c55e' },
  'Hủy - Không nghe máy': { bg: '#fff1f2', text: '#be123c', border: '#fb7185' },
  'Hủy - Không đủ tiền': { bg: '#fff1f2', text: '#be123c', border: '#fb7185' },
  'Hủy - Không thích': { bg: '#fff1f2', text: '#be123c', border: '#fb7185' },
};

// Trạng thái công việc color mapping
export const TRANG_THAI_CV_COLORS: Record<string, { bg: string; text: string }> = {
  'Chưa làm': { bg: '#f1f5f9', text: '#475569' },
  'Đang làm': { bg: '#eff6ff', text: '#1d4ed8' },
  'Hoàn thành': { bg: '#ecfdf5', text: '#047857' },
  'Quá hạn': { bg: '#fff1f2', text: '#be123c' },
};

export const ITEMS_PER_PAGE = 20;

export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: '/khach-hang', label: 'Khách hàng', icon: 'Users' },
  { href: '/pipeline', label: 'Pipeline', icon: 'GitBranch' },
  { href: '/cong-viec', label: 'Công việc', icon: 'CheckSquare' },
  { href: '/du-an', label: 'Dự án', icon: 'Building2' },
  { href: '/nhan-vien', label: 'Nhân viên', icon: 'UserCog' },
] as const;
