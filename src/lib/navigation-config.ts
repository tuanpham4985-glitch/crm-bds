// Navigation config — SERVER-ONLY persistence (Google Sheets SETTINGS key/
// value store, tái dùng đúng cơ chế đã có cho company_logo/crm_module_enabled
// qua settings-store.ts). Chỉ đọc/ghi raw string — mọi việc parse/validate
// shape nằm ở navigation-config-resolve.ts (pure, client-safe).
//
// 'use client' page KHÔNG được import file này — sẽ kéo theo google-
// spreadsheet/google-auth-library (fs/net/child_process) vào client bundle,
// build fail. Dùng src/hooks/useNavigationConfig.ts (gọi qua API route) thay
// thế, đúng pattern đã áp dụng cho crm-module.ts/crm-module-access.ts.
import { getSettingValue, setSettingValue } from './settings-store';

const NAVIGATION_CONFIG_KEY = 'navigation_config_v1';

// Cache ngắn (15s) — cùng lý do/thời lượng với crm-module.ts: giảm áp lực
// đọc Sheets mỗi lần Sidebar/Menu Manager gọi, vẫn phản ánh thay đổi gần như
// ngay lập tức.
let _cache: { raw: string | null; ts: number } | null = null;
const CACHE_TTL = 15_000;

export async function getRawNavigationConfig(): Promise<string | null> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.raw;
  const raw = await getSettingValue(NAVIGATION_CONFIG_KEY);
  _cache = { raw, ts: Date.now() };
  return raw;
}

export async function setRawNavigationConfig(raw: string): Promise<void> {
  await setSettingValue(NAVIGATION_CONFIG_KEY, raw);
  _cache = { raw, ts: Date.now() };
}
