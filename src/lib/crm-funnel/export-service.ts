import { getDuAn, getNhanVien } from '../data-access';
import { buildCrmManagerScope, type CrmSessionUser } from '../crm-auth';
import { prisma } from '../db/client';
import type { QualifiedLeadFilters } from '../types';

export async function qualityManagerScope(user: CrmSessionUser) {
  const [projects, employees] = await Promise.all([getDuAn(), getNhanVien()]);
  const scope = buildCrmManagerScope(user, projects, employees);
  if (!scope.canManageQuality) throw new Error('QUALITY_EXPORT_FORBIDDEN');
  return scope;
}

export async function recordQualityExportAudit(input: {
  user: CrmSessionUser;
  filters: QualifiedLeadFilters;
  recordCount: number;
  exportType: 'XLSX' | 'GOOGLE_SHEETS';
  destination?: string;
}) {
  return prisma.crmExportAudit.create({ data: {
    exported_by_id: input.user.id_nhan_vien,
    exported_by_name: input.user.ho_ten,
    filters_json: JSON.stringify(input.filters),
    record_count: input.recordCount,
    export_type: input.exportType,
    destination: input.destination,
  } });
}

export async function updateQualityExportDestination(id: string, destination: string) {
  return prisma.crmExportAudit.update({ where: { id }, data: { destination } });
}
