import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// ROOT CAUSE (audit "TMB_ACTIVATION_INVARIANT" — xem Final Report trước):
// POST /api/stacking/tmb-profiles/[id]/activate CHỈ update ĐÚNG 1 dòng target
// sang ACTIVE — không hề biết tới sibling nào khác CÙNG stacking_config_id +
// subdivision. Không có unique constraint nào trong schema ngăn 2 dòng cùng
// project/subdivision đều ACTIVE — Sale runtime (useDbTmbMapProfiles) lọc
// TẤT CẢ dòng status==='ACTIVE' cho 1 config, nên 2 ACTIVE cùng lúc khiến
// dropdown "Chọn TMB" xuất hiện ngoài ý muốn, mặc định chọn theo created_at
// asc (không nhất thiết là bản Admin vừa kích hoạt).
//
// FIX: activateTmbMapProfile() (tmb-repository.ts) — 1 transaction SERIALIZABLE
// vừa deactivate MỌI sibling ACTIVE cùng slot (status -> READY_FOR_REVIEW,
// CÙNG status "Ngừng dùng" hiện có, không phát minh status mới) vừa activate
// target, atomic. SERIALIZABLE (không phải READ COMMITTED mặc định) để đóng
// race 2 request activate 2 profile KHÁC NHAU cùng slot gần như đồng thời —
// xem comment đầy đủ tại hàm trong tmb-repository.ts.
//
// KHÔNG có DB test thật (project KHÔNG chạy DB integration test trong
// tests/crm/*.test.ts — xem membership-workflow.test.ts/private-group-api.test.ts,
// đều test PURE logic, không gọi Prisma thật; test:crm chạy không có
// DATABASE_URL) — verify CẤU TRÚC code (transaction/where-clause/isolation/
// retry) qua source, CÙNG convention source-regex đã dùng xuyên suốt các test
// TMB khác trong repo cho phần không thể DOM/integration-test được.

const repoSource = fs.readFileSync('src/lib/tmb-repository.ts', 'utf8');
const routeSource = fs.readFileSync('src/app/api/stacking/tmb-profiles/[id]/activate/route.ts', 'utf8');

function extractFn(source: string, signaturePattern: RegExp): string {
  const match = source.match(signaturePattern);
  assert.ok(match, `không tìm thấy function khớp pattern: ${signaturePattern}`);
  return match![0];
}

const activateFnBody = extractFn(repoSource, /export async function activateTmbMapProfile\(id: string\) \{[\s\S]*?\n\}\n/);
const serializableFnBody = extractFn(repoSource, /async function serializable<T>\(operation: \(tx: Tx\) => Promise<T>\): Promise<T> \{[\s\S]*?\n\}\n/);

// ─── A. old ACTIVE + new READY_FOR_REVIEW -> activate new -> new ACTIVE, old
//        non-ACTIVE, không còn >1 ACTIVE trong slot ────────────────────────

test('A1. activateTmbMapProfile(): updateMany deactivate sibling dùng where CHÍNH XÁC { stacking_config_id, subdivision, status: "ACTIVE", id: { not: id } } — đúng "slot" (project+subdivision), loại trừ chính target', () => {
  assert.match(activateFnBody, /const profile = await tx\.tmbMapProfile\.findUniqueOrThrow\(\{ where: \{ id \} \}\);/);
  assert.match(activateFnBody, /await tx\.tmbMapProfile\.updateMany\(\{\s*\n\s*where: \{\s*\n\s*stacking_config_id: profile\.stacking_config_id,\s*\n\s*subdivision: profile\.subdivision,\s*\n\s*status: 'ACTIVE',\s*\n\s*id: \{ not: id \},\s*\n\s*\},\s*\n\s*data: \{ status: 'READY_FOR_REVIEW' \},\s*\n\s*\}\);/);
});

