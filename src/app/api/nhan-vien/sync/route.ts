import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { syncEmployeesFromHrFile } from '@/lib/data-access';
import { syncNhanVienToPostgres } from '@/lib/sync/nhan-vien-to-pg';
import { isPostgresEnabled } from '@/lib/db/feature-flags';
import { invalidate } from '@/lib/mem-cache';

export const maxDuration = 60;

export async function POST() {
  try {
    // 1. File HR ngoài → sheet NHAN_VIEN
    const result = await syncEmployeesFromHrFile();

    // 2. Sheet NHAN_VIEN → PostgreSQL.
    // Bắt buộc khi PG_ENABLED_MODULES bật 'hrm': mọi màn hình nhân sự đọc từ PG,
    // nên nếu chỉ ghi vào sheet thì giao diện vẫn hiện số cũ cho tới lần cron sau.
    let postgres: { synced: number; errors: number } | null = null;
    if (isPostgresEnabled('hrm')) {
      postgres = await syncNhanVienToPostgres().catch(e => {
        console.error('[nhan-vien/sync] PostgreSQL sync failed:', e instanceof Error ? e.message : e);
        return null;
      });
    }

    // 3. Xoá cache đọc để danh sách hiện ngay, không phải chờ TTL 60s
    revalidateTag('nv', {});
    invalidate('gs:nv');

    return NextResponse.json({ success: true, data: { ...result, postgres } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi kết nối đồng bộ';
    console.error('NhanVien Sync POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
