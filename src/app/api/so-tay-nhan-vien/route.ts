import { NextRequest, NextResponse } from 'next/server';
import { getCrmSessionUser, type CrmSessionUser } from '@/lib/crm-auth';
import { getActorPhongKD } from '@/lib/auth/hrm-authority';
import {
  canEditEmployeeHandbook, sanitizeSectionInput, slugifySectionKey,
  DEFAULT_HANDBOOK_SECTIONS, HANDBOOK_LIMITS, SECTION_KEY_PATTERN, type HandbookSection,
} from '@/lib/employee-handbook';
import { getHandbookSections, saveHandbookSection, removeHandbookSection } from '@/lib/employee-handbook-store';

// Quyền ghi xác định ở server: session đã ký (getCrmSessionUser) + tra
// phong_KD thật từ NhanVien (cookie không chứa phong_KD).
async function canEdit(user: CrmSessionUser): Promise<boolean> {
  if (canEditEmployeeHandbook({ vai_tro: user.vai_tro, employee_type: user.employee_type })) return true;
  const phongKD = await getActorPhongKD(user.id_nhan_vien).catch(() => '');
  return canEditEmployeeHandbook({ vai_tro: user.vai_tro, employee_type: user.employee_type, phong_KD: phongKD });
}

// GET: mọi nhân viên đã đăng nhập đều đọc được.
export async function GET() {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const [sections, editable] = await Promise.all([getHandbookSections(), canEdit(user)]);
    return NextResponse.json({ success: true, data: { sections, canEdit: editable } });
  } catch (error) {
    console.error('[so-tay-nhan-vien GET]', error);
    return NextResponse.json({ success: true, data: { sections: DEFAULT_HANDBOOK_SECTIONS, canEdit: false, degraded: true } });
  }
}

// PUT: cập nhật 1 mục có sẵn. Body: { key, title, description, content }
// POST: thêm mục mới. Body: { title, description, content }
// DELETE: xoá mục. Query: ?key=...
async function guard() {
  const user = await getCrmSessionUser();
  if (!user) return { error: NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 }) };
  if (!(await canEdit(user))) {
    return { error: NextResponse.json({ success: false, error: 'Chỉ Admin và Phòng HCNS được chỉnh sửa Sổ tay nhân viên' }, { status: 403 }) };
  }
  return { user };
}

export async function PUT(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const key = typeof body?.key === 'string' ? body.key : '';
    const input = sanitizeSectionInput(body);
    if (!SECTION_KEY_PATTERN.test(key) || !input) {
      return NextResponse.json({ success: false, error: 'Dữ liệu không hợp lệ (kiểm tra tiêu đề và độ dài nội dung)' }, { status: 400 });
    }
    const sections = await getHandbookSections();
    if (!sections.some(s => s.key === key)) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy mục cần sửa' }, { status: 404 });
    }
    const section: HandbookSection = { key, ...input, updated_at: new Date().toISOString(), updated_by: g.user.ho_ten };
    await saveHandbookSection(section, sections.map(s => s.key));
    return NextResponse.json({ success: true, data: section });
  } catch (error) {
    console.error('[so-tay-nhan-vien PUT]', error);
    return NextResponse.json({ success: false, error: 'Không thể lưu nội dung' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;
  try {
    const input = sanitizeSectionInput(await request.json().catch(() => null));
    if (!input) {
      return NextResponse.json({ success: false, error: 'Dữ liệu không hợp lệ (kiểm tra tiêu đề và độ dài nội dung)' }, { status: 400 });
    }
    const sections = await getHandbookSections();
    if (sections.length >= HANDBOOK_LIMITS.sections) {
      return NextResponse.json({ success: false, error: `Tối đa ${HANDBOOK_LIMITS.sections} mục` }, { status: 400 });
    }
    const taken = new Set([...sections.map(s => s.key), ...DEFAULT_HANDBOOK_SECTIONS.map(s => s.key)]);
    const base = slugifySectionKey(input.title);
    let key = base;
    for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;
    const section: HandbookSection = { key, ...input, updated_at: new Date().toISOString(), updated_by: g.user.ho_ten };
    await saveHandbookSection(section, [...sections.map(s => s.key), key]);
    return NextResponse.json({ success: true, data: section });
  } catch (error) {
    console.error('[so-tay-nhan-vien POST]', error);
    return NextResponse.json({ success: false, error: 'Không thể thêm mục' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;
  try {
    const key = request.nextUrl.searchParams.get('key') || '';
    const sections = await getHandbookSections();
    if (!SECTION_KEY_PATTERN.test(key) || !sections.some(s => s.key === key)) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy mục cần xoá' }, { status: 404 });
    }
    await removeHandbookSection(key, sections.filter(s => s.key !== key).map(s => s.key));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[so-tay-nhan-vien DELETE]', error);
    return NextResponse.json({ success: false, error: 'Không thể xoá mục' }, { status: 500 });
  }
}
