// ============================================================
// Migrate data from Excel (CRM_BDS.xlsx) → Google Sheets
// Usage: node scripts/migrate-to-gsheets.mjs
// ============================================================

import ExcelJS from 'exceljs';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config ----
const EXCEL_PATH = path.join(__dirname, '..', 'data', 'CRM_BDS.xlsx');
const CRED_PATH = 'D:\\Work\\CRM_Mini\\crm-mini-492604-f45461c93f8f.json';
const SHEET_ID = '1S5VUfqtZ_nPeSHP85CLm8ojhhJh6-GGHxGwzbIlb3QI';

const SHEET_DEFS = {
  DANH_MUC: {
    headers: ['giai_doan_pipeline', 'trang_thai_kh', 'trang_thai_cong_viec', 'nguon'],
    colCount: 4,
  },
  DU_AN: {
    headers: ['id_du_an', 'ma_du_an', 'ten_du_an', 'hien_thi', 'hoa_hong_mac_dinh', 'label'],
    colCount: 6,
  },
  NHAN_VIEN: {
    headers: ['id_nhan_vien', 'ho_ten', 'so_dien_thoai', 'email', 'vai_tro', 'trang_thai', 'ngay_tao'],
    colCount: 7,
  },
  KHACH_HANG: {
    headers: ['id_khach_hang', 'ngay_tao', 'ten_KH', 'so_dien_thoai', 'email', 'nguon', 'nhu_cau', 'ghi_chu', 'sale_phu_trach', 'label_khach'],
    colCount: 10,
  },
  PIPELINE: {
    headers: ['id_pipeline', 'id_khach_hang', 'giai_doan', 'gia_tri_thuc_te', 'sale_phu_trach', 'id_du_an', 'ten_du_an', 'hoa_hong', 'tien_hoa_hong', 'ngay_cap_nhat', 'thang'],
    colCount: 11,
  },
  CONG_VIEC: {
    headers: ['id_cong_viec', 'ngay_tao', 'ghi_chu', 'id_pipeline', 'trang_thai', 'ngay_hen', 'sale_phu_trach', 'ket_qua'],
    colCount: 8,
  },
  LOG_HE_THONG: {
    headers: ['thoi_gian', 'hanh_dong', 'doi_tuong', 'id_lien_quan', 'nguoi_thuc_hien', 'ngay_tao'],
    colCount: 6,
  },
};

function cellStr(row, col) {
  const cell = row.getCell(col);
  if (cell.value === null || cell.value === undefined) return '';
  if (cell.value instanceof Date) {
    return isNaN(cell.value.getTime()) ? '' : cell.value.toISOString();
  }
  if (typeof cell.value === 'object' && 'result' in cell.value) {
    const result = cell.value.result;
    if (result === null || result === undefined) return '';
    if (result instanceof Date) return isNaN(result.getTime()) ? '' : result.toISOString();
    const str = String(result);
    if (str === '[object Object]' || str === 'Invalid Date') return '';
    return str;
  }
  const str = String(cell.value);
  if (str === '[object Object]' || str === 'Invalid Date') return '';
  return str;
}

async function clearAndWriteSheet(doc, sheetName, def, rows) {
  let gSheet = doc.sheetsByTitle[sheetName];

  if (gSheet) {
    // Clear values only — preserves data validation, formatting, dropdowns!
    console.log(`   ♻️  Clearing data in "${sheetName}" (preserving formatting)...`);
    await gSheet.clear();
    await gSheet.setHeaderRow(def.headers);
  } else {
    console.log(`   🆕 Creating sheet "${sheetName}"...`);
    gSheet = await doc.addSheet({ title: sheetName, headerValues: def.headers });
  }

  if (rows.length === 0) {
    console.log(`   ℹ️  No data rows to write`);
    return;
  }

  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await gSheet.addRows(batch);
    process.stdout.write(`\r   ✍️  Written ${Math.min(i + BATCH, rows.length)} / ${rows.length} rows`);
  }
  console.log();
}

async function main() {
  console.log('🚀 Starting migration: Excel → Google Sheets');
  console.log('─'.repeat(50));

  // 1. Load Excel
  console.log('📂 Loading Excel file...');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  console.log(`   ✅ Loaded ${wb.worksheets.length} worksheets from Excel`);

  // 2. Connect to Google Sheets
  console.log('🔗 Connecting to Google Sheets...');
  const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf-8'));
  const jwt = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(SHEET_ID, jwt);
  await doc.loadInfo();
  console.log(`   ✅ Connected to: "${doc.title}"`);

  // 3. Process each sheet
  for (const [sheetName, def] of Object.entries(SHEET_DEFS)) {
    console.log(`\n📋 Sheet: ${sheetName}`);

    const excelWs = wb.getWorksheet(sheetName);
    if (!excelWs) {
      console.log(`   ⚠️  Not found in Excel, skipping`);
      continue;
    }

    // Collect rows from Excel (skip header row 1)
    const rows = [];
    excelWs.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowData = {};
      let hasData = false;
      for (let c = 1; c <= def.colCount; c++) {
        const val = cellStr(row, c);
        rowData[def.headers[c - 1]] = val;
        if (val) hasData = true;
      }
      if (hasData) rows.push(rowData);
    });

    console.log(`   📊 ${rows.length} data rows read from Excel`);
    await clearAndWriteSheet(doc, sheetName, def, rows);
    console.log(`   ✅ Done`);
  }

  console.log('\n' + '─'.repeat(50));
  console.log('🎉 Migration complete!');
  console.log(`   Google Sheet: https://docs.google.com/spreadsheets/d/${SHEET_ID}`);
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err.message || err);
  process.exit(1);
});
