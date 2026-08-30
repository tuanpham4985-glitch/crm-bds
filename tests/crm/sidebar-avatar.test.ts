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
  assert.match(avatar, /objectPosition\s*=\s*'center top'/);
  assert.match(avatar, /objectFit:\s*'cover'[\s\S]*objectPosition/);
  assert.match(avatar, /onError=\{\(\) => setFailedSrc\(cleanSrc\)\}/);
});

test('Sidebar avatar dùng kích thước và viền giống card sinh nhật để ảnh không bị che/cắt mặt', () => {
  const sidebar = readFileSync(resolve('src/components/layout/Sidebar.tsx'), 'utf8');
  const css = readFileSync(resolve('src/components/layout/Sidebar.module.css'), 'utf8');

  assert.match(sidebar, /<UserAvatar[\s\S]*size=\{40\}/);
  assert.match(css, /\.userAvatar\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*40px;/);
  assert.match(css, /\.userAvatar\s*\{[\s\S]*border:\s*2px solid #e2e8f0;/);
  assert.match(css, /\.userAvatar\s*\{[\s\S]*box-shadow:\s*0 2px 8px rgba\(0, 0, 0, 0\.12\);/);
});
