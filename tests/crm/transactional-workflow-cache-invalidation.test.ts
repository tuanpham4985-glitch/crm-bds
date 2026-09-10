import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// Batch 1 (Level-1 perf audit) item 2 — remediation cho 3 hàm transactional
// CÒN LẠI (ngoài transitionHandoffTransactional, đã có test riêng trong
// campaign-handoff.test.ts) ghi Customer qua raw tx.* TRONG transaction,
// KHÔNG đi qua wrapper data-access.ts (updateKhachHang) nên trước đây KHÔNG
// tự invalidate cache 'kh' (unstable_cache, 30s TTL) — /api/khach-hang và
// consumer khác (Dashboard) có thể trả stale ownership/trạng thái tới 30s
// sau CSKH interaction/qualification/assign dù Postgres đã đúng.

const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');

function functionBody(fnSignature: string, nextFnSignature?: string): string {
  const start = src.indexOf(fnSignature);
  assert.ok(start > -1, `không tìm thấy "${fnSignature}"`);
  const end = nextFnSignature ? src.indexOf(nextFnSignature, start) : src.length;
  assert.ok(end > start, `không tìm thấy đúng ranh giới cho "${fnSignature}"`);
  return src.slice(start, end);
}

test('recordInteractionTransactional: invalidate cache "kh" SAU khi transaction commit — reuse convention revalidateTag(tag, {}) + invalidate("gs:"+tag) y hệt data-access.ts, KHÔNG tự chế cơ chế riêng', () => {
  const body = functionBody(
    'export async function recordInteractionTransactional',
    'export async function updateQualificationTransactional',
  );
  assert.match(body, /const result = await serializable\(async tx => \{/, 'phải bắt kết quả transaction lại để invalidate SAU KHI nó resolve, không invalidate trong callback');
  assert.match(body, /\n  \}\);\s*\n(\s*\/\/[^\n]*\n)*\s*revalidateTag\('kh', \{\}\); invalidate\('gs:kh'\);\s*\n\s*return result;\s*\n\}/,
    'invalidate "kh" phải nằm NGAY SAU dấu đóng của serializable() (đã commit), TRƯỚC return result — không invalidate trong lúc transaction còn chạy');
});

test('updateQualificationTransactional: invalidate cache "kh" SAU khi transaction commit — cùng convention như recordInteractionTransactional', () => {
  const body = functionBody(
    'export async function updateQualificationTransactional',
    'async function ensurePipeline',
  );
  assert.match(body, /const result = await serializable\(async tx => \{/);
  assert.match(body, /\n  \}\);\s*\n(\s*\/\/[^\n]*\n)*\s*revalidateTag\('kh', \{\}\); invalidate\('gs:kh'\);\s*\n\s*return result;\s*\n\}/);
});

test('assignTelesaleTransactional: invalidate cache "kh" SAU khi transaction commit — cùng convention, hàm này chỉ đổi telesale_phu_trach nên KHÔNG cần invalidate "pl"', () => {
  const body = functionBody('export async function assignTelesaleTransactional');
  assert.match(body, /const result = await serializable\(async tx => \{/);
  assert.match(body, /\n  \}\);\s*\n(\s*\/\/[^\n]*\n)*\s*revalidateTag\('kh', \{\}\); invalidate\('gs:kh'\);\s*\n\s*return result;\s*\n\}/);
  assert.doesNotMatch(body, /'pl'/, 'assignTelesaleTransactional không đụng Pipeline, không được invalidate tag "pl"');
});

test('cả 3 hàm CHỈ invalidate "kh" — KHÔNG hàm nào trong 3 hàm này gọi revalidateTag("pl") (chỉ transitionHandoffTransactional nhánh accept mới cần, đã test riêng)', () => {
  const recordInteractionBody = functionBody('export async function recordInteractionTransactional', 'export async function updateQualificationTransactional');
  const updateQualificationBody = functionBody('export async function updateQualificationTransactional', 'async function ensurePipeline');
  for (const [name, body] of [['recordInteractionTransactional', recordInteractionBody], ['updateQualificationTransactional', updateQualificationBody]] as const) {
    const matches = body.match(/revalidateTag\(/g) || [];
    assert.equal(matches.length, 1, `${name} phải đúng 1 lời gọi revalidateTag (chỉ 'kh')`);
    assert.doesNotMatch(body, /'pl'/, `${name} không đụng Pipeline, không được invalidate tag "pl"`);
  }
});

test('invalidate KHÔNG nằm trong try/catch nuốt lỗi — transaction fail (throw) phải propagate ra ngoài TRƯỚC khi chạm dòng invalidate, không invalidate cache cho 1 action đã fail', () => {
  const recordInteractionBody = functionBody('export async function recordInteractionTransactional', 'export async function updateQualificationTransactional');
  const updateQualificationBody = functionBody('export async function updateQualificationTransactional', 'async function ensurePipeline');
  const assignTelesaleBody = functionBody('export async function assignTelesaleTransactional');
  for (const body of [recordInteractionBody, updateQualificationBody, assignTelesaleBody]) {
    const iInvalidate = body.indexOf("revalidateTag('kh'");
    assert.ok(iInvalidate > -1);
    assert.doesNotMatch(body.slice(0, iInvalidate), /catch/, 'không được có try/catch nuốt lỗi transaction trước dòng invalidate');
  }
});
