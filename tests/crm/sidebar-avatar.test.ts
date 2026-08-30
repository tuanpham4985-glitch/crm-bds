import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('api/auth trả avatar_url từ NHAN_VIEN để useAuth có dữ liệu ảnh đại diện', () => {
  const src = readFileSync(resolve('src/app/api/auth/route.ts'), 'utf8');

  assert.match(src, /avatar_url:\s*nv\.avatar_url\s*\|\|\s*''/);
  assert.match(src, /userData\.avatar_url\s*=\s*nv\.avatar_url\s*\|\|\s*''/);
});

test('Sidebar và mobile header render UserAvatar bằng avatar_url, chữ cái chỉ là fallback', () => {
  const sidebar = readFileSync(resolve('src/components/layout/Sidebar.tsx'), 'utf8');
  const appShell = readFileSync(resolve('src/components/layout/AppShell.tsx'), 'utf8');
  const avatar = readFileSync(resolve('src/components/layout/UserAvatar.tsx'), 'utf8');

  assert.match(sidebar, /<UserAvatar[\s\S]*src=\{user\.avatar_url\}/);
  assert.match(appShell, /<UserAvatar[\s\S]*src=\{user\.avatar_url\}/);
  assert.match(avatar, /<img[\s\S]*src=\{cleanSrc\}/);
  assert.match(avatar, /onError=\{\(\) => setFailedSrc\(cleanSrc\)\}/);
});
