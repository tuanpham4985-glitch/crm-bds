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

export const maxDuration = 30;

export interface SalaryImportRow {
  id_nhan_vien: string;
  ho_ten: string;
  thuc_linh: number;
  loai: 'KD' | 'BO';
}

const COL_MA_NV   = 1;  // Cột B (0-indexed)
const COL_HO_TEN  = 2;  // Cột C
const COL_KD      = 38; // Cột AM  — Thực Lĩnh (KD)
const COL_BO      = 62; // Cột BK  — Lương Thực lĩnh (BO)

function findBangLuongSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  // Ưu tiên match chính xác
  if (wb.Sheets['BẢNG LƯƠNG']) return wb.Sheets['BẢNG LƯƠNG'];
  // Fallback: tìm sheet tên có "lương" hoặc "luong" (không phân biệt hoa thường / dấu)
  const name = wb.SheetNames.find(n => {
    const lower = n.toLowerCase();
    return lower.includes('lương') || lower.includes('luong') || lower.includes('bang luong');
  });
  return name ? wb.Sheets[name] : null;
}

function normalizeEmployeeId(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '0') return '';
  if (/^VIC-/i.test(s)) return '';  // dòng tiêu đề nhóm
  if (/^\d+$/.test(s)) return s.padStart(4, '0');
  return s;
}

export async function POST(request: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: 'Không đọc được form data: ' + (e?.message ?? e) },
        { status: 400 }
      );
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'Thiếu file Excel' }, { status: 400 });
    }

    const loaiRaw = (formData.get('loai') as string || '').toUpperCase();
    const loai: 'KD' | 'BO' = (loaiRaw === 'KD' || loaiRaw === 'BO') ? loaiRaw : 'KD';

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: 'Không đọc được nội dung file: ' + (e?.message ?? e) },
        { status: 400 }
      );
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: 'File không phải định dạng Excel hợp lệ (.xlsx/.xls): ' + (e?.message ?? e) },
        { status: 422 }
      );
    }

    const ws = findBangLuongSheet(wb);
    if (!ws) {
      return NextResponse.json(
        {
          success: false,
          error: `Không tìm thấy sheet "BẢNG LƯƠNG". Các sheet trong file: ${wb.SheetNames.join(', ')}`,
        },
        { status: 422 }
      );
    }

    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
    const results: SalaryImportRow[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as unknown[];
      const id = normalizeEmployeeId(row[COL_MA_NV]);
      if (!id) continue;

      const ho_ten = String(row[COL_HO_TEN] ?? '').trim();
      if (!ho_ten || /^tổng$/i.test(ho_ten)) continue;

      const col = loai === 'BO' ? COL_BO : COL_KD;
      const raw = row[col];
      const thuc_linh = typeof raw === 'number' ? raw : (Number(raw) || 0);

      results.push({ id_nhan_vien: id, ho_ten, thuc_linh, loai });
    }

    if (results.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Không đọc được dữ liệu từ file (loai=${loai}). Kiểm tra: cột B = Mã NV, cột C = Họ tên, cột AM = Thực Lĩnh.`,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true, data: results, total: results.length, loai });

  } catch (error: any) {
    console.error('[API payroll/import-excel] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi server: ' + (error?.message ?? String(error)) },
      { status: 500 }
    );
  }
}
