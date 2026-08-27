// Generic key/value settings store — SETTINGS sheet tab (Google Sheets), tái
// dùng đúng cơ chế đã có trong /api/settings/logo (trước đây định nghĩa
// getJWT/getSettingsSheet riêng, trùng lặp). Đây là điểm dùng chung duy nhất
// cho mọi settings runtime nhỏ (key/value) — không phát minh feature-flag
// system mới, không thêm bảng Postgres cho một giá trị đơn lẻ.
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SETTINGS_SHEET = 'SETTINGS';

function getJWT(): JWT {
  const email = process.env.GOOGLE_CLIENT_EMAIL!;
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? '').trim().replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');
  return new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

export async function getSettingsSheet() {
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!, getJWT());
  await doc.loadInfo();

  let sheet = doc.sheetsByTitle[SETTINGS_SHEET];
  if (!sheet) {
    // Tạo sheet SETTINGS nếu chưa có
    sheet = await doc.addSheet({ title: SETTINGS_SHEET, headerValues: ['key', 'value'] });
  }
  await sheet.loadHeaderRow();
  return sheet;
}

export async function getSettingValue(key: string): Promise<string | null> {
  const sheet = await getSettingsSheet();
  const rows = await sheet.getRows();
  const row = rows.find(r => r.get('key') === key);
  return row ? (row.get('value') as string | null) : null;
}

export async function setSettingValue(key: string, value: string): Promise<void> {
  const sheet = await getSettingsSheet();
  const rows = await sheet.getRows();
  const existing = rows.find(r => r.get('key') === key);
  if (existing) {
    existing.set('value', value);
    await existing.save();
  } else {
    await sheet.addRow({ key, value });
  }
}
