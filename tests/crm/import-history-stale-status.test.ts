import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveImportBatchDisplayStatus, IMPORT_BATCH_STALE_THRESHOLD_MS,
} from '../../src/lib/import-batch-display-status';

// IMPORT HISTORY STALE STATUS — batch 'processing' không có code path nào
// khác tự chuyển 'completed' (interrupted-import semantics, đã khoá ở
// import-batch.test.ts) — nếu request chết giữa chừng, status treo
// 'processing' VĨNH VIỄN trong DB. deriveImportBatchDisplayStatus() CHỈ đổi
// NHÃN HIỂN THỊ dựa trên tuổi batch, KHÔNG ghi DB, KHÔNG đổi batch.status.

const PAGE_PATH = 'src/app/khach-hang/page.tsx';
const IMPORT_ROUTE_PATH = 'src/app/api/khach-hang/import-excel/route.ts';
const KHACH_HANG_ROUTE_PATH = 'src/app/api/khach-hang/route.ts';

// --- A. deriveImportBatchDisplayStatus (pure, runtime thật) ---

test('deriveImportBatchDisplayStatus: status "completed" -> luôn "completed", bất kể tuổi batch', () => {
  const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(deriveImportBatchDisplayStatus({ status: 'completed', imported_at: veryOld }), 'completed');
});

test('deriveImportBatchDisplayStatus: status "processing" còn mới (trong ngưỡng) -> "processing"', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  const recentlyStarted = new Date(now.getTime() - 10_000); // 10s trước — còn trong maxDuration 60s
  assert.equal(deriveImportBatchDisplayStatus({ status: 'processing', imported_at: recentlyStarted }, now), 'processing');
});

test('deriveImportBatchDisplayStatus: status "processing" đúng NGAY NGƯỠNG (không vượt) -> vẫn "processing" (boundary inclusive, không báo nhầm)', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  const atThreshold = new Date(now.getTime() - IMPORT_BATCH_STALE_THRESHOLD_MS);
  assert.equal(deriveImportBatchDisplayStatus({ status: 'processing', imported_at: atThreshold }, now), 'processing');
});

test('deriveImportBatchDisplayStatus: status "processing" vượt ngưỡng (VD nhiều ngày trước, giống HLX) -> "stale"', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  assert.equal(deriveImportBatchDisplayStatus({ status: 'processing', imported_at: twoDaysAgo }, now), 'stale');
});

test('deriveImportBatchDisplayStatus: chấp nhận imported_at dạng string (từ JSON.parse fetch response) lẫn Date object', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  const iso = new Date(now.getTime() - 10_000).toISOString();
  assert.equal(deriveImportBatchDisplayStatus({ status: 'processing', imported_at: iso }, now), 'processing');
});

test('IMPORT_BATCH_STALE_THRESHOLD_MS: ngưỡng lấy từ authority timeout hiện có (maxDuration=60s của import-excel/route.ts) với buffer, không phải số tuỳ tiện — phải LỚN HƠN maxDuration*1000 để không báo nhầm request đang chạy hợp lệ gần biên', () => {
  const routeSrc = readFileSync(resolve(IMPORT_ROUTE_PATH), 'utf8');
  const match = routeSrc.match(/export const maxDuration\s*=\s*(\d+)/);
  assert.ok(match, 'import-excel/route.ts phải khai báo maxDuration (authority timeout duy nhất hiện có cho route này)');
  const maxDurationMs = Number(match![1]) * 1000;
  assert.ok(IMPORT_BATCH_STALE_THRESHOLD_MS > maxDurationMs, 'ngưỡng stale phải > maxDuration*1000 (request chắc chắn đã bị kill trước khi bị coi là stale)');
});

test('import-batch-display-status.ts (pure) KHÔNG import bất kỳ server-only module nào (db/client, googleapis, google-spreadsheet...) — an toàn dùng trong khach-hang/page.tsx (\'use client\')', () => {
  const src = readFileSync(resolve('src/lib/import-batch-display-status.ts'), 'utf8');
  assert.doesNotMatch(src, /from ['"]\.\.?\/.*db\/client|googleapis|google-spreadsheet|google-auth-library|@prisma/);
  assert.doesNotMatch(src, /^import /m, 'file phải hoàn toàn pure — không import gì cả');
});

// --- B. Wiring: khach-hang/page.tsx Import History dùng derived status, KHÔNG dùng thẳng batch.status cho nhãn ---

test('khach-hang/page.tsx: badge Import History dùng deriveImportBatchDisplayStatus(batch), không còn so sánh trực tiếp batch.status === \'completed\'/\'processing\' để quyết định nhãn', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /import \{ deriveImportBatchDisplayStatus \} from '@\/lib\/import-batch-display-status';/);
  const badgeBlockStart = src.indexOf('const displayStatus = deriveImportBatchDisplayStatus(batch);');
  assert.ok(badgeBlockStart >= 0, 'phải gọi deriveImportBatchDisplayStatus(batch) để lấy nhãn hiển thị');
  const badgeBlockEnd = src.indexOf('})()', badgeBlockStart);
  const badgeBlock = src.slice(badgeBlockStart, badgeBlockEnd);
  assert.match(badgeBlock, /'Bị gián đoạn'/);
  assert.match(badgeBlock, /displayStatus === 'completed' \? 'Hoàn tất'/);
  assert.match(badgeBlock, /displayStatus === 'processing' \? 'Đang xử lý…'/);
});

