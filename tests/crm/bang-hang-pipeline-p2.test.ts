import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// BANG_HANG_PIPELINE_P2 — /api/stacking (buildPipelineStatusMap) trước đây
// gọi getPipeline() (full ~32 cột Pipeline, toàn bộ bảng) chỉ để đọc 3 field
// (ma_can/giai_doan/id_du_an) cho việc suy ra trạng thái Còn hàng/Đang xem/
// Đã bán + lọc theo dự án. Thay bằng getPipelineStatusFields() (narrow
// select). KHÔNG đổi:
//   - buildPipelineStatusMap logic (thân hàm giữ NGUYÊN, chỉ đổi kiểu tham số)
//   - TMB (không đụng TmbMap.tsx/tmb-map-data.ts/static assets)
//   - getDuAn()/Project repository (audit xác định LOW risk, KHÔNG thuộc P2 này)
// File này test phần THỰC SỰ đổi: query shape (1/2) + wiring (3) + global
// getPipeline() bất biến (4) + semantics tương đương (5) + cache/fallback (6/7).

const PIPELINE_REPO_PATH = 'src/lib/repository/postgresql/pipeline.repo.ts';
const GS_PIPELINE_REPO_PATH = 'src/lib/repository/google-sheets/pipeline.repo.ts';
const INTERFACES_PATH = 'src/lib/repository/interfaces.ts';
const DATA_ACCESS_PATH = 'src/lib/data-access.ts';
const STACKING_ROUTE_PATH = 'src/app/api/stacking/route.ts';

// ─── 1/2. Postgres narrow select — EXACTLY ma_can/giai_doan/id_du_an ───────

test('postgresql/pipeline.repo.ts: findStatusFields() dùng select CHÍNH XÁC {ma_can, giai_doan, id_du_an} — không field nào khác, không phải full findAll()', () => {
  const src = readFileSync(resolve(PIPELINE_REPO_PATH), 'utf8');
  const start = src.indexOf('async findStatusFields()');
  assert.ok(start >= 0, 'findStatusFields() phải tồn tại trong PostgresPipelineRepository');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  assert.match(body, /select:\s*\{\s*ma_can:\s*true,\s*giai_doan:\s*true,\s*id_du_an:\s*true\s*\}/);
  const trueCount = (body.match(/:\s*true/g) || []).length;
  assert.equal(trueCount, 3, 'select chỉ được đúng 3 field (ma_can/giai_doan/id_du_an), không thêm field nào "vì tiện"');
  assert.doesNotMatch(body, /orderBy/, 'findStatusFields() không cần orderBy — chỉ dùng để build Map lookup theo mã căn');
});

test('postgresql/pipeline.repo.ts: findAll() (dùng bởi getPipeline() global) KHÔNG bị đổi — vẫn full findMany không select', () => {
  const src = readFileSync(resolve(PIPELINE_REPO_PATH), 'utf8');
  const start = src.indexOf('async findAll()');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  assert.match(body, /prisma\.pipeline\.findMany\(\{\s*orderBy:\s*\{\s*ngay_cap_nhat:\s*'desc'\s*\}\s*\}\)/);
  assert.doesNotMatch(body, /select:/, 'findAll() phải giữ NGUYÊN — không được thêm select() vào global getPipeline()');
});

test('google-sheets/pipeline.repo.ts: findStatusFields() implement đủ interface (GS vẫn chưa có projection thật -> map trong JS từ getPipeline())', () => {
  const src = readFileSync(resolve(GS_PIPELINE_REPO_PATH), 'utf8');
  const start = src.indexOf('async findStatusFields()');
  assert.ok(start >= 0, 'GoogleSheetsPipelineRepository phải implement findStatusFields() (interface IPipelineRepository yêu cầu)');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  assert.match(body, /ma_can:\s*p\.ma_can/);
  assert.match(body, /giai_doan:\s*p\.giai_doan/);
  assert.match(body, /id_du_an:\s*p\.id_du_an/);
});

