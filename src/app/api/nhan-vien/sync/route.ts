import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { syncEmployeesFromHrFile, syncManagerFromHrFile } from '@/lib/data-access';
import { syncNhanVienToPostgres } from '@/lib/sync/nhan-vien-to-pg';
import { syncTmUsersFromNhanVien } from '@/lib/task-management/sync-users';
import { isPostgresEnabled } from '@/lib/db/feature-flags';
import { invalidate } from '@/lib/mem-cache';

export const maxDuration = 60;

export async function POST() {
  try {
    // 1. File HR ngoài → sheet NHAN_VIEN
    const result = await syncEmployeesFromHrFile();

    // 2. File HR ngoài → cột ql_truc_tiep.
    // Bảng ALIASES của syncEmployeesFromHrFile KHÔNG có ql_truc_tiep, cột này do
    // syncManagerFromHrFile phụ trách riêng (khớp theo mã, fallback theo họ tên).
    // Trước đây không chỗ nào gọi nó nên quản lý trực tiếp mãi mãi trống.
    // Phải chạy TRƯỚC bước đẩy sang PostgreSQL để bản sao nhận được giá trị mới.
    const manager = await syncManagerFromHrFile().catch(e => {
      console.error('[nhan-vien/sync] Manager sync failed:', e instanceof Error ? e.message : e);
      return null;
    });

    // 3. Sheet NHAN_VIEN → PostgreSQL.
    // Bắt buộc khi PG_ENABLED_MODULES bật 'hrm': mọi màn hình nhân sự đọc từ PG,
    // nên nếu chỉ ghi vào sheet thì giao diện vẫn hiện số cũ cho tới lần cron sau.
    let postgres: Awaited<ReturnType<typeof syncNhanVienToPostgres>> | null = null;
    if (isPostgresEnabled('hrm')) {
      postgres = await syncNhanVienToPostgres().catch(e => {
        console.error('[nhan-vien/sync] PostgreSQL sync failed:', e instanceof Error ? e.message : e);
        return null;
      });
    }

    // 4. NHAN_VIEN → TM_Users, để nhân viên mới giao việc được ngay.
    // Gộp vào đây thay vì để một nút "Đồng bộ NV" riêng: cùng một nguồn dữ liệu,
    // tách ra chỉ khiến người dùng phải nhớ bấm hai chỗ.
    const taskUsers = await syncTmUsersFromNhanVien().catch(e => {
      console.error('[nhan-vien/sync] TM_Users sync failed:', e instanceof Error ? e.message : e);
      return null;
    });

    // 5. Xoá cache đọc để danh sách hiện ngay, không phải chờ TTL 60s
    revalidateTag('nv', {});
    invalidate('gs:nv');

    return NextResponse.json({ success: true, data: { ...result, manager, postgres, taskUsers } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Lỗi kết nối đồng bộ';
    console.error('NhanVien Sync POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
