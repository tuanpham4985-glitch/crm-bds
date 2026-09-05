import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireTmbAdmin } from '@/lib/tmb-admin-guard';

/** POST /api/stacking/tmb-profiles/upload-url — admin-only. Cấp CLIENT TOKEN
 * (không phải file) để browser upload TRỰC TIẾP tới Vercel Blob
 * (`@vercel/blob/client` `upload()`), KHÔNG đẩy file 100-300MB qua body
 * Next.js API (giới hạn cứng ~4.5MB của Vercel serverless functions — xem
 * Final Report "Upload architecture"). File bytes KHÔNG BAO GIỜ đi qua route
 * này hay bất kỳ server function nào của app.
 *
 * Admin-gate nằm TRONG `onBeforeGenerateToken` (chạy khi browser đã đăng nhập
 * xin token) — KHÔNG gate ở đầu POST, vì route này còn nhận callback
 * "upload-completed" (tuỳ chọn, không dùng ở đây) từ hạ tầng Vercel, không
 * mang cookie session của Admin. Sau khi `upload()` resolve ở browser, client
 * tự gọi tiếp `POST /api/stacking/tmb-profiles` (JSON, admin-gate riêng ở đó)
 * để tạo profile DRAFT trỏ tới đúng blob URL vừa upload — route này KHÔNG tạo
 * profile, chỉ cấp quyền upload.
 *
 * Yêu cầu env production: `BLOB_READ_WRITE_TOKEN` (Vercel tự cấp khi Connect
 * 1 Blob store vào project, Settings -> Storage) + `TMB_ASSET_STORAGE_PROVIDER=vercel-blob`.
 * KHÔNG set giá trị thật ở đây — xem Final Report "Required env/config". */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const guard = await requireTmbAdmin();
        if (!guard.ok) {
          throw new Error('Chỉ Admin mới có quyền tải lên Tổng mặt bằng');
        }
        return {
          allowedContentTypes: ['application/pdf'],
          addRandomSuffix: true,
          // 300MB — khớp mốc lớn nhất Section "Performance" yêu cầu hỗ trợ
          // (10MB/50MB/200MB+); chặn sớm ở tầng Blob thay vì để browser gửi
          // file khổng lồ rồi mới báo lỗi giữa chừng.
          maximumSizeInBytes: 300 * 1024 * 1024,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking/tmb-profiles/upload-url]', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
