import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { saveTaiChinhHistory } from '@/lib/google-sheets';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toNum = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^0-9.-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const norm = (v: unknown) =>
  String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

function findSheet(wb: xlsx.WorkBook, ...keywords: string[]): xlsx.WorkSheet | null {
  for (const kw of keywords) {
    const name = wb.SheetNames.find(n => norm(n).includes(kw.toLowerCase()));
    if (name) return wb.Sheets[name];
  }
  return null;
}

/** Find first positive number after a keyword label, with configurable min */
function findByLabel(rows: unknown[][], keyword: string, min = 1000): number {
  const kw = keyword.toLowerCase();
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]).includes(kw)) {
        for (let dc = c + 1; dc < Math.min(c + 8, row.length); dc++) {
          const n = toNum(row[dc]);
          if (n > min) return n;
        }
      }
    }
  }
  return 0;
}

// ─── Scale detection for NS budget values ────────────────────────────────────
// Budget files often store DS in tỷ (e.g. 80 = 80 tỷ) or in VND (80,000,000,000)

function scaleMoney(rawVal: number, maxSample: number): number {
  if (rawVal <= 0) return 0;
  if (maxSample > 1e9) return rawVal;         // already VND
  if (maxSample > 1e4) return rawVal * 1e6;   // triệu → VND
  return rawVal * 1e9;                          // tỷ → VND
}

// ─── KQKD monthly parser ─────────────────────────────────────────────────────

function parseMonthly(rows: unknown[][]): Array<{ label: string; doanhSo: number; dtHH: number; soCan: number }> {
  let headerIdx = -1;
  let colSTT = 0, colThang = 2, colNam = 3, colGiaNY = 12, colDTHH = 17;

  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const row = rows[r];
    if (row.some(c => norm(c) === 'stt')) {
      headerIdx = r;
      row.forEach((c, i) => {
        const v = norm(c);
        if (v === 'stt') colSTT = i;
        if (v === 'tháng') colThang = i;
        if (v === 'năm' || v === 'năm ') colNam = i;
        if (v.includes('giá niêm yết') && v.includes('vat')) colGiaNY = i;
        if (v.includes('tổng phí hhmg') && v.includes('chưa vat')) colDTHH = i;
      });
      break;
    }
  }
  if (headerIdx === -1) return [];

  const map = new Map<string, { doanhSo: number; dtHH: number; soCan: number }>();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const stt = toNum(row[colSTT]);
    if (!stt || isNaN(stt) || stt < 1) continue;
    const thang = toNum(row[colThang]);
    const nam = toNum(row[colNam]);
    if (!thang || !nam) continue;
    const key = `${nam}-${String(thang).padStart(2, '0')}`;
    const ex = map.get(key) ?? { doanhSo: 0, dtHH: 0, soCan: 0 };
    map.set(key, {
      doanhSo: ex.doanhSo + toNum(row[colGiaNY]),
      dtHH: ex.dtHH + toNum(row[colDTHH]),
      soCan: ex.soCan + 1,
    });
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => {
      const [year, month] = key.split('-');
      return { label: `T${parseInt(month)}/${year.slice(2)}`, ...val };
    });
}

// ─── NS (budget) parser ───────────────────────────────────────────────────────

export interface NSTargets {
  filenameNS: string;
  annual: { doanhSo: number; soCan: number; dtMG: number };
  monthly: Array<{ label: string; doanhSo: number; soCan: number; dtMG: number }>;
}

/** Strategy A: rows are months, columns are metrics */
function tryRowPerMonth(rows: unknown[][], yearSuffix: string): NSTargets['monthly'] | null {
  let headerIdx = -1;
  let colThang = -1, colDS = -1, colCan = -1, colDT = -1;

  for (let r = 0; r < Math.min(25, rows.length); r++) {
    const row = rows[r];
    const thangIdx = row.findIndex(c => {
      const v = norm(c);
      return v === 'tháng' || v === 'month' || v === 'th' || v === 't.t' || v.match(/^th[áa]ng\s*$/);
    });
    if (thangIdx >= 0) {
      headerIdx = r;
      colThang = thangIdx;
      row.forEach((c, i) => {
        const v = norm(c);
        if (i === colThang) return;
        if ((v.includes('doanh số') || v === 'ds kh' || v === 'ds' || v.includes('gtrị hđ')) && colDS === -1) colDS = i;
        if ((v.includes('số căn') || v === 'căn' || v === 'số căn kh' || v === 'sl căn') && colCan === -1) colCan = i;
        if ((v.includes('doanh thu') || v.includes('phí dịch vụ') || v.includes('dt mg') || v === 'dt kh' || v === 'dt') && colDT === -1) colDT = i;
      });
      break;
    }
  }
  if (headerIdx === -1 || colThang === -1) return null;

  const rawDS: number[] = [], rawDT: number[] = [];
  const temp: Array<{ m: number; ds: number; can: number; dt: number }> = [];

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const thangStr = norm(row[colThang]);
    const mm = thangStr.match(/(\d{1,2})/);
    if (!mm) continue;
    const m = parseInt(mm[1]);
    if (m < 1 || m > 12) continue;

    const ds  = colDS  >= 0 ? toNum(row[colDS])  : 0;
    const can = colCan >= 0 ? toNum(row[colCan]) : 0;
    const dt  = colDT  >= 0 ? toNum(row[colDT])  : 0;

    if (ds  > 0) rawDS.push(ds);
    if (dt  > 0) rawDT.push(dt);
    temp.push({ m, ds, can, dt });
  }

  if (temp.length < 3) return null;

  const maxDS = Math.max(...rawDS, 0);
  const maxDT = Math.max(...rawDT, 0);

  return temp.map(({ m, ds, can, dt }) => ({
    label: `T${m}/${yearSuffix}`,
    doanhSo: scaleMoney(ds, maxDS),
    soCan: can,
    dtMG: scaleMoney(dt, maxDT),
  }));
}

