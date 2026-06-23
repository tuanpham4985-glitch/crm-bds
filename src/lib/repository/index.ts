// ============================================================
// CRM BĐS — DataSource Factory
//
// Đây là entry point duy nhất để lấy repository.
// API routes import từ đây — không import google-sheets.ts trực tiếp.
//
// Feature flag (env PG_ENABLED_MODULES) quyết định adapter nào được dùng.
// Default: Google Sheets (an toàn, rollback = xóa module khỏi env var)
// ============================================================

import { isPostgresEnabled } from '../db/feature-flags';

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
import { PostgresEmployeeRepository }         from './postgresql/employee.repo';
import { PostgresCustomerRepository }          from './postgresql/customer.repo';
import { PostgresPipelineRepository }          from './postgresql/pipeline.repo';
import { PostgresProjectRepository }           from './postgresql/project.repo';
import { PostgresCrmTaskRepository }           from './postgresql/crm-task.repo';
import { PostgresContractRepository }          from './postgresql/contract.repo';
import { PostgresAttendanceOutsideRepository } from './postgresql/attendance-outside.repo';
import { PostgresPayrollRepository }           from './postgresql/payroll.repo';

// ── Re-export interfaces for convenience ─────────────────────
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

// ── Factory functions ─────────────────────────────────────────

export function getEmployeeRepository() {
  return isPostgresEnabled('hrm') || isPostgresEnabled('auth')
    ? new PostgresEmployeeRepository()
    : new GoogleSheetsEmployeeRepository();
}

export function getCustomerRepository() {
  return isPostgresEnabled('crm')
    ? new PostgresCustomerRepository()
    : new GoogleSheetsCustomerRepository();
}

export function getPipelineRepository() {
  return isPostgresEnabled('crm')
    ? new PostgresPipelineRepository()
    : new GoogleSheetsPipelineRepository();
}

export function getProjectRepository() {
  return isPostgresEnabled('crm')
    ? new PostgresProjectRepository()
    : new GoogleSheetsProjectRepository();
}

export function getCrmTaskRepository() {
  return isPostgresEnabled('crm')
    ? new PostgresCrmTaskRepository()
    : new GoogleSheetsCrmTaskRepository();
}

export function getContractRepository() {
  return isPostgresEnabled('contracts')
    ? new PostgresContractRepository()
    : new GoogleSheetsContractRepository();
}

export function getAttendanceOutsideRepository() {
  return isPostgresEnabled('attendance')
    ? new PostgresAttendanceOutsideRepository()
    : new GoogleSheetsAttendanceOutsideRepository();
}

export function getPayrollRepository() {
  return isPostgresEnabled('payroll')
    ? new PostgresPayrollRepository()
    : new GoogleSheetsPayrollRepository();
}
