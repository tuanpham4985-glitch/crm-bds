/**
 * One-time script to backfill missing id_nhan_vien in Google Sheets.
 * Run with: node scripts/backfill-nhan-vien-ids.mjs
 */
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Parse .env.local manually (no dotenv dependency needed)
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
    // Remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const envPath = resolve(process.cwd(), '.env.local');
const env = loadEnv(envPath);

const clientEmail = env.GOOGLE_CLIENT_EMAIL;
const privateKey = (env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const sheetId = env.GOOGLE_SHEET_ID;

if (!clientEmail || !privateKey || !sheetId) {
  console.error('❌ Missing env vars in .env.local');
  process.exit(1);
}

const jwt = new JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function main() {
  console.log('🔗 Connecting to Google Sheets...');
  const doc = new GoogleSpreadsheet(sheetId, jwt);
  await doc.loadInfo();
  console.log(`📄 Spreadsheet: "${doc.title}"`);

  const sheet = doc.sheetsByTitle['NHAN_VIEN'];
  if (!sheet) {
    console.error('❌ Sheet "NHAN_VIEN" not found. Available:', Object.keys(doc.sheetsByTitle).join(', '));
    process.exit(1);
  }

  await sheet.loadHeaderRow();
  const h = sheet.headerValues;
  console.log(`📋 Headers: [${h.join(', ')}]`);

  const rows = await sheet.getRows();
  console.log(`📊 Total rows: ${rows.length}\n`);

  let fixed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const v = rows[i].toObject();
    const id = (v[h[0]] || '').toString().trim();
    const hoTen = (v[h[1]] || '').toString().trim();

    if (id) {
      console.log(`  ✅ Row ${i + 2}: "${hoTen}" → ${id}`);
      skipped++;
      continue;
    }

    if (!hoTen) {
      console.log(`  ⏩ Row ${i + 2}: Empty row, skipping`);
      continue;
    }

    // Generate unique ID
    const newId = `NV${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    rows[i].set(h[0], newId);
    await rows[i].save();
    fixed++;
    console.log(`  🔧 Row ${i + 2}: "${hoTen}" → ${newId} (FIXED)`);

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 150));
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Done! Fixed: ${fixed}, Already OK: ${skipped}, Total: ${rows.length}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
