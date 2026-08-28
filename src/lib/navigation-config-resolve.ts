// Runtime navigation config — authority CHỈ cho order + visible/enabled của
// menu (KHÔNG route/icon/parent-child/business rule, những cái đó ở
// menu-registry.ts). Pure, client-safe — không import settings-store (Node-
// only Google Sheets client) để 'use client' page nào import file này cũng
// không kéo fs/net/child_process vào bundle (bài học từ CRM Module Toggle).
import { MENU_REGISTRY, type MenuRootDef, type MenuChildDef } from './menu-registry';

export const NAVIGATION_CONFIG_VERSION = 1 as const;

export interface PersistedNavigationConfig {
  version: 1;
  rootOrder: string[];
  disabledRoots: string[];
  childOrder: Record<string, string[]>;
  disabledChildren: string[];
}

export const DEFAULT_NAVIGATION_CONFIG: PersistedNavigationConfig = {
  version: 1,
  rootOrder: [],
  disabledRoots: [],
  childOrder: {},
  disabledChildren: [],
};

/**
 * Kiểm tra + sanitize 1 giá trị bất kỳ (đọc từ Sheets hoặc gửi từ client)
 * thành đúng shape PersistedNavigationConfig. Trả về null nếu KHÔNG phải
 * version 1 hợp lệ (không đoán/migrate ngầm) — caller quyết định fallback
 * (đọc: về default; ghi: từ chối 400, không âm thầm ghi đè config tốt bằng
 * default rỗng).
 */
export function sanitizeNavigationConfigShape(candidate: unknown): PersistedNavigationConfig | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;
  if (c.version !== NAVIGATION_CONFIG_VERSION) return null;

  const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const childOrder: Record<string, string[]> = {};
  if (c.childOrder && typeof c.childOrder === 'object') {
    for (const [parentKey, order] of Object.entries(c.childOrder as Record<string, unknown>)) {
      if (typeof parentKey === 'string') childOrder[parentKey] = strings(order);
    }
  }

  return {
    version: 1,
    rootOrder: Array.from(new Set(strings(c.rootOrder))),
    disabledRoots: Array.from(new Set(strings(c.disabledRoots))),
    childOrder,
    disabledChildren: Array.from(new Set(strings(c.disabledChildren))),
  };
}

/**
 * Parse an toàn từ raw string đọc trong SETTINGS sheet — mọi trường hợp
 * hỏng (null, JSON invalid, version khác, shape sai) đều fallback
 * deterministic về DEFAULT_NAVIGATION_CONFIG, KHÔNG throw, KHÔNG làm Sidebar
 * sập.
 */
export function parseNavigationConfig(raw: string | null | undefined): PersistedNavigationConfig {
  if (!raw) return DEFAULT_NAVIGATION_CONFIG;
  try {
    const parsed: unknown = JSON.parse(raw);
    return sanitizeNavigationConfigShape(parsed) ?? DEFAULT_NAVIGATION_CONFIG;
  } catch {
    return DEFAULT_NAVIGATION_CONFIG;
  }
}

function orderKeys(defaultOrder: string[], persistedOrder: string[]): string[] {
  const known = new Set(defaultOrder);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const k of persistedOrder) {
    if (known.has(k) && !seen.has(k)) { kept.push(k); seen.add(k); }
  }
  // Key registry mới (chưa từng xuất hiện trong persisted order) được append
  // theo đúng thứ tự khai báo mặc định — deploy thêm menu mới không làm nó
  // biến mất, không cần migrate config cũ.
  const missing = defaultOrder.filter(k => !seen.has(k));
  return [...kept, ...missing];
}

export interface ResolvedMenuChild { key: string; enabled: boolean }
export interface ResolvedMenuRoot { key: string; enabled: boolean; children: ResolvedMenuChild[] }
export interface ResolvedNavigation { roots: ResolvedMenuRoot[] }

/**
 * registry (route/icon/structure/business rule) + persisted (order/visible)
 * + externalAvailability (authority BÊN NGOÀI đã tồn tại, hiện chỉ
 * { crm: crm_module_enabled }) -> 1 danh sách đã merge, sẵn sàng render.
 * externalAvailability LUÔN thắng disabledRoots cho root có
 * moduleAvailability tương ứng — đảm bảo không có 2 authority song song.
 */
export function resolveNavigationConfig(
  registry: MenuRootDef[],
  persisted: PersistedNavigationConfig,
  externalAvailability: Partial<Record<string, boolean>> = {},
): ResolvedNavigation {
  const rootKeys = orderKeys(registry.map(r => r.key), persisted.rootOrder);
  const registryByKey = new Map(registry.map(r => [r.key, r]));

  const roots: ResolvedMenuRoot[] = rootKeys
    .map(key => registryByKey.get(key))
    .filter((r): r is MenuRootDef => Boolean(r))
    .map(root => {
      const external = root.moduleAvailability ? externalAvailability[root.moduleAvailability] : undefined;
      const enabled = external !== undefined ? external : !persisted.disabledRoots.includes(root.key);

      const childDefs = root.children ?? [];
      const childKeys = orderKeys(childDefs.map(c => c.key), persisted.childOrder[root.key] ?? []);
      const childByKey = new Map(childDefs.map(c => [c.key, c]));
      const children: ResolvedMenuChild[] = childKeys
        .map(key => childByKey.get(key))
        .filter((c): c is MenuChildDef => Boolean(c))
        .map(child => ({ key: child.key, enabled: !persisted.disabledChildren.includes(child.key) }));

      return { key: root.key, enabled, children };
    });

  return { roots };
}

/**
 * Chiều ngược lại: sau khi Admin kéo-thả/bật-tắt trong Menu Manager (thao
 * tác trên ResolvedNavigation cho dễ), chuyển về đúng shape tối thiểu để
 * lưu. 'crm' KHÔNG BAO GIỜ được ghi vào disabledRoots — authority bật/tắt
 * CRM là crm_module_enabled (qua /api/crm-module), lưu ở đây chỉ gây drift.
 */
export function toPersistedConfig(resolved: ResolvedNavigation): PersistedNavigationConfig {
  return {
    version: 1,
    rootOrder: resolved.roots.map(r => r.key),
    disabledRoots: resolved.roots.filter(r => !r.enabled && r.key !== 'crm').map(r => r.key),
    childOrder: Object.fromEntries(resolved.roots.map(r => [r.key, r.children.map(c => c.key)])),
    disabledChildren: resolved.roots.flatMap(r => r.children.filter(c => !c.enabled).map(c => c.key)),
  };
}

/** Convenience: resolve trực tiếp từ MENU_REGISTRY mặc định của app. */
export function resolveDefaultNavigation(
  persisted: PersistedNavigationConfig,
  externalAvailability: Partial<Record<string, boolean>> = {},
): ResolvedNavigation {
  return resolveNavigationConfig(MENU_REGISTRY, persisted, externalAvailability);
}
