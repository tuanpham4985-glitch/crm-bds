export const runtime = 'nodejs';

// Max file size: ~36KB (base64 string must be < 50,000 chars for Google Sheets limit)
const MAX_FILE_SIZE = 36 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Target avatar dimensions for resizing
const TARGET_SIZE = 200; // 200x200 pixels max

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return Response.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json(
        { error: `Định dạng không hỗ trợ. Chấp nhận: JPG, PNG, WebP` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: 'Ảnh quá lớn (vượt quá giới hạn Google Sheets).' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Convert to base64 data URL
    // This is stored directly in Google Sheets - no Google Drive needed
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    console.log(`[UploadAvatar] Converted "${file.name}" (${file.size} bytes) to base64 data URL (${dataUrl.length} chars)`);

    return Response.json({ url: dataUrl });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[UploadAvatar] Upload error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}