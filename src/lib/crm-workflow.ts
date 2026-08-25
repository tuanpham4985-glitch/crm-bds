import { getPipeline, updatePipeline } from './data-access';
import type { CrmBanGiaoEntry, CrmChamSocEntry } from './types';

export function parseJsonList<T>(raw?: string): T[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export function appendChamSoc(raw: string | undefined, entry: CrmChamSocEntry): string {
  return JSON.stringify([...parseJsonList<CrmChamSocEntry>(raw), entry]);
}

export function appendBanGiao(raw: string | undefined, entry: CrmBanGiaoEntry): string {
  return JSON.stringify([...parseJsonList<CrmBanGiaoEntry>(raw), entry]);
}

export async function syncCustomerSaleToPipeline(customerId: string, saleName: string): Promise<void> {
  const pipelines = (await getPipeline()).filter(item => item.id_khach_hang === customerId);
  await Promise.all(pipelines.map(item => updatePipeline({
    ...item,
    sale_phu_trach: saleName,
    ngay_cap_nhat: new Date().toISOString(),
  })));
}
