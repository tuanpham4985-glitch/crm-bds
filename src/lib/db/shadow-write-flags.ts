// ============================================================
// CRM BĐS — Shadow Write Flags
//
// SHADOW_WRITE_MODULES: modules that dual-write to GS + PG.
// GS remains primary (all reads from GS).
// PG writes are fire-and-forget — failures only log, never block.
//
// Migration lifecycle per module:
//   1. (default)           → GS only
//   2. SHADOW_WRITE_MODULES → GS primary + PG shadow write
//   3. PG_ENABLED_MODULES  → PG primary (Phase 2)
// ============================================================

import type { CrmModule } from './feature-flags';

let _shadow: Set<CrmModule> | null = null;

function parseShadowModules(): Set<CrmModule> {
  const raw = process.env.SHADOW_WRITE_MODULES ?? '';
  return new Set(
    raw.split(',').map(s => s.trim()).filter(Boolean) as CrmModule[]
  );
}

export function isShadowWriteEnabled(module: CrmModule): boolean {
  if (!_shadow) _shadow = parseShadowModules();
  return _shadow.has(module);
}

export function _resetShadowCache(): void {
  _shadow = null;
}
