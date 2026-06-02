/**
 * POST /api/payroll/import-excel
 *
 * Nhận file .xlsx Bảng lương KD hoặc BO, parse và trả về danh sách
 * { id_nhan_vien, ho_ten, thuc_linh } từ cột AM "Thực Lĩnh" trong sheet "BẢNG LƯƠNG".
 *
 * Multipart form-data:
 *   file  — file .xlsx bảng lương
 *   loai  — "KD" | "BO"
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export interface SalaryImportRow {
  id_nhan_vien: string;
  ho_ten: string;
  thuc_linh: number;
  loai: 'KD' | 'BO';
}

const SHEET_NAME = 'BẢNG LƯƠNG';
const COL_MA_NV   = 1;  // Cột B (0-indexed)
const COL_HO_TEN  = 2;  // Cột C
const COL_THUC_LINH = 38; // Cột AM

function normalizeEmployeeId(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '0') return '';
  // VIC-XX dòng tiêu đề nhóm → bỏ qua
  if (/^VIC-/i.test(s)) return '';
  // Số thuần → zero-pad 4 chữ số
  if (/^\d+$/.test(s)) return s.padStart(4, '0');
  return s;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'Thiếu file Excel' }, { status: 400 });
    }

    const loai = (formData.get('loai') as string || 'KD').toUpperCase() as 'KD' | 'BO';
    if (loai !== 'KD' && loai !== 'BO') {
      return NextResponse.json({ success: false, error: 'loai phải là KD hoặc BO' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });

    const ws = wb.Sheets[SHEET_NAME];
    if (!ws) {
      const sheets = wb.SheetNames.join(', ');
      return NextResponse.json(
        { success: false, error: `Không tìm thấy sheet "${SHEET_NAME}". Các sheet hiện có: ${sheets}` },
        { status: 422 }
      );
    }

    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

    const results: SalaryImportRow[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as unknown[];
      const rawId = row[COL_MA_NV];
      const id = normalizeEmployeeId(rawId);
      if (!id) continue;

      const ho_ten = String(row[COL_HO_TEN] ?? '').trim();
      if (!ho_ten || ho_ten === 'TỔNG' || ho_ten === 'Tổng') continue;

      const rawThucLinh = row[COL_THUC_LINH];
      const thuc_linh = typeof rawThucLinh === 'number' ? rawThucLinh : Number(rawThucLinh) || 0;

      results.push({ id_nhan_vien: id, ho_ten, thuc_linh, loai });
    }

    if (results.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Không đọc được dữ liệu nhân viên từ file. Kiểm tra cột B (Mã NV) và cột AM (Thực Lĩnh).' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: results,
      total: results.length,
      loai,
    });

  } catch (error: any) {
    console.error('[API payroll/import-excel] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi đọc file Excel' },
      { status: 500 }
    );
  }
}
