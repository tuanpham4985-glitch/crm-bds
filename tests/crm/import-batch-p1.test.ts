import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { customerDeleteBlockReason } from '../../src/lib/crm-auth';
import { planBulkDelete } from '../../src/lib/khach-hang-bulk-delete';
import type { ImportBatchCustomerRefFields } from '../../src/lib/crm-funnel/import-batch';

// IMPORT_BATCH_P1 — Import Batch detail (import-batches/[id]/route.ts) và
// delete-preflight (.../delete/route.ts) trước đây gọi getPipeline() (full
// ~32 cột Pipeline, toàn bộ bảng) + getImportBatchCustomers() không select
// (full ~44 cột KhachHang) chỉ để dùng 1 field Pipeline (id_khach_hang) và 8
// field KhachHang (4 cho response UI + 4 cho customerDeleteBlockReason).
// Thay bằng getPipelineCustomerRefFields() (narrow) + select() trong
// getImportBatchCustomers(). KHÔNG đổi:
//   - customerDeleteBlockReason logic (chỉ đổi KIỂU tham số, không đổi thân hàm)
//   - planBulkDelete logic (chỉ đổi KIỂU tham số, không đổi thân hàm)
//   - eligibility/blockReason semantics
// File này test phần THỰC SỰ đổi: query shape (G/H) + type-compat hai chiều
// (caller cũ truyền full KhachHang/Pipeline vẫn chạy được, caller mới truyền
// narrow projection cũng chạy được) + behavior tương đương (A-F).

const PIPELINE_REPO_PATH = 'src/lib/repository/postgresql/pipeline.repo.ts';
const GS_PIPELINE_REPO_PATH = 'src/lib/repository/google-sheets/pipeline.repo.ts';
const INTERFACES_PATH = 'src/lib/repository/interfaces.ts';
const DATA_ACCESS_PATH = 'src/lib/data-access.ts';
const IMPORT_BATCH_PATH = 'src/lib/crm-funnel/import-batch.ts';
const DETAIL_ROUTE_PATH = 'src/app/api/khach-hang/import-batches/[id]/route.ts';
const DELETE_ROUTE_PATH = 'src/app/api/khach-hang/import-batches/[id]/delete/route.ts';
const CRM_AUTH_PATH = 'src/lib/crm-auth.ts';
const BULK_DELETE_PATH = 'src/lib/khach-hang-bulk-delete.ts';

// ─── G. Pipeline narrow query selects EXACTLY id_khach_hang ────────────────

test('postgresql/pipeline.repo.ts: findCustomerRefs() dùng select CHÍNH XÁC {id_khach_hang: true} — không select field nào khác, không phải full findAll()', () => {
  const src = readFileSync(resolve(PIPELINE_REPO_PATH), 'utf8');
  const start = src.indexOf('async findCustomerRefs()');
  assert.ok(start >= 0, 'findCustomerRefs() phải tồn tại trong PostgresPipelineRepository');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  assert.match(body, /select:\s*\{\s*id_khach_hang:\s*true\s*\}/);
  const trueCount = (body.match(/:\s*true/g) || []).length;
  assert.equal(trueCount, 1, 'select chỉ được đúng 1 field (id_khach_hang), không thêm field nào khác');
  assert.doesNotMatch(body, /orderBy/, 'findCustomerRefs() không cần orderBy — chỉ dùng để build Set/membership check');
});

test('postgresql/pipeline.repo.ts: findAll() (dùng bởi getPipeline() global) KHÔNG bị đổi — vẫn full findMany không select', () => {
  const src = readFileSync(resolve(PIPELINE_REPO_PATH), 'utf8');
  const start = src.indexOf('async findAll()');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  assert.match(body, /prisma\.pipeline\.findMany\(\{\s*orderBy:\s*\{\s*ngay_cap_nhat:\s*'desc'\s*\}\s*\}\)/);
  assert.doesNotMatch(body, /select:/, 'findAll() phải giữ NGUYÊN — không được thêm select() vào global getPipeline()');
});

