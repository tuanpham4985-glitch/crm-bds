// Chẩn đoán vì sao một email không đăng nhập được — CHẠY TRONG MÔI TRƯỜNG THẬT.
// Chỉ Admin dùng được. Không bao giờ trả về mật khẩu, chỉ trả về true/false.
//
// Dùng: đăng nhập bằng tài khoản Admin rồi mở
//   /api/auth/diagnose?email=nhanvien@example.com
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getNhanVien } from '@/lib/google-sheets';

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
    const all = await getNhanVien();
    const nv  = all.find(x => (x.email || '').trim().toLowerCase() === email);

    const env = {
      GOOGLE_SHEET_ID: maskId(process.env.GOOGLE_SHEET_ID || ''),
      TM_GOOGLE_SHEET_ID: maskId(process.env.TM_GOOGLE_SHEET_ID || ''),
      tong_so_nhan_vien_doc_duoc: all.length,
    };

    if (!nv) {
      // Gợi ý các email gần giống để phát hiện gõ nhầm / sai sheet
      const prefix = email.split('@')[0].slice(0, 5);
      const goi_y = all
        .filter(x => (x.email || '').toLowerCase().includes(prefix))
        .map(x => ({ id_nhan_vien: x.id_nhan_vien, email: x.email, ho_ten: x.ho_ten }));

      return NextResponse.json({
        success: true,
        ket_luan: 'KHÔNG TÌM THẤY EMAIL — production đang đọc sheet không chứa nhân viên này.',
        env,
        email_can_tim: email,
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
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Auth Diagnose]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
