// Chọn khối (mẫu hợp đồng BO/KD) theo chức danh — CSKH/Telesale dùng mẫu Khối KD.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectEmployeeClassification, getContractTemplate } from '../../src/lib/contractEngine';

test('Nhân viên CSKH/Telesale -> Khối KD (mẫu HĐTV/HĐLĐ KD)', () => {
  const probation = detectEmployeeClassification('Sale', 'Thử việc', 'Nhân viên CSKH/Telesale');
  assert.equal(probation.department, 'KD');
  assert.equal(getContractTemplate(probation.contract_category, probation.department)?.template_file, 'MAU_VIC_HDTV_KD.docx');
  const official = detectEmployeeClassification('Sale', 'Chính thức', ' nhân viên cskh/telesale ');
  assert.equal(getContractTemplate(official.contract_category, official.department)?.template_file, 'MAU_VIC_HDLD_KD.docx');
});

test('các chức danh khác giữ nguyên quy tắc cũ (có "KD" -> KD, còn lại BO)', () => {
  assert.equal(detectEmployeeClassification('Sale', 'Thử việc', 'NVKD').department, 'KD');
  assert.equal(detectEmployeeClassification('Sale', 'Thử việc', 'Học việc NVKD').department, 'KD');
  assert.equal(detectEmployeeClassification('Sale', 'Thử việc', 'CV CSKH').department, 'BO');
  assert.equal(detectEmployeeClassification('Admin', 'Thử việc', 'CV Kế toán').department, 'BO');
});