/** Strategy B: columns are months (T1/T2/.../T12), rows are metrics */
function tryColPerMonth(rows: unknown[][], yearSuffix: string): NSTargets['monthly'] | null {
  let headerIdx = -1;
  const monthCols: Array<{ col: number; m: number }> = [];
  let rowDS = -1, rowCan = -1, rowDT = -1;

  // Find header row with T1/T2 or Tháng 1/Tháng 2 pattern
  for (let r = 0; r < Math.min(20, rows.length); r++) {
    const row = rows[r];
    const mCols: Array<{ col: number; m: number }> = [];
    row.forEach((c, i) => {
      const v = norm(c);
      const mm = v.match(/^(?:tháng\s*|t\.?)?(\d{1,2})(?:\/\d{2,4})?$/);
      if (mm) {
        const m = parseInt(mm[1]);
        if (m >= 1 && m <= 12) mCols.push({ col: i, m });
      }
    });
    if (mCols.length >= 6) {
      headerIdx = r;
      monthCols.push(...mCols);
      break;
    }
  }
  if (headerIdx === -1 || monthCols.length < 3) return null;

  // Find metric rows by scanning rows below header
  for (let r = headerIdx + 1; r < Math.min(headerIdx + 30, rows.length); r++) {
    const label = norm(rows[r][0]) || norm(rows[r][1]) || '';
    if ((label.includes('doanh số') || label.includes('ds kh') || label.includes('gtrị')) && rowDS === -1) rowDS = r;
    if ((label.includes('số căn') || label === 'căn' || label.includes('sl căn')) && rowCan === -1) rowCan = r;
    if ((label.includes('doanh thu') || label.includes('phí dịch vụ') || label.includes('dt mg')) && rowDT === -1) rowDT = r;
  }

  if (rowDS === -1 && rowDT === -1) return null;

  const rawDS = monthCols.map(({ col }) => rowDS >= 0 ? toNum(rows[rowDS][col]) : 0).filter(v => v > 0);
  const rawDT = monthCols.map(({ col }) => rowDT >= 0 ? toNum(rows[rowDT][col]) : 0).filter(v => v > 0);
  const maxDS = Math.max(...rawDS, 0);
  const maxDT = Math.max(...rawDT, 0);

  return monthCols.map(({ col, m }) => ({
    label: `T${m}/${yearSuffix}`,
    doanhSo: scaleMoney(rowDS >= 0 ? toNum(rows[rowDS][col]) : 0, maxDS),
    soCan:   rowCan >= 0 ? toNum(rows[rowCan][col]) : 0,
    dtMG:    scaleMoney(rowDT >= 0 ? toNum(rows[rowDT][col]) : 0, maxDT),
  }));
}

