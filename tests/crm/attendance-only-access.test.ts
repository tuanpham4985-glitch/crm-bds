import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { proxy } from '../../src/proxy';
import { signSessionValue } from '../../src/lib/auth/session-signature';
import { TRANG_THAI_HOC_VIEC, isAttendanceOnlyStatus, isPathAllowedForAttendanceOnly, normalizeTrangThaiNV } from '../../src/lib/auth/access-scope';

// Nhân viên "Học việc" được đăng nhập nhưng CHỈ dùng Chấm công online —
// proxy.ts chặn ở phía máy chủ dựa trên access_scope trong cookie ĐÃ KÝ.

function sessionCookie(session: Record<string, unknown>, tamper?: (v: string) => string): string {
  const value = btoa(unescape(encodeURIComponent(JSON.stringify(session))));
  const sig = signSessionValue(value);
  return `crm_session=${tamper ? tamper(value) : value}; crm_session_sig=${sig}`;
}

const intern = { id_nhan_vien: '0200', ho_ten: 'Học Việc A', email: 'a@x.vn', vai_tro: 'Sale', access_scope: 'attendance_only' };
const staff = { id_nhan_vien: '0100', ho_ten: 'Nhân Viên B', email: 'b@x.vn', vai_tro: 'Sale' };

function run(path: string, cookie?: string, method = 'GET') {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return proxy(new NextRequest(new URL(path, 'http://localhost:3000'), { method, headers }));
}

test('access-scope: "Học việc NVKD" + tên cũ "Học việc"/"Học viên" là CÙNG 1 trạng thái attendance-only', () => {
  for (const s of ['Học việc NVKD', 'học việc nvkd', 'Học việc', '  học việc ', 'Học viên']) {
    assert.equal(isAttendanceOnlyStatus(s), true, s);
    assert.equal(normalizeTrangThaiNV(s), TRANG_THAI_HOC_VIEC, s);
  }
  for (const s of ['Thử việc', 'Chính thức', 'Nghỉ việc', 'CTV', '', undefined]) {
    assert.equal(isAttendanceOnlyStatus(s), false, String(s));
  }
  assert.equal(normalizeTrangThaiNV('Thử việc'), 'Thử việc');
  assert.equal(TRANG_THAI_HOC_VIEC, 'Học việc NVKD');
});

test('access-scope: danh sách đường dẫn được phép', () => {
  for (const p of ['/cham-cong-ngoai', '/api/cham-cong-ngoai', '/api/cham-cong-ngoai/pending-count', '/api/auth',
    '/api/auth/change-password', '/api/push/subscribe', '/api/push/unsubscribe', '/login', '/logo.png']) {
    assert.ok(isPathAllowedForAttendanceOnly(p, 'GET'), p);
  }
  assert.ok(isPathAllowedForAttendanceOnly('/api/settings/logo', 'GET'));
  assert.ok(!isPathAllowedForAttendanceOnly('/api/settings/logo', 'POST'));
  for (const p of ['/', '/khach-hang', '/nhan-vien', '/nhan-vien/bang-luong', '/quan-ly-cong-viec', '/api/khach-hang',
    '/api/nhan-vien', '/api/tm/badge', '/api/auth/diagnose', '/cham-cong-ngoai-fake', '/templates/hop-dong.doc']) {
    assert.ok(!isPathAllowedForAttendanceOnly(p, 'GET'), p);
  }
});

test('proxy: Học việc vào trang khác → chuyển về /cham-cong-ngoai; API khác → 403', async () => {
  const page = await run('/khach-hang', sessionCookie(intern));
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get('location')!).pathname, '/cham-cong-ngoai');

  const home = await run('/', sessionCookie(intern));
  assert.equal(new URL(home.headers.get('location')!).pathname, '/cham-cong-ngoai');

  const api = await run('/api/khach-hang', sessionCookie(intern));
  assert.equal(api.status, 403);
});

test('proxy: Học việc dùng được Chấm công online', async () => {
  for (const p of ['/cham-cong-ngoai', '/api/cham-cong-ngoai']) {
    const res = await run(p, sessionCookie(intern));
    assert.equal(res.headers.get('x-middleware-next'), '1', p);
  }
  const post = await run('/api/cham-cong-ngoai', sessionCookie(intern), 'POST');
  assert.equal(post.headers.get('x-middleware-next'), '1');
});

test('proxy: Học việc đã đăng nhập mở /login → về /cham-cong-ngoai', async () => {
  const res = await run('/login', sessionCookie(intern));
  assert.equal(new URL(res.headers.get('location')!).pathname, '/cham-cong-ngoai');
});

test('proxy: nhân viên thường không bị ảnh hưởng', async () => {
  for (const p of ['/', '/khach-hang', '/api/khach-hang', '/cham-cong-ngoai']) {
    const res = await run(p, sessionCookie(staff));
    assert.equal(res.headers.get('x-middleware-next'), '1', p);
  }
  const login = await run('/login', sessionCookie(staff));
  assert.equal(new URL(login.headers.get('location')!).pathname, '/');
});

test('proxy: sửa tay cookie (bỏ access_scope) → chữ ký sai → coi như chưa đăng nhập', async () => {
  const forged = btoa(unescape(encodeURIComponent(JSON.stringify({ ...intern, access_scope: undefined }))));
  const cookie = sessionCookie(intern, () => forged);
  const page = await run('/khach-hang', cookie);
  assert.equal(new URL(page.headers.get('location')!).pathname, '/login');
  const api = await run('/api/khach-hang', cookie);
  assert.equal(api.status, 401);
});

test('proxy: không có phiên → vẫn như cũ', async () => {
  const page = await run('/cham-cong-ngoai');
  assert.equal(new URL(page.headers.get('location')!).pathname, '/login');
  const login = await run('/login');
  assert.equal(login.headers.get('x-middleware-next'), '1');
});
