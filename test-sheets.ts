import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkSheets() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!clientEmail || !privateKey || !sheetId) {
    console.error('Missing env vars');
    return;
  }

  try {
    const jwt = new JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, jwt);
    await doc.loadInfo();
    console.log('Available sheets:');
    Object.keys(doc.sheetsByTitle).forEach(title => {
      console.log(`- ${title}`);
    });
  } catch (err) {
    console.error('Error fetching sheets:', err);
  }
}

checkSheets();