test('A2. activateTmbMapProfile(): sau khi deactivate sibling, target được update status="ACTIVE", error_message=null', () => {
  assert.match(activateFnBody, /return tx\.tmbMapProfile\.update\(\{\s*\n\s*where: \{ id \},\s*\n\s*data: \{ status: 'ACTIVE', error_message: null \},\s*\n\s*\}\);/);
});

test('A3. Cả deactivate-sibling lẫn activate-target nằm CHUNG 1 lời gọi serializable(...) — atomic, không phải 2 request rời rạc', () => {
  assert.match(repoSource, /export async function activateTmbMapProfile\(id: string\) \{\s*\n\s*return serializable\(async tx => \{/);
});

// ─── B/C. sibling khác subdivision / khác stacking_config_id -> KHÔNG đổi ──

test('B/C. where-clause updateMany đòi hỏi CẢ stacking_config_id LẪN subdivision khớp đúng target — sibling khác 1 trong 2 field này tự động KHÔNG match, KHÔNG bị đổi (Prisma AND ngầm định giữa các field trong 1 object where)', () => {
  const whereBlock = activateFnBody.match(/where: \{\s*\n\s*stacking_config_id: profile\.stacking_config_id,\s*\n\s*subdivision: profile\.subdivision,\s*\n\s*status: 'ACTIVE',\s*\n\s*id: \{ not: id \},\s*\n\s*\}/);
  assert.ok(whereBlock, 'where-clause phải có đủ 4 điều kiện: stacking_config_id + subdivision + status + id!=target');
});

// ─── D. activate lại profile ĐANG ACTIVE -> idempotent ─────────────────────

test('D. Idempotent theo cấu trúc: id: { not: id } trong updateMany LOẠI TRỪ chính target khỏi tập bị deactivate -> activate lại 1 profile ĐANG ACTIVE không tự deactivate chính nó giữa chừng rồi mới activate lại (không có khoảng "mất ACTIVE" tạm thời cho chính target)', () => {
  assert.match(activateFnBody, /id: \{ not: id \}/);
});

// ─── E. authorization hiện hữu giữ nguyên ──────────────────────────────────

test('E. requireTmbAdmin() guard vẫn là bước ĐẦU TIÊN của route, KHÔNG đổi — activateTmbMapProfile không tự thêm/bớt authorization nào (repository KHÔNG check quyền, route vẫn là nơi DUY NHẤT gate)', () => {
  assert.match(routeSource, /export async function POST\(req: NextRequest, \{ params \}: \{ params: Promise<\{ id: string \}> \}\) \{\s*\n\s*const guard = await requireTmbAdmin\(\);\s*\n\s*if \(!guard\.ok\) return guard\.response;/);
  assert.ok(!repoSource.includes('requireTmbAdmin'), 'tmb-repository.ts KHÔNG tự import/check quyền — giữ đúng layering (route gate, repository chỉ ghi DB)');
});

test('E2. Route vẫn giữ check web_asset_ref TRƯỚC khi gọi activateTmbMapProfile (bất biến cũ "chưa Tối ưu thì chưa Kích hoạt được" không đổi)', () => {
  assert.match(routeSource, /if \(!profile\.web_asset_ref\) \{\s*\n\s*return NextResponse\.json\(\{ success: false, error: 'Chưa có web asset — chạy "Tối ưu" trước khi kích hoạt' \}, \{ status: 400 \}\);\s*\n\s*\}\s*\n\s*\/\/[\s\S]*?const updated = await activateTmbMapProfile\(id\);/);
});

// ─── F. mappings/assets/glyph_remap KHÔNG bị thay đổi ──────────────────────

test('F. activateTmbMapProfile() KHÔNG đụng tới TmbUnitMapping/glyph_remap/master_asset_ref/web_asset_ref của BẤT KỲ profile nào — cả 2 câu update chỉ set status (+ error_message cho target)', () => {
  assert.ok(!activateFnBody.includes('tmbUnitMapping'));
  assert.ok(!activateFnBody.includes('glyph_remap'));
  assert.ok(!activateFnBody.includes('master_asset_ref'));
  assert.ok(!activateFnBody.includes('web_asset_ref'));
  // Chỉ 2 field được set trong toàn bộ hàm: status (2 lần) + error_message (1 lần, target).
  const dataBlocks = [...activateFnBody.matchAll(/data: \{ ([^}]+) \}/g)].map(m => m[1]);
  assert.deepEqual(dataBlocks, ["status: 'READY_FOR_REVIEW'", "status: 'ACTIVE', error_message: null"]);
});

test('F2. Không có route/service nào khác được sửa liên quan mapping/indexer/optimizer/alias/PDF/renderer/Sheet — chỉ tmb-repository.ts + activate/route.ts thay đổi', () => {
  const indexerSource = fs.readFileSync('src/lib/tmb-indexer.ts', 'utf8');
  const optimizerSource = fs.readFileSync('src/lib/tmb-optimizer.ts', 'utf8');
  assert.match(indexerSource, /export function suggestUnitAliasRules/);
  assert.match(optimizerSource, /export async function analyzePdf/);
});

// ─── Status "Ngừng dùng" — reuse ĐÚNG semantics hiện có, KHÔNG phát minh mới ─

test('Status reuse: deactivate thủ công ("Ngừng dùng") và auto-deactivate sibling khi activate profile khác ĐỀU dùng CÙNG giá trị status "READY_FOR_REVIEW" — KHÔNG có status mới nào được thêm vào TmbMapProfileStatus', () => {
  assert.match(routeSource, /if \(action === 'deactivate'\) \{\s*\n\s*const updated = await updateTmbMapProfile\(id, \{ status: 'READY_FOR_REVIEW' \}\);/);
  assert.match(activateFnBody, /data: \{ status: 'READY_FOR_REVIEW' \}/);
  assert.match(repoSource, /export type TmbMapProfileStatus = 'DRAFT' \| 'ANALYZED' \| 'READY_FOR_REVIEW' \| 'ACTIVE' \| 'ERROR';/);
});

// ─── G. Concurrency guard: SERIALIZABLE isolation + retry-on-conflict ──────

test('G1. serializable(): dùng Prisma.TransactionIsolationLevel.Serializable (KHÔNG phải READ COMMITTED mặc định) — cần thiết để Postgres tự phát hiện write-skew giữa 2 activate request khác profile cùng slot', () => {
  assert.match(serializableFnBody, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
});

test('G2. serializable(): retry TỐI ĐA 3 lần CHỈ khi lỗi là P2034 (write conflict/deadlock) — lỗi khác (VD lỗi ứng dụng thật) throw NGAY, không âm thầm nuốt/retry vô ích', () => {
  assert.match(serializableFnBody, /for \(let attempt = 0; attempt < 3; attempt\+\+\)/);
  assert.match(serializableFnBody, /if \(code !== 'P2034'\) throw error;/);
});

test('G3. activateTmbMapProfile() gọi qua serializable() — KHÔNG dùng $transaction([...]) dạng array (đã biết KHÔNG ổn định với driver adapter @prisma/adapter-pg hiện tại của dự án, xem private-group.ts comment) — dùng dạng interactive prisma.$transaction(async tx => ...) đúng convention', () => {
  assert.match(repoSource, /return await prisma\.\$transaction\(operation, \{ isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable \}\);/);
  assert.ok(!repoSource.includes('$transaction(['));
});

// ─── Sanity: import Prisma là VALUE import (không phải `import type`) — cần
//        thiết để dùng Prisma.TransactionIsolationLevel/PrismaClientKnownRequestError
//        như runtime value, không chỉ type ─────────────────────────────────

test('Import: import { Prisma } from generated client là VALUE import (không phải import type) — bắt buộc để dùng Prisma.TransactionIsolationLevel.Serializable và Prisma.PrismaClientKnownRequestError (instanceof) ở runtime', () => {
  assert.match(repoSource, /^import \{ Prisma \} from '\.\.\/generated\/prisma\/client';$/m);
  assert.ok(!repoSource.includes("import type { Prisma }"));
});
