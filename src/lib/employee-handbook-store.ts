// Sổ tay nhân viên — SERVER-ONLY persistence trên SETTINGS sheet (cùng cơ
// chế key/value với navigation-config / crm-module). Mỗi mục lưu 1 dòng riêng
// (key "employee_handbook:<sectionKey>") để không chạm giới hạn 50.000 ký
// tự/ô; thứ tự mục lưu ở "employee_handbook:_order".
//
// 'use client' page KHÔNG được import file này (kéo google-spreadsheet vào
// client bundle) — gọi qua /api/so-tay-nhan-vien.
import { getSettingsSheet } from './settings-store';
import { DEFAULT_HANDBOOK_SECTIONS, type HandbookSection } from './employee-handbook';

const PREFIX = 'employee_handbook:';
const ORDER_KEY = `${PREFIX}_order`;

let _cache: { sections: HandbookSection[]; ts: number } | null = null;
const CACHE_TTL = 15_000;

function parseJson<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || !raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function getHandbookSections(): Promise<HandbookSection[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.sections;
  const sheet = await getSettingsSheet();
  const rows = await sheet.getRows();
  const stored = new Map<string, string>();
  for (const r of rows) {
    const k = r.get('key') as string | undefined;
    if (k && k.startsWith(PREFIX)) stored.set(k, r.get('value') as string);
  }

  const defaults = new Map(DEFAULT_HANDBOOK_SECTIONS.map(s => [s.key, s]));
  const order = parseJson<string[]>(stored.get(ORDER_KEY)) ?? DEFAULT_HANDBOOK_SECTIONS.map(s => s.key);

  const sections: HandbookSection[] = [];
  for (const key of order) {
    const saved = parseJson<Partial<HandbookSection>>(stored.get(PREFIX + key));
    const base = defaults.get(key);
    if (!saved && !base) continue;
    sections.push({
      key,
      title: saved?.title ?? base?.title ?? key,
      description: saved?.description ?? base?.description ?? '',
      content: saved?.content ?? '',
      updated_at: saved?.updated_at,
      updated_by: saved?.updated_by,
    });
  }
  _cache = { sections, ts: Date.now() };
  return sections;
}

async function upsertRows(entries: Record<string, string>): Promise<void> {
  const sheet = await getSettingsSheet();
  const rows = await sheet.getRows();
  for (const [key, value] of Object.entries(entries)) {
    const existing = rows.find(r => r.get('key') === key);
    if (existing) {
      existing.set('value', value);
      await existing.save();
    } else {
      await sheet.addRow({ key, value });
    }
  }
}

export async function saveHandbookSection(section: HandbookSection, order: string[]): Promise<void> {
  const { key, ...data } = section;
  await upsertRows({
    [PREFIX + key]: JSON.stringify(data),
    [ORDER_KEY]: JSON.stringify(order),
  });
  _cache = null;
}

/** Xoá = bỏ khỏi thứ tự + làm rỗng dòng dữ liệu (không xoá dòng trên sheet). */
export async function removeHandbookSection(key: string, order: string[]): Promise<void> {
  await upsertRows({
    [PREFIX + key]: '',
    [ORDER_KEY]: JSON.stringify(order),
  });
  _cache = null;
}
