import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv(resolve(process.cwd(), '.env.local'));
const jwt = new JWT({
  email: env.GOOGLE_CLIENT_EMAIL,
  key: (env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(env.GOOGLE_SHEET_ID, jwt);
await doc.loadInfo();
const sheet = doc.sheetsByTitle['NHAN_VIEN'];
await sheet.loadHeaderRow();
const rows = await sheet.getRows();
const h = sheet.headerValues;

let withId = 0, withoutId = 0, empty = 0;
for (const row of rows) {
  const v = row.toObject();
  const id = (v[h[0]] || '').toString().trim();
  const name = (v[h[1]] || '').toString().trim();
  if (!name) { empty++; continue; }
  if (id) { withId++; } else { withoutId++; console.log(`  ❌ Missing ID: "${name}"`); }
}

console.log(`\n📊 Results: ${withId} with ID, ${withoutId} missing ID, ${empty} empty rows`);
console.log(withoutId === 0 ? '✅ All employees have IDs!' : `⚠️ ${withoutId} employees still need IDs`);