function parseNSTargets(wb: xlsx.WorkBook, filenameNS: string): NSTargets | null {
  // Try common NS sheet names
  const nsSheet =
    findSheet(wb, 'ns ', 'ngân sách', 'kế hoạch', 'budget', 'kh 2026', 'dự kiến', 'plan') ??
    // Fallback: any sheet that's not clearly a KQKD/detail sheet
    (() => {
      const skipPatterns = ['báo cáo', 'kqkd', 'kết quả', 'th dt', 'chi tiết', 'sheet'];
      const name = wb.SheetNames.find(n => !skipPatterns.some(p => norm(n).includes(p)));
      return name ? wb.Sheets[name] : null;
    })();

  if (!nsSheet) return null;

  const rows = xlsx.utils.sheet_to_json<unknown[]>(nsSheet, { header: 1, defval: '' }) as unknown[][];

  // Detect year from cell content (look for "2026" or "2025")
  let yearSuffix = '26';
  for (const row of rows.slice(0, 5)) {
    for (const cell of row) {
      const v = norm(cell);
      if (v.includes('2026')) { yearSuffix = '26'; break; }
      if (v.includes('2025')) { yearSuffix = '25'; break; }
    }
  }

  // Try monthly parsing strategies
  const monthly =
    tryRowPerMonth(rows, yearSuffix) ??
    tryColPerMonth(rows, yearSuffix) ??
    [];

  // Annual summary: prefer summing monthly, else look for label keywords
  let annual: NSTargets['annual'];
  if (monthly.length > 0) {
    annual = monthly.reduce(
      (a, m) => ({ doanhSo: a.doanhSo + m.doanhSo, soCan: a.soCan + m.soCan, dtMG: a.dtMG + m.dtMG }),
      { doanhSo: 0, soCan: 0, dtMG: 0 },
    );
  } else {
    // Fall back to keyword search for annual totals
    const rawDS  = findByLabel(rows, 'doanh số', 0) || findByLabel(rows, 'ds kh', 0);
    const rawCan = findByLabel(rows, 'số căn', 0);
    const rawDT  = findByLabel(rows, 'doanh thu', 0) || findByLabel(rows, 'dt kh', 0) || findByLabel(rows, 'phí dịch vụ', 0);
    const scaleDS = rawDS > 1e9 ? 1 : rawDS > 1e4 ? 1e6 : 1e9;
    const scaleDT = rawDT > 1e8 ? 1 : rawDT > 100 ? 1e6 : 1e9;
    annual = {
      doanhSo: rawDS * scaleDS,
      soCan: rawCan,
      dtMG: rawDT * scaleDT,
    };
  }

  // If still no meaningful data, return null
  if (annual.doanhSo === 0 && annual.soCan === 0 && annual.dtMG === 0) return null;

  return { filenameNS, annual, monthly };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file   = formData.get('file')   as File | null;
    const fileNS = formData.get('fileNS') as File | null;

    if (!file) return NextResponse.json({ error: 'Không có file KQKD' }, { status: 400 });

    // Parse KQKD
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = xlsx.read(buffer, { type: 'buffer' });

    const kqkdSheet = findSheet(wb, 'báo cáo', 'kqkd', 'kết quả');
    if (!kqkdSheet) {
      return NextResponse.json(
        { error: 'Không tìm thấy sheet "Báo cáo KQKD". Vui lòng upload đúng file KQ HĐKD.' },
        { status: 400 },
      );
    }
    const kqRows = xlsx.utils.sheet_to_json<unknown[]>(kqkdSheet, { header: 1, defval: '' }) as unknown[][];

    const pnl = {
      soCan:           findByLabel(kqRows, 'số căn'),
      doanhSo:         findByLabel(kqRows, 'doanh số bán hàng gồm vat'),
      dtMG:            findByLabel(kqRows, 'phí dvmg + thưởng nóng') || findByLabel(kqRows, 'doanh thu:'),
      hhSalesAll:      findByLabel(kqRows, 'hoa hồng môi giới all'),
      thuongNongSales: findByLabel(kqRows, 'thưởng nóng sales'),
      cpBanHang:       findByLabel(kqRows, 'chi phí bán hàng'),
      cpVanHanh:       findByLabel(kqRows, 'văn phòng, vận hành'),
      lnTruocThue:     findByLabel(kqRows, 'lợi nhận trước thuế') || findByLabel(kqRows, 'lợi nhuận trước thuế'),
    };

    const dthhSheet = findSheet(wb, 'th dt-hh', 'dt-hh');
    const monthly = dthhSheet
      ? parseMonthly(xlsx.utils.sheet_to_json<unknown[]>(dthhSheet, { header: 1, defval: '' }) as unknown[][])
      : [];

    const numMonths = monthly.length || 5;
    const first = monthly[0]?.label ?? '';
    const last  = monthly[monthly.length - 1]?.label ?? '';
    const period = first && last ? `${first}–${last}` : 'Lũy kế';

    // Parse NS budget file if provided
    let targets: NSTargets | undefined;
    if (fileNS) {
      const bufNS = Buffer.from(await fileNS.arrayBuffer());
      const wbNS  = xlsx.read(bufNS, { type: 'buffer' });
      targets = parseNSTargets(wbNS, fileNS.name) ?? undefined;
    }

    const result = { filename: file.name, period, numMonths, pnl, monthly, targets };

    // Save to Google Sheets history
    const B = 1e9;
    const hhPct = pnl.dtMG > 0 ? (pnl.hhSalesAll / pnl.dtMG) * 100 : 0;
    const lnPct = pnl.dtMG > 0 ? (pnl.lnTruocThue / pnl.dtMG) * 100 : 0;
    const id    = `${Date.now()}`;
    saveTaiChinhHistory({
      id,
      ngay_upload:  new Date().toISOString(),
      ky_bao_cao:   period,
      ten_file:     file.name,
      so_can:       pnl.soCan,
      doanh_so_ty:  Math.round(pnl.doanhSo / B * 100) / 100,
      dt_mg_ty:     Math.round(pnl.dtMG / B * 1000) / 1000,
      hh_sales_pct: Math.round(hhPct * 10) / 10,
      ln_ty:        Math.round(pnl.lnTruocThue / B * 1000) / 1000,
      ln_pct:       Math.round(lnPct * 10) / 10,
      data_json:    JSON.stringify({ ...result, id }),
    }).catch(e => console.error('[TaiChinh] History save failed:', e));

    return NextResponse.json({ ...result, id });
  } catch (err) {
    console.error('Upload parse error:', err);
    return NextResponse.json({ error: 'Lỗi đọc file. Kiểm tra đúng file KQ HĐKD.' }, { status: 500 });
  }
}