test('google-sheets/pipeline.repo.ts: findCustomerRefs() implement đủ interface (GS vẫn chưa có projection thật -> map trong JS từ getPipeline())', () => {
  const src = readFileSync(resolve(GS_PIPELINE_REPO_PATH), 'utf8');
  const start = src.indexOf('async findCustomerRefs()');
  assert.ok(start >= 0, 'GoogleSheetsPipelineRepository phải implement findCustomerRefs() (interface IPipelineRepository yêu cầu)');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  assert.match(body, /id_khach_hang:\s*p\.id_khach_hang/);
});

test('repository/interfaces.ts: IPipelineRepository khai báo findCustomerRefs(); PipelineCustomerRefFields = Pick<Pipeline, id_khach_hang> (không field nào khác)', () => {
  const src = readFileSync(resolve(INTERFACES_PATH), 'utf8');
  assert.match(src, /findCustomerRefs\(\): Promise<PipelineCustomerRefFields\[\]>;/);
  assert.match(src, /export type PipelineCustomerRefFields = Pick<Pipeline,\s*'id_khach_hang'>;/);
});

test('data-access.ts: getPipelineCustomerRefFields() KHÔNG đổi getPipeline() — 2 hàm tồn tại độc lập, getPipeline() vẫn còn nguyên "empty replica" fallback', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  assert.match(src, /export async function getPipeline\(\): Promise<Pipeline\[\]>/);
  assert.match(src, /export async function getPipelineCustomerRefFields\(\): Promise<PipelineCustomerRefFields\[\]>/);
  const start = src.indexOf('export async function getPipelineCustomerRefFields');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  // Cùng safety net "empty replica -> fallback GS" như getPipeline() (cùng bảng, cùng rủi ro).
  assert.match(body, /rows\.length > 0/);
  assert.match(body, /empty replica, falling back to GS/);
  assert.match(body, /catch \(e\)/);
  // KHÔNG được gọi lại getPipeline() bên trong nhánh PG-enabled (sẽ retry lại đúng lỗi/empty vừa fail).
  const pgBranchStart = body.indexOf('try {');
  const pgBranchBody = body.slice(pgBranchStart);
  assert.doesNotMatch(pgBranchBody, /await getPipeline\(\)/, 'nhánh PG-enabled fallback phải gọi GS.getPipeline() trực tiếp, không gọi lại getPipeline() (facade)');
});

test('data-access.ts: _pgPipelineCustomerRefFields dùng CÙNG tag "pl" với _pgPipeline — addPipeline/updatePipeline/deletePipeline (revalidateTag(\'pl\')) vẫn invalidate cả 2 cache, không có invalidation path mới', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  assert.match(src, /_pgPipelineCustomerRefFields\s*=\s*unstable_cache\(\(\) => getPipelineRepository\(\)\.findCustomerRefs\(\),\s*\['pl-customer-ref-fields'\],\s*\{ revalidate: 30, tags: \['pl'\] \}\)/);
});

// ─── H. Import Batch Customer query selects EXACTLY the audited 8 fields ───

test('crm-funnel/import-batch.ts: getImportBatchCustomers() dùng select CHÍNH XÁC 8 field đã audit — không field nào khác, giữ nguyên where: import_batch_id', () => {
  const src = readFileSync(resolve(IMPORT_BATCH_PATH), 'utf8');
  const start = src.indexOf('export async function getImportBatchCustomers');
  assert.ok(start >= 0);
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  assert.match(body, /where:\s*\{\s*import_batch_id:\s*batchId\s*\}/, 'phải giữ nguyên filter theo batch — KHÔNG suy diễn theo filename/thời gian');
  const selectStart = body.indexOf('select: {');
  const selectEnd = body.indexOf('},', selectStart);
  const selectBody = body.slice(selectStart, selectEnd);
  for (const field of [
    'id_khach_hang', 'ten_KH', 'so_dien_thoai', 'email',
    'so_lan_lien_he', 'lich_su_cham_soc', 'lich_su_ban_giao', 'trang_thai_ban_giao',
  ]) {
    assert.match(selectBody, new RegExp(`${field}:\\s*true`), `select phải có field ${field}`);
  }
  const trueCount = (selectBody.match(/:\s*true/g) || []).length;
  assert.equal(trueCount, 8, 'select chỉ được đúng 8 field đã audit, không thêm field nào "vì tiện"');
});