test('repository/interfaces.ts: IPipelineRepository khai báo findStatusFields(); PipelineStatusFields = Pick<Pipeline, ma_can|giai_doan|id_du_an> (không field nào khác)', () => {
  const src = readFileSync(resolve(INTERFACES_PATH), 'utf8');
  assert.match(src, /findStatusFields\(\): Promise<PipelineStatusFields\[\]>;/);
  assert.match(src, /export type PipelineStatusFields = Pick<Pipeline,\s*'ma_can' \| 'giai_doan' \| 'id_du_an'>;/);
});

test('data-access.ts: _pgPipelineStatusFields dùng CÙNG tag "pl" với _pgPipeline — addPipeline/updatePipeline/deletePipeline (revalidateTag(\'pl\')) vẫn invalidate cả 2 cache, không có invalidation path mới', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  assert.match(src, /_pgPipelineStatusFields\s*=\s*unstable_cache\(\(\) => getPipelineRepository\(\)\.findStatusFields\(\),\s*\['pl-status-fields'\],\s*\{ revalidate: 30, tags: \['pl'\] \}\)/);
});

// ─── 4. getPipeline() global KHÔNG đổi ──────────────────────────────────────

test('data-access.ts: getPipeline() giữ NGUYÊN — vẫn còn "empty replica" fallback, tồn tại độc lập với getPipelineStatusFields()', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  assert.match(src, /export async function getPipeline\(\): Promise<Pipeline\[\]>/);
  assert.match(src, /export async function getPipelineStatusFields\(\): Promise<PipelineStatusFields\[\]>/);
  const start = src.indexOf('export async function getPipelineStatusFields');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end);
  assert.match(body, /rows\.length > 0/);
  assert.match(body, /empty replica, falling back to GS/);
  assert.match(body, /catch \(e\)/);
  const pgBranchStart = body.indexOf('try {');
  const pgBranchBody = body.slice(pgBranchStart);
  assert.doesNotMatch(pgBranchBody, /await getPipeline\(\)/, 'nhánh PG-enabled fallback phải gọi GS.getPipeline() trực tiếp, không gọi lại getPipeline() (facade)');
});

// ─── 3. /api/stacking wiring ────────────────────────────────────────────────

