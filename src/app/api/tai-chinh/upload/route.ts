import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { saveTaiChinhHistory } from '@/lib/google-sheets';

const toNum = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^0-9.-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const norm = (v: unknown) =>
  String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

function findByLabel(rows: unknown[][], keyword: string): number {
  const kw = keyword.toLowerCase();
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]).includes(kw)) {
        for (let dc = c + 1; dc < Math.min(c + 7, row.length); dc++) {
          const n = toNum(row[dc]);
          if (n > 1000) return n;
        }
      }
    }
  }
  return 0;
}

function findSheet(wb: xlsx.WorkBook, ...keywords: string[]): xlsx.WorkSheet | null {
  for (const kw of keywords) {
    const name = wb.SheetNames.find(n => norm(n).includes(kw.toLowerCase()));
    if (name) return wb.Sheets[name];
  }
  return null;
}

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Không có file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = xlsx.read(buffer, { type: 'buffer' });

    const kqkdSheet = findSheet(wb, 'báo cáo', 'kqkd', 'kết quả');
    if (!kqkdSheet) {
      return NextResponse.json(
        { error: 'Không tìm thấy sheet "Báo cáo KQKD". Vui lòng upload file KQ HĐKD.' },
        { status: 400 },
      );
    }
    const kqRows = xlsx.utils.sheet_to_json<unknown[]>(kqkdSheet, { header: 1, defval: '' }) as unknown[][];

    const pnl = {
      soCan:            findByLabel(kqRows, 'số căn'),
      doanhSo:          findByLabel(kqRows, 'doanh số bán hàng gồm vat'),
      dtMG:             findByLabel(kqRows, 'phí dvmg + thưởng nóng') || findByLabel(kqRows, 'doanh thu:'),
      hhSalesAll:       findByLabel(kqRows, 'hoa hồng môi giới all'),
      thuongNongSales:  findByLabel(kqRows, 'thưởng nóng sales'),
      cpBanHang:        findByLabel(kqRows, 'chi phí bán hàng'),
      cpVanHanh:        findByLabel(kqRows, 'văn phòng, vận hành'),
      lnTruocThue:      findByLabel(kqRows, 'lợi nhận trước thuế') || findByLabel(kqRows, 'lợi nhuận trước thuế'),
    };

    const dthhSheet = findSheet(wb, 'th dt-hh', 'dt-hh');
    const monthly = dthhSheet
      ? parseMonthly(xlsx.utils.sheet_to_json<unknown[]>(dthhSheet, { header: 1, defval: '' }) as unknown[][])
      : [];

    const t1to5 = monthly.filter(m => !m.label.includes('12/'));
    const numMonths = t1to5.length || monthly.length || 5;

    const first = monthly[0]?.label ?? '';
    const last  = monthly[monthly.length - 1]?.label ?? '';
    const period = first && last ? `${first}–${last}` : 'Lũy kế';

    const result = { filename: file.name, period, numMonths, pnl, monthly };

    // Save to Google Sheets history (fire-and-forget — don't block response)
    const B = 1e9;
    const hhPct  = pnl.dtMG > 0 ? (pnl.hhSalesAll / pnl.dtMG) * 100 : 0;
    const lnPct  = pnl.dtMG > 0 ? (pnl.lnTruocThue / pnl.dtMG) * 100 : 0;
    const id     = `${Date.now()}`;
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
