// ============================================================
// CRM BĐS — Task Management: Google Sheets Client
// Wraps existing google-sheets.ts pattern with batch support
// ============================================================
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import type { SheetName } from '../types';

// ─── AUTH ─────────────────────────────────────────────────

function getJWT(): JWT {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey  = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('[TM Sheets] Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY');
  }

  const cleanKey = privateKey.trim().replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');

  return new JWT({
    email: clientEmail,
    key: cleanKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ─── SHEET ID RESOLVER ────────────────────────────────────
// Task Management uses a dedicated spreadsheet (or same as main with TM_ prefix tabs)

function getTmSheetId(): string {
  // Prefer dedicated TM spreadsheet, fall back to main spreadsheet
  const id = process.env.TM_GOOGLE_SHEET_ID || process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('[TM Sheets] Missing TM_GOOGLE_SHEET_ID or GOOGLE_SHEET_ID');
  return id;
}

// ─── DOC CACHE ────────────────────────────────────────────

let _cachedDoc: GoogleSpreadsheet | null = null;
let _lastLoad = 0;
const DOC_CACHE_TTL = 60_000; // 1 min — metadata only

async function getDoc(): Promise<GoogleSpreadsheet> {
  const now = Date.now();
  if (_cachedDoc && now - _lastLoad < DOC_CACHE_TTL) return _cachedDoc;

  const doc = new GoogleSpreadsheet(getTmSheetId(), getJWT());
  await doc.loadInfo();
  _cachedDoc = doc;
  _lastLoad = now;
  return doc;
}

// ─── SHEET CACHE ──────────────────────────────────────────

const _sheetCache = new Map<string, { sheet: GoogleSpreadsheetWorksheet; ts: number }>();
const SHEET_CACHE_TTL = 300_000; // 5 min

async function getSheet(sheetName: SheetName): Promise<GoogleSpreadsheetWorksheet> {
  const cached = _sheetCache.get(sheetName);
  if (cached && Date.now() - cached.ts < SHEET_CACHE_TTL) return cached.sheet;

  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[sheetName];
  if (!sheet) throw new Error(`[TM Sheets] Sheet "${sheetName}" not found. Run initSheets() first.`);

  _sheetCache.set(sheetName, { sheet, ts: Date.now() });
  return sheet;
}

// ─── ROW HELPERS ──────────────────────────────────────────

export type RawRow = Record<string, string>;

/** Load all rows from a sheet, skipping soft-deleted entries */
export async function loadRows(
  sheetName: SheetName,
  deletedField = 'deleted_at',
): Promise<RawRow[]> {
  const sheet = await getSheet(sheetName);
  const rows  = await sheet.getRows();
  return rows
    .map(r => r.toObject() as RawRow)
    .filter(r => !r[deletedField]);
}

/** Load rows WITHOUT filtering (for audit / admin use) */
export async function loadAllRows(sheetName: SheetName): Promise<RawRow[]> {
  const sheet = await getSheet(sheetName);
  const rows  = await sheet.getRows();
  return rows.map(r => r.toObject() as RawRow);
}

/** Append a single new row */
export async function appendRow(sheetName: SheetName, data: RawRow): Promise<void> {
  const sheet = await getSheet(sheetName);
  await sheet.addRow(data);
}

/**
 * Batch append multiple rows in one API call.
 * Google Sheets API limit: 500 rows/request.
 */
export async function appendRows(sheetName: SheetName, rows: RawRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sheet = await getSheet(sheetName);
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await sheet.addRows(rows.slice(i, i + BATCH));
  }
}

/**
 * Update a single row identified by a key field (e.g. task_id).
 * Loads all rows → find match → update in place (then saves).
 *
 * For high-frequency updates, use batchUpdate instead.
 */
export async function updateRow(
  sheetName: SheetName,
  keyField: string,
  keyValue: string,
  data: Partial<RawRow>,
): Promise<RawRow | null> {
  const sheet   = await getSheet(sheetName);
  const rows    = await sheet.getRows();
  const target  = rows.find(r => r.get(keyField) === keyValue);
  if (!target) return null;

  for (const [k, v] of Object.entries(data)) {
    target.set(k, v ?? '');
  }
  await target.save();
  return target.toObject() as RawRow;
}

/**
 * Batch update: load all rows once, update matching entries, save in parallel.
 * Much more efficient than calling updateRow() in a loop.
 */
export async function batchUpdateRows(
  sheetName: SheetName,
  keyField: string,
  updates: { keyValue: string; data: Partial<RawRow> }[],
): Promise<void> {
  if (updates.length === 0) return;
  const sheet = await getSheet(sheetName);
  const rows  = await sheet.getRows();
  const map   = new Map(updates.map(u => [u.keyValue, u.data]));

  const toSave = rows.filter(r => {
    const patch = map.get(r.get(keyField));
    if (!patch) return false;
    for (const [k, v] of Object.entries(patch)) r.set(k, v ?? '');
    return true;
  });

  // Save up to 50 rows concurrently (Sheets API rate limit ~100 req/100s)
  const CONCURRENCY = 50;
  for (let i = 0; i < toSave.length; i += CONCURRENCY) {
    await Promise.all(toSave.slice(i, i + CONCURRENCY).map(r => r.save()));
  }
}

/** Soft delete: set deleted_at timestamp */
export async function softDeleteRow(
  sheetName: SheetName,
  keyField: string,
  keyValue: string,
): Promise<void> {
  await updateRow(sheetName, keyField, keyValue, {
    deleted_at: new Date().toISOString(),
  });
}

// ─── SHEET INITIALIZER ────────────────────────────────────
// Run once to create all TM_ sheets with headers

import { SHEET_NAMES, SHEET_COLUMNS } from '../types';

export async function initTaskManagementSheets(): Promise<void> {
  const doc = await getDoc();
  const existing = Object.keys(doc.sheetsByTitle);

  const sheetDefs: { name: SheetName; headers: readonly string[] }[] = [
    { name: SHEET_NAMES.USERS,          headers: SHEET_COLUMNS.USERS         },
    { name: SHEET_NAMES.DEPARTMENTS,    headers: SHEET_COLUMNS.DEPARTMENTS   },
    { name: SHEET_NAMES.PROJECTS,       headers: SHEET_COLUMNS.PROJECTS      },
    { name: SHEET_NAMES.TASKS,          headers: SHEET_COLUMNS.TASKS         },
    { name: SHEET_NAMES.SUBTASKS,       headers: SHEET_COLUMNS.SUBTASKS      },
    { name: SHEET_NAMES.CHECKLISTS,     headers: SHEET_COLUMNS.CHECKLISTS    },
    { name: SHEET_NAMES.COMMENTS,       headers: SHEET_COLUMNS.COMMENTS      },
    { name: SHEET_NAMES.ATTACHMENTS,    headers: SHEET_COLUMNS.ATTACHMENTS   },
    { name: SHEET_NAMES.NOTIFICATIONS,  headers: SHEET_COLUMNS.NOTIFICATIONS },
    { name: SHEET_NAMES.ACTIVITY_LOGS,  headers: SHEET_COLUMNS.ACTIVITY_LOGS },
  ];

  for (const { name, headers } of sheetDefs) {
    if (!existing.includes(name)) {
      const sheet = await doc.addSheet({ title: name, headerValues: [...headers] });
      // Freeze header row
      await sheet.updateDimensionProperties('ROWS', { pixelSize: 24 }, { startIndex: 0, endIndex: 1 });
      console.log(`[TM Sheets] Created sheet: ${name}`);
    } else {
      console.log(`[TM Sheets] Sheet already exists: ${name}`);
    }
  }
}

// ─── QUERY HELPERS ────────────────────────────────────────

/** Filter rows by a single field match (in-memory) */
export function filterByField<T extends RawRow>(
  rows: T[],
  field: string,
  value: string,
): T[] {
  return rows.filter(r => r[field] === value);
}

/** Filter rows where field is in a list of values */
export function filterByFieldIn<T extends RawRow>(
  rows: T[],
  field: string,
  values: string[],
): T[] {
  const set = new Set(values);
  return rows.filter(r => set.has(r[field]));
}

/** Simple text search across multiple fields */
export function searchRows<T extends RawRow>(
  rows: T[],
  query: string,
  fields: string[],
): T[] {
  const q = query.toLowerCase().trim();
  if (!q) return rows;
  return rows.filter(r =>
    fields.some(f => (r[f] || '').toLowerCase().includes(q)),
  );
}

/** Sort rows by a date/string field */
export function sortByField<T extends RawRow>(
  rows: T[],
  field: string,
  dir: 'asc' | 'desc' = 'desc',
): T[] {
  return [...rows].sort((a, b) => {
    const va = a[field] || '';
    const vb = b[field] || '';
    return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}

/** In-memory pagination */
export function paginateRows<T>(
  rows: T[],
  page: number,
  limit: number,
): { data: T[]; total: number; has_more: boolean } {
  const total = rows.length;
  const start = (page - 1) * limit;
  const data  = rows.slice(start, start + limit);
  return { data, total, has_more: start + limit < total };
}
