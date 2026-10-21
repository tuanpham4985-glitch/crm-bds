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
 * Chức danh thuộc Khối Kinh doanh nhưng tên không chứa "KD" — dùng mẫu hợp
 * đồng Khối KD (theo yêu cầu người dùng 2026-10-21: CSKH/Telesale dùng chung
 * mẫu với Khối Kinh doanh). So khớp không phân biệt hoa thường.
 */
const KD_POSITIONS_WITHOUT_KD_SUFFIX = new Set(['nhân viên cskh/telesale']);

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
    department = position.includes('KD') || KD_POSITIONS_WITHOUT_KD_SUFFIX.has(position.trim().toLowerCase()) ? 'KD' : 'BO';
  } else {
    // Fallback: Priority 2: Detect by role
    department = role?.toLowerCase() === 'admin' ? 'BO' : 'KD';
  }

  const lowerLabel = contractTypeLabel?.toLowerCase() || '';
  const contract_category: ContractCategory = 
    lowerLabel.includes('thử việc') ? 'PROBATION' : 
    lowerLabel.includes('học viên') ? 'STUDENT' : 
    (lowerLabel.includes('cộng tác viên') || lowerLabel.includes('ctv')) ? 'COLLABORATOR' :
    'OFFICIAL';
    
  return { contract_category, department };
}
