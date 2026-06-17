// ============================================================
// CRM BĐS — Task Management: In-Memory Cache
// LRU-style cache with TTL. No Redis dependency for Vercel.
// ============================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TmCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  set<T>(key: string, value: T, ttlMs = 60_000): void {
    // Evict oldest if full
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all keys matching a prefix */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// ─── CACHE KEY HELPERS ────────────────────────────────────

export const CK = {
  task:         (id: string)   => `task:${id}`,
  taskList:     (deptId: string, page: number) => `tasks:dept:${deptId}:p${page}`,
  subtasks:     (taskId: string)  => `subtasks:${taskId}`,
  checklists:   (taskId: string)  => `checklists:${taskId}`,
  comments:     (taskId: string)  => `comments:${taskId}`,
  userList:     (deptId: string)  => `users:dept:${deptId}`,
  projectList:  ()                => `projects:all`,
  deptKpi:      (deptId: string)  => `kpi:dept:${deptId}`,
  companyKpi:   ()                => `kpi:company`,
  overdueList:  ()                => `tasks:overdue`,
  unreadCount:  (userId: string)  => `notif:unread:${userId}`,
} as const;

// TTLs in ms
export const TTL = {
  TASK_DETAIL:  30_000,  // 30s  — task changes frequently
  TASK_LIST:    15_000,  // 15s  — list refreshes often
  USER_LIST:    300_000, // 5min — users rarely change
  PROJECT_LIST: 300_000, // 5min
  KPI:          900_000, // 15min — expensive to compute
  OVERDUE:      60_000,  // 1min — near-realtime for alerts
  NOTIF_COUNT:  10_000,  // 10s  — badge count
} as const;

// ─── SINGLETON ────────────────────────────────────────────

export const tmCache = new TmCache(1000);

// ─── CACHE-ASIDE HELPER ───────────────────────────────────

export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = tmCache.get<T>(key);
  if (hit !== null) return hit;
  const value = await fetcher();
  tmCache.set(key, value, ttlMs);
  return value;
}
