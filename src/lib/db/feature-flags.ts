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
  | 'auth';       // Authentication (reads NhanVien)

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
