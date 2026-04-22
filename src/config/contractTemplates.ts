// ============================================================
// Contract Template Config — Config-Driven Architecture
// CORE LAYER: All keys must be English
// ============================================================

export type ContractCategory = 'PROBATION' | 'OFFICIAL';
export type Department = 'BO' | 'KD';

export interface ContractTemplateConfig {
  contract_category: ContractCategory;
  department: Department;
  template_file: string;
  contract_type: string;
}

export const CONTRACT_TEMPLATES: ContractTemplateConfig[] = [
  {
    contract_category: 'PROBATION',
    department: 'BO',
    template_file: 'MẪU VIC_HĐTV (KHỐI BO).docx',
    contract_type: 'Thử việc (BO)',
  },
  {
    contract_category: 'PROBATION',
    department: 'KD',
    template_file: 'MẪU VIC_HĐTV (KHỐI KD).docx',
    contract_type: 'Thử việc (KD)',
  },
  {
    contract_category: 'OFFICIAL',
    department: 'BO',
    template_file: 'MẪU VIC_HĐLĐ (KHỐI BO).docx',
    contract_type: 'Chính thức (BO)',
  },
  {
    contract_category: 'OFFICIAL',
    department: 'KD',
    template_file: 'MẪU VIC_HĐLĐ (KHỐI KD).docx',
    contract_type: 'Chính thức (KD)',
  }
];