test('api/stacking/route.ts: dùng getPipelineStatusFields(), không còn getPipeline() — cả 2 call site (mode=list và mode=grid)', () => {
  const src = readFileSync(resolve(STACKING_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /\bgetPipeline\(\)/);
  const callCount = (src.match(/getPipelineStatusFields\(\)/g) || []).length;
  assert.equal(callCount, 2, 'phải có đúng 2 lời gọi getPipelineStatusFields() — mode=list và chế độ Lưới');
});

test('api/stacking/route.ts: buildPipelineStatusMap() thân hàm KHÔNG đổi logic — chỉ đổi kiểu tham số pipelines từ Pipeline[] sang PipelineStatusFields[]', () => {
  const src = readFileSync(resolve(STACKING_ROUTE_PATH), 'utf8');
  const sigStart = src.indexOf('function buildPipelineStatusMap(');
  assert.ok(sigStart >= 0);
  assert.match(src.slice(sigStart, sigStart + 200), /pipelines:\s*PipelineStatusFields\[\]/);
  // Thân hàm (từ "const projectDuAnIds" tới "return pipelineMap") phải khớp
  // BYTE-IDENTICAL với bản trước khi narrow — bằng chứng mạnh nhất "0 ký tự
  // logic nào bị đổi", không chỉ tuyên bố suông.
  const bodyStart = src.indexOf('const projectDuAnIds = new Set(', sigStart);
  const bodyEnd = src.indexOf('return pipelineMap;\n}', bodyStart) + 'return pipelineMap;\n}'.length;
  const body = src.slice(bodyStart, bodyEnd);
  const expectedBody = `const projectDuAnIds = new Set(
    projectCode
      ? duAnList.filter(da => da.ma_du_an?.trim().toUpperCase() === projectCode.trim().toUpperCase()).map(da => da.id_du_an)
      : [],
  );
  const filteredPipelines = projectDuAnIds.size > 0
    ? pipelines.filter(p => p.id_du_an && projectDuAnIds.has(p.id_du_an))
    : pipelines;

  // ⚠ ma_can trong pipeline phải khớp ĐÚNG mã căn hiển thị (VD "AS83-14" cho
  // biệt thự, "B1-12-16A" cho chung cư — 2 quy ước khác nhau, join chỉ dựa
  // vào so khớp chuỗi, không phụ thuộc format). Ưu tiên giai đoạn cao nhất:
  // Ký HĐ > các giai đoạn khác.
  const pipelineMap = new Map<string, string>();
  for (const p of filteredPipelines) {
    if (!p.ma_can) continue;
    const existing = pipelineMap.get(p.ma_can);
    if (!existing || p.giai_doan === 'Ký HĐ' || existing === 'con_hang') {
      pipelineMap.set(p.ma_can, p.giai_doan);
    }
  }
  return pipelineMap;
}`;
  assert.equal(body, expectedBody, 'buildPipelineStatusMap thân hàm phải BYTE-IDENTICAL với bản trước P2 — chỉ kiểu tham số được phép đổi');
});

// ─── 5. Semantics equivalence — literal mirror của buildPipelineStatusMap đã
// chứng minh byte-identical ở trên, chạy qua các case đại diện. ─────────────

interface StatusFields { ma_can?: string; giai_doan: string; id_du_an: string }
interface DuAnRef { id_du_an: string; ma_du_an?: string }

function buildPipelineStatusMap(pipelines: StatusFields[], duAnList: DuAnRef[], projectCode?: string): Map<string, string> {
  const projectDuAnIds = new Set(
    projectCode
      ? duAnList.filter(da => da.ma_du_an?.trim().toUpperCase() === projectCode.trim().toUpperCase()).map(da => da.id_du_an)
      : [],
  );
  const filteredPipelines = projectDuAnIds.size > 0
    ? pipelines.filter(p => p.id_du_an && projectDuAnIds.has(p.id_du_an))
    : pipelines;
  const pipelineMap = new Map<string, string>();
  for (const p of filteredPipelines) {
    if (!p.ma_can) continue;
    const existing = pipelineMap.get(p.ma_can);
    if (!existing || p.giai_doan === 'Ký HĐ' || existing === 'con_hang') {
      pipelineMap.set(p.ma_can, p.giai_doan);
    }
  }
  return pipelineMap;
}
function stageToTrangThai(stage: string | undefined): 'con_hang' | 'dang_xem' | 'da_ban' {
  return !stage ? 'con_hang' : stage === 'Ký HĐ' ? 'da_ban' : 'dang_xem';
}

test('5a. available: mã căn không có trong Pipeline -> con_hang', () => {
  const map = buildPipelineStatusMap([{ ma_can: 'A1-01', giai_doan: 'Đặt cọc', id_du_an: 'DA1' }], []);
  assert.equal(stageToTrangThai(map.get('A1-99')), 'con_hang');
});

test('5b. viewing/in pipeline: mã căn có giai_doan khác "Ký HĐ" -> dang_xem', () => {
  const map = buildPipelineStatusMap([{ ma_can: 'A1-01', giai_doan: 'Đặt cọc', id_du_an: 'DA1' }], []);
  assert.equal(stageToTrangThai(map.get('A1-01')), 'dang_xem');
});

test('5c. sold: giai_doan = "Ký HĐ" -> da_ban, và ưu tiên Ký HĐ dù xuất hiện sau trong danh sách', () => {
  const map = buildPipelineStatusMap([
    { ma_can: 'A1-02', giai_doan: 'Đặt cọc', id_du_an: 'DA1' },
    { ma_can: 'A1-02', giai_doan: 'Ký HĐ', id_du_an: 'DA1' },
  ], []);
  assert.equal(stageToTrangThai(map.get('A1-02')), 'da_ban');
});

test('5d. project matching: pipeline dự án khác bị lọc ra khi projectCode khớp đúng 1 dự án', () => {
  const duAnList = [{ id_du_an: 'DA1', ma_du_an: 'HLX' }, { id_du_an: 'DA2', ma_du_an: 'VHSGP' }];
  const pipelines = [
    { ma_can: 'X-01', giai_doan: 'Ký HĐ', id_du_an: 'DA2' }, // dự án khác (VHSGP), phải bị loại khi lọc theo HLX
    { ma_can: 'Y-01', giai_doan: 'Ký HĐ', id_du_an: 'DA1' },
  ];
  const map = buildPipelineStatusMap(pipelines, duAnList, 'HLX');
  assert.equal(map.has('X-01'), false, 'mã căn thuộc dự án khác không được lẫn vào kết quả lọc theo project');
  assert.equal(map.get('Y-01'), 'Ký HĐ');
});

test('5e. project matching: projectCode không khớp DU_AN nào -> dùng toàn bộ pipeline (backward compat)', () => {
  const duAnList = [{ id_du_an: 'DA1', ma_du_an: 'HLX' }];
  const pipelines = [{ ma_can: 'Z-01', giai_doan: 'Ký HĐ', id_du_an: 'DA1' }];
  const map = buildPipelineStatusMap(pipelines, duAnList, 'KHONG_TON_TAI');
  assert.equal(map.get('Z-01'), 'Ký HĐ', 'projectCode lạ không được làm mất dữ liệu — fallback dùng toàn bộ pipeline');
});

test('5f. mã căn rỗng/undefined bị bỏ qua, không tạo entry rác trong map', () => {
  const map = buildPipelineStatusMap([{ ma_can: undefined, giai_doan: 'Ký HĐ', id_du_an: 'DA1' }], []);
  assert.equal(map.size, 0);
});

// ─── 6/7. Cache + empty-replica fallback tương thích getPipeline() ─────────

test('6. getPipelineStatusFields(): cùng cấu trúc PG->GS fallback + empty-replica check với getPipeline() (an toàn cho delete-guard/status-annotation trước khi PG sync xong lần đầu)', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  const getPipelineStart = src.indexOf('export async function getPipeline(): Promise<Pipeline[]>');
  const getPipelineEnd = src.indexOf('\n}', getPipelineStart);
  const getPipelineBody = src.slice(getPipelineStart, getPipelineEnd);

  const narrowStart = src.indexOf('export async function getPipelineStatusFields');
  const narrowEnd = src.indexOf('\n}', narrowStart);
  const narrowBody = src.slice(narrowStart, narrowEnd);

  for (const marker of ['isPostgresEnabled(\'crm\')', 'rows.length > 0', 'empty replica, falling back to GS', 'catch (e)']) {
    assert.ok(getPipelineBody.includes(marker), `getPipeline() phải có marker "${marker}"`);
    assert.ok(narrowBody.includes(marker), `getPipelineStatusFields() phải có marker "${marker}" tương thích getPipeline()`);
  }
});

