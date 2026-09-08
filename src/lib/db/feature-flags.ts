// ============================================================
// CRM BĐS — Feature Flags: per-module PostgreSQL toggle
//
// Usage:
//   Set env var PG_ENABLED_MODULES=tm,hrm,crm (comma-separated)
//   Empty or unset → all modules use Google Sheets (safe default)
//
// Rollback: remove module name from PG_ENABLED_MODULES in Vercel
//           → takes effect on next request, no code deploy needed
// ============================================================

export type CrmModule =
  | 'tm'          // Task Management
  | 'hrm'         // Human Resources (NhanVien)
  | 'crm'         // CRM core (KhachHang, Pipeline)
  | 'attendance'  // ChamCongNgoai
  | 'dashboard'   // Dashboard (read-only aggregates)
  | 'contracts'   // HopDong
  | 'payroll'     // BangLuong, PayrollRecord, etc.
  | 'auth'        // Authentication (reads NhanVien)
  | 'stacking';   // StackingConfig read mirror (PROPOSED, xem stacking-config-mirror.ts
                  // — audit STACKING_CONFIG_QUOTA_INDEPENDENCE. Google Sheets vẫn
                  // là write authority duy nhất kể cả khi module này bật; chỉ đọc
                  // (GET /api/stacking/configs) đổi sang Postgres.

// Cache parsed modules for the lifetime of the process.
// On Vercel, each serverless invocation is fresh — no stale cache risk.
let _enabled: Set<CrmModule> | null = null;

function parseEnabledModules(): Set<CrmModule> {
  const raw = process.env.PG_ENABLED_MODULES ?? '';
  return new Set(
    raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean) as CrmModule[]
  );
}

export function isPostgresEnabled(module: CrmModule): boolean {
  if (!_enabled) _enabled = parseEnabledModules();
  return _enabled.has(module);
}

// Use in tests to reset between test cases
export function _resetFlagsCache(): void {
  _enabled = null;
}

// ============================================================
// STACKING_CONFIG dedicated PG-read cutover flag (PROPOSED —
// audit STACKING_CONFIG_QUOTA_INDEPENDENCE / PG_ENABLED_MODULES
// safe cutover decision).
//
// PG_ENABLED_MODULES is a single flat Vercel Secret whose current
// plaintext cannot be read back through any tool/UI once saved —
// appending 'stacking' to it safely would require already knowing
// its exact current value, which is not obtainable. Rather than
// overwrite that Secret on an unverified guess (risking silently
// dropping whichever modules it already lists), this is a SEPARATE,
// independent env var — adding/removing it can never affect
// PG_ENABLED_MODULES or any module already gated by it.
//
// Usage: set STACKING_CONFIG_PG_READS=1 in Vercel (Production only,
// unless Preview also needs it) to route GET /api/stacking/configs
// to the Postgres mirror instead of Google Sheets. Google Sheets
// remains the write authority regardless of this flag — see
// data-access.ts's addStackingConfig/updateStackingConfig/
// deleteStackingConfig, unaffected by this flag entirely.
//
// Rollback: remove STACKING_CONFIG_PG_READS from Vercel → reverts to
// isPostgresEnabled('stacking') (PG_ENABLED_MODULES-gated, currently
// off) on the next request, no code deploy needed — same
// zero-redeploy rollback property as every other flag in this file.
// ============================================================
export function isStackingConfigPgReadsEnabled(): boolean {
  return process.env.STACKING_CONFIG_PG_READS === '1';
}
