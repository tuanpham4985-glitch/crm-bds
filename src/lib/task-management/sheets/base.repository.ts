// ============================================================
// CRM BĐS — Task Management: Base Sheets Repository
// Implements generic CRUD on Google Sheets
// ============================================================
import { randomUUID } from 'crypto';
import type { SheetName, PaginationOptions, PaginatedResult } from '../types';
import {
  loadRows, appendRow, updateRow, softDeleteRow,
  filterByField, sortByField, paginateRows,
} from './client';

export abstract class BaseSheetsRepository<T extends object> {
  protected abstract sheetName: SheetName;
  protected abstract idField: string;

  // Subclasses can override to add computed fields after loading
  protected deserialize(raw: Record<string, string>): T {
    return raw as unknown as T;
  }

  // Subclasses can override to transform before writing
  protected serialize(data: Partial<T>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === undefined) result[k] = '';
      else if (typeof v === 'boolean') result[k] = v ? 'TRUE' : 'FALSE';
      else if (typeof v === 'object') result[k] = JSON.stringify(v);
      else result[k] = String(v);
    }
    return result;
  }

  async findById(id: string): Promise<T | null> {
    const rows = await loadRows(this.sheetName);
    const found = filterByField(rows, this.idField, id)[0];
    return found ? this.deserialize(found) : null;
  }

  async findAll(activeOnly = true): Promise<T[]> {
    const rows = await loadRows(this.sheetName, activeOnly ? 'deleted_at' : '__none__');
    return rows.map(r => this.deserialize(r));
  }

  async findManyByField(
    field: string,
    value: string,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<T>> {
    const rows = await loadRows(this.sheetName);
    const filtered = filterByField(rows, field, value);
    const sorted   = sortByField(filtered, 'created_at', 'desc');
    const page     = pagination?.page  ?? 1;
    const limit    = pagination?.limit ?? 50;
    const { data, total, has_more } = paginateRows(sorted, page, limit);
    return { data: data.map(r => this.deserialize(r)), total, page, limit, has_more };
  }

  // Convenience create — subclasses may override with custom signatures
  protected async baseCreate(data: Partial<T> & { [key: string]: unknown }): Promise<T> {
    const id  = randomUUID();
    const now = new Date().toISOString();
    const row = this.serialize({
      [this.idField]: id,
      created_at: now,
      updated_at: now,
      ...data,
    } as unknown as T);
    await appendRow(this.sheetName, row);
    return this.deserialize({ ...row });
  }

  // Convenience update — subclasses may override with custom signatures
  protected async baseUpdate(id: string, data: Partial<T>): Promise<T | null> {
    const patch = this.serialize({
      ...data,
      updated_at: new Date().toISOString(),
    } as Partial<T>);
    const updated = await updateRow(this.sheetName, this.idField, id, patch);
    return updated ? this.deserialize(updated) : null;
  }

  async softDelete(id: string): Promise<void> {
    await softDeleteRow(this.sheetName, this.idField, id);
  }

  protected parseBoolean(val: string | undefined): boolean {
    return val === 'TRUE' || val === 'true' || val === '1';
  }

  protected parseNumber(val: string | undefined, fallback = 0): number {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  }

  protected parseJson<TResult>(val: string | undefined, fallback: TResult): TResult {
    if (!val) return fallback;
    try { return JSON.parse(val) as TResult; } catch { return fallback; }
  }

  protected genId(): string { return randomUUID(); }
}
