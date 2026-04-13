export const runtime = 'nodejs';

import { google } from 'googleapis';
import { Readable } from 'stream';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return Response.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ✅ Validate environment variables
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!clientEmail || !privateKey) {
      console.error('[UploadAvatar] Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY');
      return Response.json({ error: 'Server configuration error: missing Google credentials' }, { status: 500 });
    }

    if (!folderId) {
      console.error('[UploadAvatar] Missing GOOGLE_DRIVE_FOLDER_ID');
      return Response.json({ error: 'Server configuration error: missing Drive folder ID' }, { status: 500 });
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // ✅ Convert buffer → stream
    const stream = Readable.from(buffer);

    // Upload file
    const res = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [folderId],
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
    });

    const fileId = res.data.id;

    if (!fileId) {
      console.error('[UploadAvatar] Google Drive returned no file ID');
      return Response.json({ error: 'Upload failed: no file ID returned' }, { status: 500 });
    }

    // Set public permission
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    const url = `https://drive.google.com/uc?id=${fileId}`;

    return Response.json({ url });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[UploadAvatar] Upload error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}