test('khach-hang/page.tsx: fetch Import History (openImportHistory) KHÔNG bị đổi — vẫn gọi nguyên GET /api/khach-hang/import-batches, không có endpoint/side-effect ghi nào mới cho việc hiển thị stale', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const fnStart = src.indexOf('const openImportHistory = async () => {');
  const fnEnd = src.indexOf('\n  };', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert.match(fnBody, /fetch\('\/api\/khach-hang\/import-batches'\)/);
  assert.doesNotMatch(fnBody, /method:\s*'(POST|PUT|PATCH|DELETE)'/i, 'mở Lịch sử Import không được có bất kỳ request ghi nào');
});

// --- C. Stale batch vẫn giữ mọi hành động/provenance hiện có (không bị display status chặn) ---

test('khach-hang/page.tsx: nút "Xem chi tiết & Xóa" và "Gán Dataset" (khi chưa có dataset) KHÔNG bị gate theo displayStatus/status — batch stale vẫn xem chi tiết/backfill Dataset được, chỉ nhãn đổi', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const actionsBlockStart = src.indexOf("<button className=\"btn btn-secondary btn-sm\" onClick={() => openBatchDetail(batch.id)}>");
  assert.ok(actionsBlockStart >= 0);
  const actionsBlock = src.slice(actionsBlockStart, actionsBlockStart + 400);
  assert.doesNotMatch(actionsBlock, /displayStatus|batch\.status/, 'các nút hành động của batch không được điều kiện theo status/displayStatus');
});

test('import-batch.ts: completeImportBatch/checkpointImportBatchCounts/createImportBatch KHÔNG bị đụng bởi milestone này — không có code path mới nào tự set status="completed" cho batch stale (chỉ sửa hiển thị, không sửa ghi DB)', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/import-batch.ts'), 'utf8');
  assert.doesNotMatch(src, /deriveImportBatchDisplayStatus|stale|Stale|STALE/, 'import-batch.ts (lib ghi DB) không được biết gì về khái niệm stale — đây là logic hiển thị thuần, sống ở lib pure riêng');
});

test('createImportBatch/checkpointImportBatchCounts/completeImportBatch không hề bị sửa số liệu (created_count/duplicate_count/invalid_count) trong milestone này — audit HLX cho thấy created_count có thể lệch actual, nhưng KHÔNG được tự reconcile ở đây', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/import-batch.ts'), 'utf8');
  // Không có bất kỳ lệnh update/reconcile số liệu nào ngoài 2 hàm đã có từ trước (checkpoint/complete) — không thêm hàm ghi mới.
  const updateMatches = src.match(/prisma\.crmImportBatch\.update\(/g) || [];
  assert.equal(updateMatches.length, 2, 'chỉ đúng 2 lệnh update (checkpointImportBatchCounts + completeImportBatch) như trước milestone này — không thêm reconcile mới');
});

// --- D. Dataset count UX: hiển thị đúng số Customer theo Dataset đang lọc, dùng filteredTotal (authority server, không đếm dòng trên trang) ---

test('khach-hang/page.tsx: label Dataset count CHỈ hiện khi có datasetFilter, dùng filteredTotal (KHÔNG phải total, KHÔNG đếm data.length của trang hiện tại)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const labelStart = src.indexOf('{datasetFilter && (');
  assert.ok(labelStart >= 0, 'phải có block hiển thị Dataset count khi datasetFilter được chọn');
  const labelBlock = src.slice(labelStart, labelStart + 300);
  assert.match(labelBlock, /\{filteredTotal\} khách/);
  assert.doesNotMatch(labelBlock, /data\.length/, 'không được đếm bằng số dòng đang render trên trang');
});

test('khach-hang/page.tsx: label Dataset count nằm TRONG cùng khối {datasets.length > 0 && (...)} với <select> Dataset filter — không phải 1 UI tách rời có thể lệch trạng thái với dropdown', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const blockStart = src.indexOf('{datasets.length > 0 && (');
  assert.ok(blockStart >= 0);
  const selectIdx = src.indexOf('<select', blockStart);
  const labelIdx = src.indexOf('{datasetFilter && (', blockStart);
  assert.ok(selectIdx > blockStart && labelIdx > selectIdx, 'label count phải nằm ngay sau <select> Dataset, trong cùng khối điều kiện');
});

test('route.ts (GET /api/khach-hang): filteredTotal (nguồn của Dataset count UX) tiếp tục kết hợp ĐÚNG cả campaignStatus lẫn datasetId — không regression từ milestone Dataset trước (giữ nguyên hành vi đã khoá)', () => {
  const src = readFileSync(resolve(KHACH_HANG_ROUTE_PATH), 'utf8');
  const campaignFilterIdx = src.indexOf('data = data.filter(kh => matchesCampaignStatusFilter(');
  const datasetFilterIdx = src.indexOf('if (datasetId) data = data.filter(');
  const filteredTotalIdx = src.indexOf('const filteredTotal = data.length;');
  assert.ok(campaignFilterIdx >= 0 && datasetFilterIdx > campaignFilterIdx && filteredTotalIdx > datasetFilterIdx);
});

test('regression: fetchData dependency array vẫn gồm cả campaignStatus và datasetFilter (không bị milestone này thu hẹp lại)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /\}, \[page, search, fromDate, toDate, campaignStatus, datasetFilter\]\);/);
});

test('regression: Dataset range (resolveCustomerIdsByRange datasetId) và CampaignDistributeModal forwarding datasetFilter không bị đụng bởi milestone hiển thị này', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /customerFilter=\{selectAllMatching \? \{ search, from: fromDate, to: toDate, datasetId: datasetFilter \|\| undefined, count: total \} : undefined\}/);
  assert.match(src, /customerRange=\{\{ from: rangeFromNum, to: rangeToNum, search, dateFrom: fromDate, dateTo: toDate, datasetId: datasetFilter \|\| undefined, count: rangeValidation\.count \}\}/);
});
