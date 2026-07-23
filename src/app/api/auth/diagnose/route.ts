// Chẩn đoán vì sao một email không đăng nhập được — CHẠY TRONG MÔI TRƯỜNG THẬT.
// Chỉ Admin dùng được. Không bao giờ trả về mật khẩu, chỉ trả về true/false.
//
// Dùng: đăng nhập bằng tài khoản Admin rồi mở
//   /api/auth/diagnose?email=nhanvien@example.com
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
// findNhanVienByEmail: ĐÚNG hàm mà POST /api/auth gọi (đi qua facade → PostgreSQL)
import { findNhanVienByEmail } from '@/lib/data-access';
// GS.*: nguồn sự thật, để đối chiếu khi bản sao PG bị lệch
import { getNhanVien as gsGetNhanVien } from '@/lib/google-sheets';
import { isPostgresEnabled } from '@/lib/db/feature-flags';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Giống hệt danh sách trong POST /api/auth — nếu lệch thì chẩn đoán vô nghĩa
const ACTIVE_STATUSES = ['đang làm', 'chính thức', 'thử việc'];

/** Che bớt id sheet: chỉ lộ 6 ký tự cuối, đủ để đối chiếu mà không lộ toàn bộ */
function maskId(v: string): string {
  if (!v) return '(chưa cấu hình)';
  return `…${v.slice(-6)} (${v.length} ký tự)`;
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  try {
    const raw = (await cookies()).get('crm_session')?.value;
    if (!raw) {
      return { ok: false, res: NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 }) };
    }
    const session = JSON.parse(decodeURIComponent(escape(atob(raw))));
    const devAdmin = (process.env.DEV_ADMIN_EMAIL || '').toLowerCase();
    const isAdmin = session.vai_tro === 'Admin'
      || (devAdmin && String(session.email || '').toLowerCase() === devAdmin);
    if (!isAdmin) {
      return { ok: false, res: NextResponse.json({ success: false, error: 'Chỉ Admin được dùng' }, { status: 403 }) };
    }
    return { ok: true };
  } catch {
    return { ok: false, res: NextResponse.json({ success: false, error: 'Session không hợp lệ' }, { status: 401 }) };
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ success: false, error: 'Thiếu tham số ?email=' }, { status: 400 });
  }

  try {
    // 1. Đường đi THẬT của đăng nhập
    const nv = await findNhanVienByEmail(email);

    // 2. Nguồn sự thật, để phát hiện bản sao PostgreSQL bị lệch
    const gsAll = await gsGetNhanVien().catch(() => []);
    const gsNv  = gsAll.find(x => (x.email || '').trim().toLowerCase() === email);

    const env = {
      GOOGLE_SHEET_ID: maskId(process.env.GOOGLE_SHEET_ID || ''),
      PG_ENABLED_MODULES: process.env.PG_ENABLED_MODULES || '(trống → tất cả dùng Google Sheets)',
      hrm_dang_doc_tu: isPostgresEnabled('hrm') ? 'PostgreSQL (bản sao, cron nạp mỗi ngày)' : 'Google Sheets',
      so_nhan_vien_trong_sheet: gsAll.length,
    };

    if (!nv) {
      const prefix = email.split('@')[0].slice(0, 5);
      const goi_y = gsAll
        .filter(x => (x.email || '').toLowerCase().includes(prefix))
        .map(x => ({ id_nhan_vien: x.id_nhan_vien, email: x.email, ho_ten: x.ho_ten }));

      return NextResponse.json({
        success: true,
        ket_luan: gsNv
          ? 'LỆCH DỮ LIỆU — có trong Google Sheets nhưng đường đăng nhập không thấy. '
            + 'Chạy /api/cron/sync-sheets để nạp lại PostgreSQL.'
          : 'KHÔNG TÌM THẤY EMAIL ở cả hai nguồn — kiểm tra lại GOOGLE_SHEET_ID của production.',
        env,
        email_can_tim: email,
        co_trong_google_sheets: Boolean(gsNv),
        email_gan_giong: goi_y,
      });
    }

    const trangThai = (nv.trang_thai || '').trim().toLowerCase();
    const trangThaiHopLe = ACTIVE_STATUSES.includes(trangThai);
    const coMatKhauRieng = Boolean(nv.mat_khau);

    const ket_luan = !trangThaiHopLe
      ? `TRẠNG THÁI KHÔNG HỢP LỆ — "${nv.trang_thai}" không nằm trong ${ACTIVE_STATUSES.join(' / ')}.`
      : coMatKhauRieng
        ? 'EMAIL VÀ TRẠNG THÁI ĐỀU HỢP LỆ — nếu vẫn không vào được thì mật khẩu đang gõ không khớp cột mat_khau.'
        : 'EMAIL VÀ TRẠNG THÁI ĐỀU HỢP LỆ — cột mat_khau trống nên mật khẩu là 123456.';

    return NextResponse.json({
      success: true,
      ket_luan,
      env,
      nhan_vien: {
        id_nhan_vien: nv.id_nhan_vien,
        ho_ten: nv.ho_ten,
        email: nv.email,
        trang_thai: nv.trang_thai,
        vai_tro: nv.vai_tro,
        employee_type: nv.employee_type,
      },
      kiem_tra: {
        tim_thay_email: true,
        trang_thai_hop_le: trangThaiHopLe,
        co_mat_khau_rieng: coMatKhauRieng,      // true = dùng cột mat_khau, false = dùng 123456
        do_dai_mat_khau: (nv.mat_khau || '123456').length,
        email_co_ky_tu_la: nv.email !== nv.email.trim().toLowerCase(),
        co_trong_google_sheets: Boolean(gsNv),
        // Bản sao PG lệch so với sheet ở các trường ảnh hưởng đăng nhập?
        pg_lech_so_voi_sheet: gsNv
          ? {
              trang_thai: (gsNv.trang_thai || '') !== (nv.trang_thai || ''),
              mat_khau:   (gsNv.mat_khau || '') !== (nv.mat_khau || ''),
            }
          : null,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Auth Diagnose]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
