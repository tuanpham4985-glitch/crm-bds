// ============================================================
// Contract Template Config — Config-Driven Architecture
// CORE LAYER: All keys must be English
// ============================================================

export type EmployeeType = 'PROBATION' | 'OFFICIAL';
export type Department = 'BO' | 'KD';

export interface ContractTemplateConfig {
  employee_type: EmployeeType;
  department: Department;
  template_file: string;
  contract_type: string;
}

export const CONTRACT_TEMPLATES: ContractTemplateConfig[] = [
  {
    employee_type: 'PROBATION',
    department: 'BO',
    template_file: 'MẪU VIC_HĐTV (KHỐI BO).docx',
    contract_type: 'Thử việc (BO)',
  },
  {
    employee_type: 'PROBATION',
    department: 'KD',
    template_file: 'MẪU VIC_HĐTV (KHỐI KD).docx',
    contract_type: 'Thử việc (KD)',
  },
  {
    employee_type: 'OFFICIAL',
    department: 'BO',
    template_file: 'MẪU VIC_HĐLĐ (KHỐI BO).docx',
    contract_type: 'Chính thức (BO)',
  },
  {
    employee_type: 'OFFICIAL',
    department: 'KD',
    template_file: 'MẪU VIC_HĐLĐ (KHỐI KD).docx',
    contract_type: 'Chính thức (KD)',
  }
];
