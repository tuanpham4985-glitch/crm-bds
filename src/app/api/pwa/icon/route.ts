import { NextResponse } from 'next/server';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs/promises';
import path from 'path';

let _cache: { data: string | null; ts: number } | null = null;
const TTL = 5 * 60_000;

function getJWT() {
  const email = process.env.GOOGLE_CLIENT_EMAIL!;
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? '').trim().replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');
  return new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

async function getLogoDataUrl(): Promise<string | null> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.data;

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!, getJWT());
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['SETTINGS'];
  if (!sheet) { _cache = { data: null, ts: Date.now() }; return null; }
  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();
  const row = rows.find(r => r.get('key') === 'company_logo');
  const logo = row ? (row.get('value') as string | null) : null;

  _cache = { data: logo, ts: Date.now() };
  return logo;
}

export async function GET() {
  try {
    const dataUrl = await getLogoDataUrl();

    if (dataUrl) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const [, mimeType, base64Data] = match;
        const buffer = Buffer.from(base64Data, 'base64');
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          },
        });
      }
    }

    // Fallback: serve static placeholder icon
    const staticIcon = await fs.readFile(path.join(process.cwd(), 'public', 'icon-512.png'));
    return new NextResponse(staticIcon, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch (err) {
    console.error('[pwa/icon]', err);
    const staticIcon = await fs.readFile(path.join(process.cwd(), 'public', 'icon-512.png'));
    return new NextResponse(staticIcon, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
    });
  }
}