test('7. _pgPipelineStatusFields revalidate 30s — khớp _pgPipeline (không đổi đặc tính staleness đã có)', () => {
  const src = readFileSync(resolve(DATA_ACCESS_PATH), 'utf8');
  assert.match(src, /_pgPipeline\s*=\s*unstable_cache\(\(\) => getPipelineRepository\(\)\.findAll\(\),\s*\['pl'\],\s*\{ revalidate: 30,\s*tags: \['pl'\]\s*\}\)/);
  assert.match(src, /_pgPipelineStatusFields\s*=\s*unstable_cache\(\(\) => getPipelineRepository\(\)\.findStatusFields\(\),\s*\['pl-status-fields'\],\s*\{ revalidate: 30, tags: \['pl'\] \}\)/);
});

// ─── Out-of-scope confirmation ──────────────────────────────────────────────

test('getDuAn() KHÔNG bị đụng — vẫn gọi nguyên trong api/stacking/route.ts (audit xác định LOW risk, ngoài scope P2 này)', () => {
  const src = readFileSync(resolve(STACKING_ROUTE_PATH), 'utf8');
  const callCount = (src.match(/getDuAn\(\)/g) || []).length;
  assert.equal(callCount, 2, 'getDuAn() phải vẫn còn nguyên 2 lời gọi, không bị optimize trong P2 này');
});

test('TMB không bị đụng — TmbMap.tsx/tmb-map-data.ts không xuất hiện trong diff scope của P2 (kiểm tra gián tiếp: route.ts P2 không import gì từ stacking/Tmb*)', () => {
  const src = readFileSync(resolve(STACKING_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(src, /TmbMap|tmb-map-data|staticBackgroundImageUrl/);
});
