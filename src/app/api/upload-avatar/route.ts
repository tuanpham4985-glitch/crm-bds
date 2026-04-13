export const runtime = 'nodejs';

import { google } from 'googleapis';
import { Readable } from 'stream';
import { readFileSync } from 'fs';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return Response.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ✅ Đọc credentials từ file JSON (ổn định nhất)
    const creds = JSON.parse(
      readFileSync(process.env.GOOGLE_CREDENTIALS_PATH!, 'utf-8')
    );

    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // ✅ Convert buffer → stream
    const stream = Readable.from(buffer);

    // Upload file
    const res = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!],
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
    });

    const fileId = res.data.id;

    // Set public permission
    await drive.permissions.create({
      fileId: fileId!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    const url = `https://drive.google.com/uc?id=${fileId}`;

    return Response.json({ url });

  } catch (err: any) {
    console.error('UPLOAD ERROR:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}