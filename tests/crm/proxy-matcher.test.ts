import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { config } from '../../src/proxy';

// Batch 1 P0 — middleware matcher mở rộng bypass cho asset PWA tĩnh
// (sw.js/push-sw.js/workbox-*.js + icon-192.png/icon-512.png/
// apple-touch-icon.png, tham chiếu trực tiếp từ manifest.json) — các file
// này KHÔNG có nội dung nhạy cảm và PHẢI tải được không cần session (cùng lý
// do /api/pwa/icon đã bypass từ trước).
//
// Import THẲNG config thật (không tự parse lại source bằng regex trên text
// thô) — matcher là 1 CHUỖI JS đã qua escape (VD "\\." trong source ->
// runtime string chỉ còn 1 dấu \), tự regex-parse text thô dễ lệch escape;
// import module lấy đúng giá trị runtime Next.js thực sự nhận.

const matcherPattern = config.matcher[0];

test('proxy.ts: matcher vẫn giữ NGUYÊN mọi exclusion cũ (regression guard — không vô tình xoá bớt khi thêm exclusion mới)', () => {
  for (const old of ['_next/static', '_next/image', 'favicon.ico', 'manifest.json', 'icons', 'tmb-poc']) {
    assert.ok(matcherPattern.includes(old), `matcher thiếu exclusion cũ "${old}"`);
  }
});

test('proxy.ts: matcher đã thêm exclusion cho service worker + Workbox runtime (sw.js/push-sw.js/workbox-*.js)', () => {
  assert.ok(matcherPattern.includes('sw.js'), 'thiếu sw.js');
  assert.ok(matcherPattern.includes('push-sw.js'), 'thiếu push-sw.js');
  assert.ok(matcherPattern.includes('workbox-'), 'thiếu pattern workbox-*.js (tên file có hash, phải dùng wildcard)');
});

test('proxy.ts: matcher đã thêm exclusion cho 3 icon PWA tham chiếu trực tiếp từ manifest.json (trước đây "icons" không khớp gì vì 3 file này nằm ở public/ gốc, không có thư mục public/icons/)', () => {
  for (const icon of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
    assert.ok(matcherPattern.includes(icon), `thiếu exclusion cho ${icon}`);
  }
  const manifest = JSON.parse(readFileSync(resolve('public/manifest.json'), 'utf8'));
  const manifestIconSrcs: string[] = manifest.icons.map((i: { src: string }) => i.src);
  assert.ok(manifestIconSrcs.includes('/icon-192.png'), 'manifest.json phải còn tham chiếu /icon-192.png (khớp với exclusion vừa thêm)');
  assert.ok(manifestIconSrcs.includes('/icon-512.png'), 'manifest.json phải còn tham chiếu /icon-512.png (khớp với exclusion vừa thêm)');
});

// Kiểm tra HÀNH VI thật (không chỉ presence trong string) — dựng lại đúng
// ngữ nghĩa negative-lookahead của matcher Next.js bằng RegExp thuần, từ
// ĐÚNG chuỗi runtime (matcherPattern, đã qua escape của JS engine).
function buildExclusionRegex(pattern: string): RegExp {
  const inner = pattern.match(/\(\?!(.+)\)\.\*/);
  assert.ok(inner, 'matcher phải đúng dạng /((?!...).*)');
  return new RegExp(`^/(${inner![1]})(/|$)`);
}

test('proxy.ts: HÀNH VI — path cho từng asset PWA mới KHỚP exclusion (middleware sẽ bypass, không đòi session)', () => {
  const re = buildExclusionRegex(matcherPattern);
  for (const path of ['/sw.js', '/push-sw.js', '/workbox-f1770938.js', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']) {
    assert.ok(re.test(path), `${path} phải khớp exclusion (bypass auth) nhưng không khớp`);
  }
});

test('proxy.ts: HÀNH VI — route CRM thật (VD /api/khach-hang, /khach-hang) KHÔNG khớp exclusion — vẫn phải qua session check như cũ, không bị bypass nhầm', () => {
  const re = buildExclusionRegex(matcherPattern);
  for (const path of ['/api/khach-hang', '/khach-hang', '/api/dashboard', '/']) {
    assert.ok(!re.test(path), `${path} KHÔNG được khớp exclusion — sẽ vô tình bypass auth nếu khớp`);
  }
});
