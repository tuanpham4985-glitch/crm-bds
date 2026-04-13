// Repair Google Sheet: fix DASHBOARD #REF! + restore dropdowns
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';

const CRED_PATH = 'D:\\Work\\CRM_Mini\\crm-mini-492604-f45461c93f8f.json';
const SHEET_ID = '1S5VUfqtZ_nPeSHP85CLm8ojhhJh6-GGHxGwzbIlb3QI';

async function batchUpdate(requests, jwt) {
  const { token } = await jwt.getAccessToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    }
  );
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fixDashboard(doc, jwt) {
  console.log('\n🔧 Fixing DASHBOARD formulas...');
  const sheet = doc.sheetsByTitle['DASHBOARD'];
  if (!sheet) { console.log('   ⚠️  No DASHBOARD sheet'); return; }

  await sheet.loadCells('A1:Z100');

  const requests = [];
  for (let r = 0; r < 100; r++) {
    for (let c = 0; c < 26; c++) {
      const cell = sheet.getCell(r, c);
      if (cell.formula) {
        requests.push({
          updateCells: {
            range: { sheetId: sheet.sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: c, endColumnIndex: c + 1 },
            rows: [{ values: [{ userEnteredValue: { formulaValue: cell.formula } }] }],
            fields: 'userEnteredValue',
          },
        });
      }
    }
  }

  if (requests.length === 0) { console.log('   ℹ️  No formulas found'); return; }
  await batchUpdate(requests, jwt);
  console.log(`   ✅ Re-saved ${requests.length} formula cells`);
}

async function addValidations(doc, jwt) {
  console.log('\n📋 Restoring dropdown validations...');

  const id = (name) => doc.sheetsByTitle[name]?.sheetId;
  const KH = id('KHACH_HANG'), PL = id('PIPELINE'), CV = id('CONG_VIEC');

  if (KH == null || PL == null || CV == null) {
    console.log('   ⚠️  Missing required sheets'); return;
  }

  function rule(sheetId, col, rangeFormula) {
    return {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: col, endRowIndex: 1000, endColumnIndex: col + 1 },
        rule: {
          condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: rangeFormula }] },
          strict: false, showCustomUi: true,
        },
      },
    };
  }

  const requests = [
    // KHACH_HANG: nguon (F=5), sale_phu_trach (I=8)
    rule(KH, 5, '=DANH_MUC!$D$2:$D$100'),
    rule(KH, 8, '=NHAN_VIEN!$B$2:$B$100'),
    // PIPELINE: giai_doan (C=2), sale_phu_trach (E=4), ten_du_an (G=6)
    rule(PL, 2, '=DANH_MUC!$A$2:$A$100'),
    rule(PL, 4, '=NHAN_VIEN!$B$2:$B$100'),
    rule(PL, 6, '=DU_AN!$C$2:$C$100'),
    // CONG_VIEC: trang_thai (E=4), sale_phu_trach (G=6)
    rule(CV, 4, '=DANH_MUC!$C$2:$C$100'),
    rule(CV, 6, '=NHAN_VIEN!$B$2:$B$100'),
  ];

  await batchUpdate(requests, jwt);
  console.log(`   ✅ Applied ${requests.length} dropdown rules:`);
  console.log('      • KHACH_HANG: nguon, sale_phu_trach');
  console.log('      • PIPELINE: giai_doan, sale_phu_trach, ten_du_an');
  console.log('      • CONG_VIEC: trang_thai, sale_phu_trach');
}

async function main() {
  console.log('🛠️  Repairing Google Sheet...');
  const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf-8'));
  const jwt = new JWT({
    email: creds.client_email, key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(SHEET_ID, jwt);
  await doc.loadInfo();
  console.log(`✅ Connected: "${doc.title}"`);

  await fixDashboard(doc, jwt);
  await addValidations(doc, jwt);

  console.log('\n🎉 Repair complete!');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
