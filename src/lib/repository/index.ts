// ============================================================
// CRM BĐS — DataSource Factory
//
// Entry point duy nhất cho mọi data access.
// API routes import từ đây — KHÔNG import google-sheets.ts trực tiếp.
//
// Lifecycle per module:
//   1. (default)            → Google Sheets only
//   2. SHADOW_WRITE_MODULES → GS primary + PG shadow write (Phase 1)
//   3. PG_ENABLED_MODULES   → PostgreSQL primary (Phase 2+)
//
// Rollback: xóa module khỏi env var → revert ngay, không cần deploy
// ============================================================

import { isPostgresEnabled } from '../db/feature-flags';
import { isShadowWriteEnabled } from '../db/shadow-write-flags';
import { createShadowRepository } from './shadow-write';

// ── Google Sheets adapters ────────────────────────────────────
import { GoogleSheetsEmployeeRepository }         from './google-sheets/employee.repo';
import { GoogleSheetsCustomerRepository }          from './google-sheets/customer.repo';
import { GoogleSheetsPipelineRepository }          from './google-sheets/pipeline.repo';
import { GoogleSheetsProjectRepository }           from './google-sheets/project.repo';
import { GoogleSheetsCrmTaskRepository }           from './google-sheets/crm-task.repo';
import { GoogleSheetsContractRepository }          from './google-sheets/contract.repo';
import { GoogleSheetsAttendanceOutsideRepository } from './google-sheets/attendance-outside.repo';
import { GoogleSheetsPayrollRepository }           from './google-sheets/payroll.repo';

// ── PostgreSQL adapters ───────────────────────────────────────
import { PostgresEmployeeRepository }              from './postgresql/employee.repo';
import { PostgresCustomerRepository }              from './postgresql/customer.repo';
import { PostgresPipelineRepository }              from './postgresql/pipeline.repo';
import { PostgresProjectRepository }               from './postgresql/project.repo';
import { PostgresCrmTaskRepository }               from './postgresql/crm-task.repo';
import { PostgresContractRepository }              from './postgresql/contract.repo';
import { PostgresAttendanceOutsideRepository }     from './postgresql/attendance-outside.repo';
import { PostgresPayrollRepository }               from './postgresql/payroll.repo';

// ── Re-export interfaces ──────────────────────────────────────
export type {
  IEmployeeRepository,
  ICustomerRepository,
  IPipelineRepository,
  IProjectRepository,
  ICrmTaskRepository,
  IContractRepository,
  IAttendanceOutsideRepository,
  IPayrollRepository,
  ICrmRepositories,
  PayrollBatchEntry,
  BangLuongUpdateFields,
} from './interfaces';

// ── Helpers ───────────────────────────────────────────────────
//
// resolve(module, gs, pg):
//   PG_ENABLED  → pg
//   SHADOW      → shadow(gs, pg)
//   default     → gs
//
function resolve<T extends object>(
  module: Parameters<typeof isPostgresEnabled>[0],
  gs: () => T,
  pg: () => T,
): T {
  if (isPostgresEnabled(module))    return pg();
  if (isShadowWriteEnabled(module)) return createShadowRepository(module, gs(), pg());
  return gs();
}

// ── Factory functions ─────────────────────────────────────────

export function getEmployeeRepository() {
  // 'hrm' flag controls employee read/write; 'auth' only needs read (covered by hrm flag)
  const module = 'hrm';
  return resolve(
    module,
    () => new GoogleSheetsEmployeeRepository(),
    () => new PostgresEmployeeRepository(),
  );
}

export function getCustomerRepository() {
  return resolve(
    'crm',
    () => new GoogleSheetsCustomerRepository(),
    () => new PostgresCustomerRepository(),
  );
}

export function getPipelineRepository() {
  return resolve(
    'crm',
    () => new GoogleSheetsPipelineRepository(),
    () => new PostgresPipelineRepository(),
  );
}

export function getProjectRepository() {
  return resolve(
    'crm',
    () => new GoogleSheetsProjectRepository(),
    () => new PostgresProjectRepository(),
  );
}

export function getCrmTaskRepository() {
  return resolve(
    'crm',
    () => new GoogleSheetsCrmTaskRepository(),
    () => new PostgresCrmTaskRepository(),
  );
}

export function getContractRepository() {
  return resolve(
    'contracts',
    () => new GoogleSheetsContractRepository(),
    () => new PostgresContractRepository(),
  );
}

export function getAttendanceOutsideRepository() {
  return resolve(
    'attendance',
    () => new GoogleSheetsAttendanceOutsideRepository(),
    () => new PostgresAttendanceOutsideRepository(),
  );
}

export function getPayrollRepository() {
  return resolve(
    'payroll',
    () => new GoogleSheetsPayrollRepository(),
    () => new PostgresPayrollRepository(),
  );
}
