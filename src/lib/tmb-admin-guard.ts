/** TMB Manager — admin-only guard cho API routes quản lý TMB (Section 14:
 * upload/optimize/auto-index/manual mapping/activate/deactivate/delete đều
 * CHỈ Admin). Dùng LẠI session helper đã có (crm-auth.ts), KHÔNG tự decode
 * cookie lần 2. Enforce SERVER-SIDE trong từng route — không tin client. */
import { NextResponse } from 'next/server';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';

export async function requireTmbAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const user = await getCrmSessionUser();
  if (!isCrmAdmin(user)) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Chỉ Admin mới có quyền quản lý TMB' }, { status: 403 }) };
  }
  return { ok: true };
}
