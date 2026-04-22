// ============================================================
// Contract Engine — Rule-based template resolution
// CORE LAYER: All keys must be English
// ============================================================

import { CONTRACT_TEMPLATES, ContractCategory, Department, ContractTemplateConfig } from '../config/contractTemplates';

export function getContractTemplate(category: ContractCategory, department: Department): ContractTemplateConfig | null {
  const template = CONTRACT_TEMPLATES.find(
    (t) => t.contract_category === category && t.department === department
  );
  return template || null;
}

export function getContractType(category: ContractCategory, department: Department): string | null {
  const template = getContractTemplate(category, department);
  return template ? template.contract_type : null;
}

export function getTemplateFile(category: ContractCategory, department: Department): string | null {
  const template = getContractTemplate(category, department);
  return template ? template.template_file : null;
}

/**
 * Detect department and contract_category from role (vai_tro), position (employee_type) and base contract label.
 */
export function detectEmployeeClassification(
  role: string, 
  contractTypeLabel: string, 
  position?: string
): { contract_category: ContractCategory, department: Department } {
  // Priority 1: Detect by position
  let department: Department = 'KD';
  if (position) {
    department = position.includes('KD') ? 'KD' : 'BO';
  } else {
    // Fallback: Priority 2: Detect by role
    department = role?.toLowerCase() === 'admin' ? 'BO' : 'KD';
  }

  const contract_category: ContractCategory = contractTypeLabel?.toLowerCase()?.includes('thử việc') ? 'PROBATION' : 'OFFICIAL';
  return { contract_category, department };
}
