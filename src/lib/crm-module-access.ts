// Pure authority helper — TÁCH RIÊNG khỏi crm-module.ts vì file đó import
// settings-store.ts (google-spreadsheet/google-auth-library, Node-only: fs/
// net/child_process). Các trang CRM là 'use client' component và import
// canAccessCrmModule trực tiếp — nếu để chung 1 file, toàn bộ Node-only deps
// bị kéo vào client bundle và webpack build thất bại ("Can't resolve 'fs'").
// File này KHÔNG import gì khác — an toàn dùng ở cả client và server.

/**
 * Authority helper DUY NHẤT cho "có thấy/vào được CRM surface không" — dùng
 * chung ở Sidebar + mọi trang CRM (khach-hang/phan-khach/data-chat-luong/
 * pipeline) để tránh rải rác `isAdmin || crmEnabled` copy nhiều nơi. Admin
 * luôn bypass toggle (CRM OFF chỉ ẩn/chặn non-admin — Admin vẫn vào bình
 * thường để còn chỗ bật lại).
 */
export function canAccessCrmModule(isAdmin: boolean, crmEnabled: boolean): boolean {
  return isAdmin || crmEnabled;
}