test('crm-funnel/import-batch.ts: không còn IMPORT toKhachHang() (full-shape mapper) — narrow select tự map trong hàm, không cần mapper cũ nữa', () => {
  const src = readFileSync(resolve(IMPORT_BATCH_PATH), 'utf8');
  assert.doesNotMatch(src, /^import.*toKhachHang/m, 'import toKhachHang phải được gỡ (không dùng, sẽ là dead import) — comment nhắc tên hàm cũ để giải thích lịch sử vẫn OK');
});

// ─── Wiring: cả 2 route Import Batch không còn gọi getPipeline() ───────────

test('import-batches/[id]/route.ts (GET detail): dùng getPipelineCustomerRefFields(), không còn getPipeline()', () => {
  const src = readFileSync(resolve(DETAIL_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /\bgetPipeline\(\)/);
  assert.match(src, /getPipelineCustomerRefFields\(\)/);
});

test('import-batches/[id]/delete/route.ts (POST delete-preflight): dùng getPipelineCustomerRefFields(), không còn getPipeline()', () => {
  const src = readFileSync(resolve(DELETE_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /\bgetPipeline\(\)/);
  assert.match(src, /getPipelineCustomerRefFields\(\)/);
});

test('bulk-delete/route.ts (regular bulk-delete, NGOÀI SCOPE P1) vẫn dùng getPipeline() như cũ — KHÔNG bị đụng bởi P1', () => {
  const src = readFileSync(resolve('src/app/api/khach-hang/bulk-delete/route.ts'), 'utf8');
  assert.match(src, /getPipeline\(\)/, 'route ngoài scope phải giữ NGUYÊN hành vi cũ, không bị optimize lây');
});

// ─── Type-compat: crm-auth.ts / khach-hang-bulk-delete.ts đổi KIỂU, không đổi LOGIC ─

test('crm-auth.ts: customerDeleteBlockReason() thân hàm KHÔNG đổi — chỉ đổi kiểu tham số (CustomerDeleteGuardFields/PipelineCustomerRefFields)', () => {
  const src = readFileSync(resolve(CRM_AUTH_PATH), 'utf8');
  const start = src.indexOf('export function customerDeleteBlockReason');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  assert.match(body, /customer:\s*CustomerDeleteGuardFields/);
  assert.match(body, /pipelines:\s*readonly PipelineCustomerRefFields\[\]/);
  // Logic 3 nhánh block-reason giữ nguyên y hệt.
  assert.match(body, /hasCrmHistory \|\| customer\.trang_thai_ban_giao !== 'Chưa bàn giao' \|\| pipelines\.some\(pipeline => pipeline\.id_khach_hang === customer\.id_khach_hang\)/);
  assert.match(body, /campaignMemberships\.some\(membership => membership\.customer_id === customer\.id_khach_hang\)/);
});

test('khach-hang-bulk-delete.ts: planBulkDelete() thân hàm KHÔNG đổi logic — chỉ đổi kiểu tham số, bỏ cast "as Pipeline[]" không còn cần thiết', () => {
  const src = readFileSync(resolve(BULK_DELETE_PATH), 'utf8');
  assert.doesNotMatch(src, /as Pipeline\[\]/, 'cast không còn cần thiết sau khi pipelines đã đúng kiểu PipelineCustomerRefFields[]');
  const start = src.indexOf('export function planBulkDelete');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  assert.match(body, /customers:\s*readonly BulkDeleteCustomerFields\[\]/);
  assert.match(body, /pipelines:\s*readonly PipelineCustomerRefFields\[\]/);
  assert.match(body, /customerDeleteBlockReason\(customer, pipelines, campaignMemberships\)/);
});

// ─── A/B/C/D. Behavior equivalence — dùng ĐÚNG narrow shape (ImportBatchCustomerRefFields), không phải KhachHang giả lập full field ─

function narrowCustomer(overrides: Partial<ImportBatchCustomerRefFields> = {}): ImportBatchCustomerRefFields {
  return {
    id_khach_hang: 'KH1', ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0901234567', email: '',
    so_lan_lien_he: 0, lich_su_cham_soc: '[]', lich_su_ban_giao: '[]', trang_thai_ban_giao: 'Chưa bàn giao',
    ...overrides,
  };
}

test('A. Customer có Pipeline membership vẫn PROTECTED (blocked) khi dùng narrow ImportBatchCustomerRefFields + narrow PipelineCustomerRefFields', () => {
  const customer = narrowCustomer({ id_khach_hang: 'KH_PIPELINE' });
  const pipelines = [{ id_khach_hang: 'KH_PIPELINE' }];
  const reason = customerDeleteBlockReason(customer, pipelines);
  assert.ok(reason, 'customer đang có deal trong Pipeline phải bị chặn xóa');
});

test('B. Customer có Campaign Membership vẫn PROTECTED (blocked) — semantics không đổi sau khi narrow customer/pipeline', () => {
  const customer = narrowCustomer({ id_khach_hang: 'KH_CAMPAIGN' });
  const reason = customerDeleteBlockReason(customer, [], [{ customer_id: 'KH_CAMPAIGN' }]);
  assert.ok(reason, 'customer đã tham gia Campaign phải bị chặn xóa');
  assert.match(reason!, /Campaign/);
});

test('C. Lịch sử CRM (so_lan_lien_he/lich_su_cham_soc/lich_su_ban_giao) và Handoff (trang_thai_ban_giao) vẫn PROTECTED đúng như trước — coalescing 8-field select giống hệt toKhachHang() cũ', () => {
  assert.ok(customerDeleteBlockReason(narrowCustomer({ so_lan_lien_he: 2 }), []), 'so_lan_lien_he > 0 phải chặn');
  assert.ok(customerDeleteBlockReason(narrowCustomer({ lich_su_cham_soc: '[{"x":1}]' }), []), 'lich_su_cham_soc khác "[]" phải chặn');
  assert.ok(customerDeleteBlockReason(narrowCustomer({ lich_su_ban_giao: '[{"x":1}]' }), []), 'lich_su_ban_giao khác "[]" phải chặn');
  assert.ok(customerDeleteBlockReason(narrowCustomer({ trang_thai_ban_giao: 'Đã nhận' }), []), 'đã handoff phải chặn');
});

test('D. Customer sạch (không lịch sử/pipeline/campaign) vẫn ELIGIBLE (deletable) — không bị chặn oan bởi narrow select', () => {
  const customer = narrowCustomer({ id_khach_hang: 'KH_CLEAN' });
  const reason = customerDeleteBlockReason(customer, [], []);
  assert.equal(reason, null);
});

// ─── F. Delete preflight/plan (planBulkDelete) tương đương khi feed bằng dữ liệu narrow đúng shape route thật sự truyền vào ─

test('F. planBulkDelete: mixed batch narrow-shape (ImportBatchCustomerRefFields[]) cho kết quả tương đương full-shape cũ — 1 blocked (Pipeline), 1 ready', () => {
  const customers: ImportBatchCustomerRefFields[] = [
    narrowCustomer({ id_khach_hang: 'KH_CLEAN', ten_KH: 'Khách sạch' }),
    narrowCustomer({ id_khach_hang: 'KH_PIPELINE', ten_KH: 'Khách có deal' }),
  ];
  const pipelines = [{ id_khach_hang: 'KH_PIPELINE' }];
  const { ids, items } = planBulkDelete(['KH_CLEAN', 'KH_PIPELINE'], customers, pipelines, []);
  assert.deepEqual(ids, ['KH_CLEAN', 'KH_PIPELINE']);
  assert.equal(items.find(i => i.id === 'KH_CLEAN')?.status, 'ready');
  assert.equal(items.find(i => i.id === 'KH_PIPELINE')?.status, 'blocked');
});

test('F. planBulkDelete: id không tồn tại trong batch narrow -> not_found, không suy diễn xóa nhầm (regression guard, giống hệt full-shape trước đây)', () => {
  const customers: ImportBatchCustomerRefFields[] = [narrowCustomer({ id_khach_hang: 'KH_REAL' })];
  const { items } = planBulkDelete(['KH_GHOST'], customers, []);
  assert.equal(items[0].status, 'not_found');
});
