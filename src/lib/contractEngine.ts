// ============================================================
// Contract Engine — Rule-based template resolution
// CORE LAYER: All keys must be English
// ============================================================

import { CONTRACT_TEMPLATES, EmployeeType, Department, ContractTemplateConfig } from '../config/contractTemplates';

export function getContractTemplate(employee_type: EmployeeType, department: Department): ContractTemplateConfig | null {
  const template = CONTRACT_TEMPLATES.find(
    (t) => t.employee_type === employee_type && t.department === department
  );
  return template || null;
}

export function getContractType(employee_type: EmployeeType, department: Department): string | null {
  const template = getContractTemplate(employee_type, department);
  return template ? template.contract_type : null;
}

export function getTemplateFile(employee_type: EmployeeType, department: Department): string | null {
  const template = getContractTemplate(employee_type, department);
  return template ? template.template_file : null;
}

/**
 * Detect department and employee_type from role (vai_tro), chuc_danh (position) and base contract label.
 */
export function detectEmployeeClassification(
  role: string, 
  contractTypeLabel: string, 
  chuc_danh?: string
): { employee_type: EmployeeType, department: Department } {
  // Priority 1: Detect by chuc_danh (position)
  let department: Department = 'KD';
  if (chuc_danh) {
    department = chuc_danh.includes('KD') ? 'KD' : 'BO';
  } else {
    // Fallback: Priority 2: Detect by role
    department = role?.toLowerCase() === 'admin' ? 'BO' : 'KD';
  }

  const employee_type: EmployeeType = contractTypeLabel?.toLowerCase()?.includes('thử việc') ? 'PROBATION' : 'OFFICIAL';
  return { employee_type, department };
}
