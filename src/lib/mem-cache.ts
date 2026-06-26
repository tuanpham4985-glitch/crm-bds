// Simple in-memory TTL cache for Vercel serverless containers.
// Lives in process memory — per-container, no cross-instance sharing.
// Reduces repeated PG/GS calls within the same warm lambda.

type Entry<T> = { data: T; expiresAt: number };
const store = new Map<string, Entry<unknown>>();

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() < hit.expiresAt) return Promise.resolve(hit.data);
  return fn().then(data => {
    store.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

export function invalidate(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
