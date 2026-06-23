// ============================================================
// CRM BĐS — Shadow Write Repository Factory
//
// Wraps any repository pair (primary + shadow) using Proxy.
// - READ methods → always hit primary (Google Sheets)
// - WRITE methods → hit primary first, then shadow fire-and-forget
//
// Shadow write failures are logged but NEVER block the response.
// Monitor logs for [ShadowWrite] errors to detect divergence.
// ============================================================

const WRITE_METHODS = new Set([
  'create', 'createBatch', 'update', 'delete',
  'updateStatus', 'updateBangLuong', 'deleteBangLuong', 'saveBatch',
]);

export function createShadowRepository<T extends object>(
  moduleName: string,
  primary: T,
  shadow: T,
): T {
  return new Proxy(primary, {
    get(target, prop: string | symbol) {
      const method = Reflect.get(target, prop);
      if (typeof method !== 'function') return method;

      // READ methods: delegate straight to primary
      if (!WRITE_METHODS.has(String(prop))) {
        return (...args: unknown[]) => (method as (...a: unknown[]) => unknown).apply(target, args);
      }

      // WRITE methods: primary first, shadow fire-and-forget
      return async (...args: unknown[]) => {
        const result = await (method as (...a: unknown[]) => unknown).apply(target, args);

        const shadowMethod = Reflect.get(shadow, prop);
        if (typeof shadowMethod === 'function') {
          (shadowMethod as (...a: unknown[]) => Promise<unknown>)
            .apply(shadow, args)
            .catch((err: Error) => {
              console.warn(
                `[ShadowWrite:${moduleName}:${String(prop)}] PG write failed (non-blocking):`,
                err.message,
              );
            });
        }

        return result;
      };
    },
  }) as T;
}
