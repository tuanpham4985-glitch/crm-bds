/**
 * POST /api/attendance/import-excel
 *
 * Nhận file .xlsx bảng chấm công (format BCC), parse và lưu vào ATTENDANCE_RAW.
 *
 * Multipart form-data:
 *   file      — file .xlsx
 *   thang     — số tháng (1–12)
 *   nam       — năm (vd: 2026)
 *   overwrite — "true" | "false" (mặc định true)
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { saveAttendanceBatch } from '@/lib/google-sheets';
import type { AttendanceRaw, AttendanceStatus } from '@/lib/types';

// ================================================================
// Utilities
// ================================================================

/**
 * Convert xlsx Date object → 'YYYY-MM-DD'.
 * xlsx với cellDates:true tạo Date ở UTC midnight nhưng trong UTC+7
 * sẽ bị lùi về ngày trước (~17:00 của ngày N = 00:00 của ngày N+1 local).
 * Fix: cộng thêm 12h rồi lấy UTC date để round về ngày đúng.
 */
function xlsxDateToStr(raw: unknown): string | null {
  if (raw instanceof Date) {
    const adjusted = new Date(raw.getTime() + 12 * 60 * 60 * 1000); // +12h để round
    const y = adjusted.getUTCFullYear();
    const m = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(adjusted.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof raw === 'number' && raw > 40000) {
    // Excel date serial
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (typeof raw === 'string') {
    const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

function normalizeId(rawId: unknown): string {
  const s = String(rawId ?? '').trim();
  if (!s || s === '0') return '';
  if (/^\d+$/.test(s)) return s.padStart(4, '0'); // Số thuần → zero-pad 4 chữ số
  return s; // Đã có chữ cái → giữ nguyên
}

function normalizeStatus(raw: unknown): AttendanceStatus {
  const s = String(raw ?? '').trim();
  const map: Record<string, AttendanceStatus> = {
    'x': 'x',   'X': 'x',
    'x/2': 'x/2', 'X/2': 'x/2',
    'n': 'N',   'N': 'N',
    'n/2': 'N/2', 'N/2': 'N/2',
    'p': 'P',   'P': 'P',
    'p/2': 'P/2', 'P/2': 'P/2',
    'cđ': 'CĐ', 'CĐ': 'CĐ', 'cd': 'CĐ', 'CD': 'CĐ',
    'l': 'L',   'L': 'L',
    'wfh': 'WFH', 'WFH': 'WFH', 'Wfh': 'WFH',
    '0': '0',
  };
  return map[s] ?? '';
}

function toNum(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return isNaN(n) ? undefined : n;
}

// ================================================================
// Auto-detect header row
// ================================================================

/**
 * Tìm dòng header (chứa ngày tháng) trong sheet.
 * Trả về { headerRowIdx, dataStartIdx, dateCols }
 * Duyệt tối đa 15 dòng đầu, tìm dòng đầu tiên có Date object ở cột >= 4.
 */
function detectSheetLayout(data: unknown[][]): {
  headerRowIdx: number;
  dataStartIdx: number;
  dateCols: { col: number; dateStr: string }[];
  colLate: number;
  colMissed: number;
} | null {
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const row = data[r] as unknown[];
    const dateCols: { col: number; dateStr: string }[] = [];

    for (let c = 4; c < row.length; c++) {
      const ds = xlsxDateToStr(row[c]);
      if (ds) dateCols.push({ col: c, dateStr: ds });
    }

    if (dateCols.length >= 20) {
      // Tìm cột summary ở cuối (sau dateCols cuối)
      const lastDateCol = dateCols[dateCols.length - 1].col;
      let colLate = -1, colMissed = -1;
      for (let c = lastDateCol + 1; c < row.length; c++) {
        const h = String(row[c] ?? '').toLowerCase();
        if (h.includes('phút đi muộn') || h.includes('phút đi muộn')) colLate = c;
        if (h.includes('quên chấm') || h.includes('quen cham'))            colMissed = c;
      }
      // dataStartIdx = bỏ qua thêm 2 dòng subheader + blank (tối đa)
      return {
        headerRowIdx: r,
        dataStartIdx: r + 2,
        dateCols,
        colLate,
        colMissed,
      };
    }
  }
  return null;
}

// ================================================================
// Parse sheet chấm công
// ================================================================

interface ParsedEmp {
  id_nhan_vien: string;
  ho_ten: string;
  byDate: Record<string, AttendanceStatus>;
  lateMinutes?: number;
  missedCheckinMinutes?: number;
}

function parseChamCongSheet(ws: XLSX.WorkSheet, thang: number, nam: number): ParsedEmp[] {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  const layout = detectSheetLayout(data);
  if (!layout) return [];

  const { dataStartIdx, dateCols, colLate, colMissed } = layout;

  // Lọc chỉ lấy ngày thuộc tháng/năm cần import
  const targetDateCols = dateCols.filter(dc => {
    const d = new Date(dc.dateStr);
    return (d.getMonth() + 1) === thang && d.getFullYear() === nam;
  });

  const results: ParsedEmp[] = [];

  for (let r = dataStartIdx; r < data.length; r++) {
    const row = data[r] as unknown[];
    const id = normalizeId(row[1]);
    if (!id) continue;
    const ho_ten = String(row[2] ?? '').trim();
    if (!ho_ten) continue;

    const byDate: Record<string, AttendanceStatus> = {};
    for (const { col, dateStr } of targetDateCols) {
      byDate[dateStr] = normalizeStatus(row[col]);
    }

    results.push({
      id_nhan_vien: id,
      ho_ten,
      byDate,
      lateMinutes:          toNum(colLate   >= 0 ? row[colLate]   : undefined),
      missedCheckinMinutes: toNum(colMissed >= 0 ? row[colMissed] : undefined),
    });
  }

  return results;
}

// ================================================================
// Parse sheet BCC OT
// ================================================================

function parseOTSheet(ws: XLSX.WorkSheet, thang: number, nam: number): Record<string, Record<string, number>> {
  // result: { id_nhan_vien → { dateStr → otHours } }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  const layout = detectSheetLayout(data);
  if (!layout) return {};

  const { dataStartIdx, dateCols } = layout;

  const targetDateCols = dateCols.filter(dc => {
    const d = new Date(dc.dateStr);
    return (d.getMonth() + 1) === thang && d.getFullYear() === nam;
  });

  const result: Record<string, Record<string, number>> = {};

  for (let r = dataStartIdx; r < data.length; r++) {
    const row = data[r] as unknown[];
    const id = normalizeId(row[1]);
    if (!id) continue;

    result[id] = result[id] || {};
    for (const { col, dateStr } of targetDateCols) {
      const h = toNum(row[col]);
      if (h && h > 0) result[id][dateStr] = h;
    }
  }

  return result;
}

// ================================================================
// Route handler
// ================================================================

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'Thiếu file Excel' }, { status: 400 });
    }

    const thang = Number(formData.get('thang'));
    const nam   = Number(formData.get('nam'));
    if (!thang || !nam || thang < 1 || thang > 12) {
      return NextResponse.json({ success: false, error: 'Tháng/Năm không hợp lệ' }, { status: 400 });
    }
    const overwrite = formData.get('overwrite') !== 'false';

    // Đọc buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    // Lấy sheet Cham cong
    const wsChamCong = wb.Sheets['Cham cong'];
    if (!wsChamCong) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy sheet "Cham cong". Các sheet: ${wb.SheetNames.join(', ')}` },
        { status: 422 }
      );
    }

    const chamCongRows = parseChamCongSheet(wsChamCong, thang, nam);
    if (chamCongRows.length === 0) {
      return NextResponse.json(
        { success: false, error: `Không đọc được dữ liệu tháng ${thang}/${nam} từ sheet Cham cong` },
        { status: 422 }
      );
    }

    // Parse OT (tùy chọn)
    const otMap = wb.Sheets['BCC OT']
      ? parseOTSheet(wb.Sheets['BCC OT'], thang, nam)
      : {};

    // Chuyển thành records cho ATTENDANCE_RAW
    const records: Omit<AttendanceRaw, 'id'>[] = [];

    for (const emp of chamCongRows) {
      const empOT = otMap[emp.id_nhan_vien] ?? {};

      for (const [dateStr, status] of Object.entries(emp.byDate)) {
        records.push({
          id_nhan_vien:  emp.id_nhan_vien,
          date:          dateStr,
          status,
          ot_hours:      empOT[dateStr] ?? undefined,
          // late/missed được lưu tổng theo tháng → gán vào ngày 01 của tháng
          // (các ngày khác không set để không bị ghi đè 0)
          late_minutes:           dateStr.endsWith('-01') ? emp.lateMinutes   : undefined,
          missed_checkin_minutes: dateStr.endsWith('-01') ? emp.missedCheckinMinutes : undefined,
        });
      }
    }

    if (records.length === 0) {
      return NextResponse.json(
        { success: false, error: `Không có dữ liệu tháng ${thang}/${nam} trong file` },
        { status: 422 }
      );
    }

    // Lưu Google Sheets
    const result = await saveAttendanceBatch(records, overwrite);

    return NextResponse.json({
      success: true,
      message: `Import thành công ${chamCongRows.length} nhân viên, tháng ${thang}/${nam}`,
      employees: chamCongRows.length,
      records_processed: records.length,
      saved:   result.saved,
      skipped: result.skipped,
      errors:  result.errors.length > 0 ? result.errors : undefined,
    });

  } catch (error: any) {
    console.error('[API attendance/import-excel] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi import file chấm công' },
      { status: 500 }
    );
  }
}
