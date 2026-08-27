// CRM Module Toggle — module availability gate, ĐỘC LẬP với M1B.2 business
// authority. Chỉ quyết định "user thường có thấy/vào được nhóm CRM hay
// không" — KHÔNG thay thế isCrmAdmin/canManageCampaign/eligibleCampaignSales
// hay bất kỳ business authorization nào khác (những hàm đó giữ nguyên,
// server-side API vẫn tự enforce riêng).
//
// Storage: reuse SETTINGS sheet key/value store (đã có sẵn cho company_logo)
// thay vì thêm bảng Postgres/migration mới cho đúng 1 giá trị boolean, và
// thay vì env var (mục tiêu là runtime ON/OFF, không redeploy).
import { getSettingsSheet } from './settings-store';

const CRM_MODULE_KEY = 'crm_module_enabled';

// Cache ngắn (15s) — đủ giảm áp lực đọc Sheets cho mỗi lần Sidebar/trang CRM
// gọi, vẫn phản ánh thay đổi của Admin gần như ngay lập tức (khác cache 5
// phút của logo — correctness của access gate quan trọng hơn tối ưu đọc).
let _cache: { enabled: boolean; ts: number } | null = null;
const CACHE_TTL = 15_000;

export async function isCrmModuleEnabled(): Promise<boolean> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.enabled;
  const sheet = await getSettingsSheet();
  const rows = await sheet.getRows();
  const row = rows.find(r => r.get('key') === CRM_MODULE_KEY);
  // Chưa từng set (key không tồn tại) -> mặc định BẬT, giữ nguyên hành vi
  // hiện tại (CRM đang mở cho M1B.2 validation) cho tới khi Admin chủ động
  // tắt — tránh đổi hành vi bất ngờ ngay lúc deploy tính năng này.
  const enabled = row ? row.get('value') === 'true' : true;
  _cache = { enabled, ts: Date.now() };
  return enabled;
}

export async function setCrmModuleEnabled(enabled: boolean): Promise<void> {
  const sheet = await getSettingsSheet();
  const rows = await sheet.getRows();
  const existing = rows.find(r => r.get('key') === CRM_MODULE_KEY);
  if (existing) {
    existing.set('value', String(enabled));
    await existing.save();
  } else {
    await sheet.addRow({ key: CRM_MODULE_KEY, value: String(enabled) });
  }
  _cache = { enabled, ts: Date.now() };
}

// canAccessCrmModule() sống ở './crm-module-access' (pure, không Node-only
// deps) — import trực tiếp từ đó, KHÔNG từ file này. 'use client' page nào
// import từ file này sẽ kéo theo google-spreadsheet/google-auth-library vào
// client bundle, webpack build fail ("Can't resolve fs/net/child_process").
