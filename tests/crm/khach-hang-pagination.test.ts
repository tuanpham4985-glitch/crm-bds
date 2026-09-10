import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// Batch 2 Part A — GET /api/khach-hang: pagination/filter thật trên Postgres
// (WHERE/count/skip/take) thay vì getKhachHang() nguyên bảng -> JS filter ->
// slice. Nhánh Google Sheets (isPostgresEnabled('crm') === false) PHẢI giữ
// NGUYÊN 100% code cũ. Đúng convention repo hiện có: đọc SOURCE THẬT + assert
// cấu trúc/wiring bằng regex (không có jsdom/RTL, không cần DB thật).

const routeSrc = readFileSync(resolve('src/app/api/khach-hang/route.ts'), 'utf8');

test('route.ts: GET branch theo isPostgresEnabled(\'crm\') — nhánh Postgres dùng prisma.khachHang trực tiếp, nhánh else giữ nguyên getKhachHang() + JS filter cũ', () => {
  assert.match(routeSrc, /if \(isPostgresEnabled\('crm'\)\) \{/);
  assert.match(routeSrc, /\} else \{/);
  const elseStart = routeSrc.indexOf('} else {');
  const elseBranch = routeSrc.slice(elseStart, routeSrc.indexOf('\n    }', elseStart) + 2000);
  assert.match(elseBranch, /const allCustomers = await getKhachHang\(\);/, 'nhánh Google Sheets phải giữ nguyên getKhachHang() nguyên bảng — Sheets không có SQL để đẩy where xuống');
  assert.match(elseBranch, /data\.slice\(start, start \+ limit\)/, 'nhánh Google Sheets phải giữ nguyên JS slice — không đổi hành vi cho Sheets');
});

test('route.ts: nhánh Postgres dùng buildKhachHangBaseWhere (reuse module thuần đã test riêng) — không tự viết lại logic authorization/filter lần 2 trong route', () => {
  assert.match(routeSrc, /import \{ buildKhachHangBaseWhere, type KhachHangListFilters \} from '@\/lib\/khach-hang-list-query';/);
  assert.match(routeSrc, /const baseWhere = buildKhachHangBaseWhere\(user, isAdmin, projects, employees, privateGroupVisibleIds, filters\);/);
});

test('route.ts: nhánh Postgres — 4 query total/inCampaignCount/filteredTotal/findMany chạy SONG SONG (Promise.all), không tuần tự', () => {
  assert.match(routeSrc, /const \[totalCount, inCampaignCount, filteredTotalCount, rows\] = await Promise\.all\(\[/);
});

test('route.ts: "total" tính trên baseWhere (KHÔNG gồm campaignStatus/datasetId) — giữ ĐÚNG ý nghĩa đã khoá (Customer Range + "Chọn tất cả N phù hợp bộ lọc" phụ thuộc con số này)', () => {
  assert.match(routeSrc, /prisma\.khachHang\.count\(\{ where: baseWhere \}\)/);
});

test('route.ts: "filteredTotal" tính trên filteredWhere (baseWhere + campaignStatus + datasetId) — đúng field paginatedData thực sự trả về', () => {
  assert.match(routeSrc, /prisma\.khachHang\.count\(\{ where: filteredWhere \}\)/);
  assert.match(routeSrc, /prisma\.khachHang\.findMany\(\{ where: filteredWhere, orderBy: \{ ngay_tao: 'desc' \}, skip: start, take: limit \}\)/);
});

test('route.ts: campaignStatus="in_campaign"/"not_in_campaign" dịch đúng sang id_khach_hang in/notIn membershipSet — mirror matchesCampaignStatusFilter cũ', () => {
  assert.match(routeSrc, /if \(campaignStatus === 'in_campaign'\) extraConditions\.push\(\{ id_khach_hang: \{ in: \[\.\.\.membershipSet\] \} \}\);/);
  assert.match(routeSrc, /else if \(campaignStatus === 'not_in_campaign'\) extraConditions\.push\(\{ id_khach_hang: \{ notIn: \[\.\.\.membershipSet\] \} \}\);/);
});

test('route.ts: datasetId dịch đúng sang id_khach_hang in datasetMembershipSet', () => {
  assert.match(routeSrc, /if \(datasetId\) extraConditions\.push\(\{ id_khach_hang: \{ in: \[\.\.\.datasetMembershipSet\] \} \}\);/);
});

test('route.ts: campaignSummary (inCampaign/notInCampaign) tính trên baseWhere — CÙNG scope với "total", KHÔNG bị campaignStatus/datasetId ảnh hưởng (mirror summarizeCampaignMembership cũ, tính TRƯỚC khi áp campaignStatus/datasetId)', () => {
  assert.match(routeSrc, /campaignSummary = \{ inCampaign: inCampaignCount, notInCampaign: total - inCampaignCount \};/);
  // inCampaignCount PHẢI dùng baseWhere (không phải filteredWhere) làm điều kiện gốc.
  const idx = routeSrc.indexOf('inCampaignCount');
  const nearby = routeSrc.slice(routeSrc.indexOf('prisma.khachHang.count', idx - 200), idx + 400);
  assert.match(nearby, /AND: \[baseWhere, \{ id_khach_hang: \{ in: \[\.\.\.membershipSet\] \} \}\]/);
});

test('route.ts: paginatedData map qua toKhachHang() (reuse mapper của PostgresCustomerRepository — không viết lại field mapping lần 2)', () => {
  assert.match(routeSrc, /import \{ toKhachHang \} from '@\/lib\/repository\/postgresql\/customer\.repo';/);
  assert.match(routeSrc, /paginatedData = rows\.map\(toKhachHang\);/);
});

test('route.ts: deterministic order — orderBy ngay_tao desc, ĐÚNG orderBy PostgresCustomerRepository.findAll() hiện có (không đổi thứ tự quan sát được so với trước khi Batch 2)', () => {
  const repoSrc = readFileSync(resolve('src/lib/repository/postgresql/customer.repo.ts'), 'utf8');
  assert.match(repoSrc, /orderBy: \{ ngay_tao: 'desc' \}/, 'PostgresCustomerRepository.findAll() phải vẫn orderBy ngay_tao desc — nếu đổi, route.ts Batch 2 cũng phải đổi theo để không lệch thứ tự');
  assert.match(routeSrc, /orderBy: \{ ngay_tao: 'desc' \}/);
});

test('route.ts: campaignByCustomer/privateGroupByCustomer enrichment KHÔNG đổi — vẫn chỉ query cho paginatedData (trang hiện tại), tái dùng nguyên code cũ bất kể nguồn PG hay GS', () => {
  assert.match(routeSrc, /const campaignByCustomer = await getCampaignNamesByCustomerIds\(\s*\n\s*paginatedData\.filter\(kh => membershipSet\.has\(kh\.id_khach_hang\)\)\.map\(kh => kh\.id_khach_hang\),\s*\n\s*\);/);
  assert.match(routeSrc, /const pageCustomerIds = paginatedData\.map\(kh => kh\.id_khach_hang\);/);
});

test('SECURITY REGRESSION: findMany (dòng trả về client) VÀ count (total/filteredTotal) dùng CÙNG where đã gồm visibility — authorization áp dụng TRƯỚC/ATOMIC với skip/take trong CÙNG 1 câu SQL, không phải "SQL lấy N dòng đầu rồi JS lọc bớt" (ví dụ prohibited regression trong yêu cầu Batch 2)', () => {
  // filteredWhere (dùng cho cả count filteredTotal LẪN findMany) phải bắt
  // nguồn từ baseWhere — và baseWhere = buildKhachHangBaseWhere(...) đã gồm
  // visibility (xem test buildKhachHangBaseWhere ở khach-hang-list-query.test.ts:
  // AND của [visibility, filter], KHÔNG có cách nào skip/take chạy trên 1 where
  // KHÔNG có visibility rồi lọc lại sau).
  assert.match(routeSrc, /const filteredWhere = extraConditions\.length > 0 \? \{ AND: \[baseWhere, \.\.\.extraConditions\] \} : baseWhere;/);
  assert.match(routeSrc, /prisma\.khachHang\.findMany\(\{ where: filteredWhere, orderBy: \{ ngay_tao: 'desc' \}, skip: start, take: limit \}\)/);
  // Không có filter/slice/JS nào áp dụng LÊN rows SAU khi Prisma trả về, TRƯỚC
  // khi map qua toKhachHang() — nếu có nghĩa là đang "lọc lại sau" (chính
  // pattern bị cấm).
  const findManyIdx = routeSrc.indexOf('prisma.khachHang.findMany(');
  const mapIdx = routeSrc.indexOf('paginatedData = rows.map(toKhachHang);');
  const between = routeSrc.slice(findManyIdx, mapIdx);
  assert.doesNotMatch(between, /\.filter\(/, 'không được có .filter() nào giữa lúc DB trả rows và lúc map ra response — visibility phải đã nằm trong WHERE, không lọc lại ở JS sau khi đã skip/take');
});

// ─── Part B: point lookups (SAFE — chỉ 1 khách hàng cần) ───────────────────

const pointLookupRoutes = [
  'src/app/api/khach-hang/route.ts',
  'src/app/api/crm/telesale/interaction/route.ts',
  'src/app/api/crm/telesale/assign/route.ts',
  'src/app/api/crm/telesale/handoff/route.ts',
  'src/app/api/crm/qualified-leads/[id]/qualification/route.ts',
];

test('6 route write/validation: findKhachHangById thay cho getKhachHang().find() — mỗi route CHỈ cần đúng 1 khách hàng (PUT/DELETE/interaction/assign/handoff/qualification)', () => {
  for (const file of pointLookupRoutes) {
    const src = readFileSync(resolve(file), 'utf8');
    assert.match(src, /findKhachHangById\(/, `${file} phải dùng findKhachHangById thay vì getKhachHang().find()`);
  }
});

test('6 route trên: KHÔNG còn getKhachHang().find()/.some() pattern nào sót lại (điểm cần convert đã convert hết, không nửa vời)', () => {
  for (const file of pointLookupRoutes) {
    const src = readFileSync(resolve(file), 'utf8');
    assert.doesNotMatch(src, /getKhachHang\(\)\)\.find\(/, `${file} còn sót getKhachHang().find()`);
  }
});

test('khach-hang/route.ts POST/PUT phone-dedup: CỐ Ý giữ nguyên getKhachHang() + .some() — dedupe theo phoneKey (chuẩn hoá 9 số cuối) không có tương đương SQL an toàn nếu không thêm cột/migration (ngoài phạm vi Batch 2, xem Final Report)', () => {
  const matches = routeSrc.match(/\(await getKhachHang\(\)\)\.some\(/g) || [];
  assert.equal(matches.length, 2, 'phải còn đúng 2 chỗ phone-dedup (POST + PUT) dùng getKhachHang().some() y hệt trước Batch 2 — cố ý KHÔNG convert');
});

test('khach-hang/route.ts PUT: findKhachHangById(body.id_khach_hang) + vẫn load đủ getDuAn()/getNhanVien() (2 bảng nhỏ, canManageCustomer/isDirectManager cần toàn bộ, không phải 1 dòng)', () => {
  assert.match(routeSrc, /const \[current, projects, employees\] = await Promise\.all\(\[findKhachHangById\(body\.id_khach_hang\), getDuAn\(\), getNhanVien\(\)\]\);/);
});

test('khach-hang/route.ts DELETE: findKhachHangById(id) + vẫn load đủ getPipeline()/getCampaignMembershipCustomerRefs() (customerDeleteBlockReason dùng chung single/bulk-delete, đổi phạm vi của nó ngoài Batch 2)', () => {
  assert.match(routeSrc, /const \[current, projects, employees, pipelines, campaignMemberships\] = await Promise\.all\(\[\s*\n\s*findKhachHangById\(id\), getDuAn\(\), getNhanVien\(\), getPipeline\(\), getCampaignMembershipCustomerRefs\(\),\s*\n\s*\]\);/);
});

for (const [name, file] of [
  ['telesale/interaction', 'src/app/api/crm/telesale/interaction/route.ts'],
  ['telesale/assign', 'src/app/api/crm/telesale/assign/route.ts'],
  ['telesale/handoff', 'src/app/api/crm/telesale/handoff/route.ts'],
  ['qualified-leads/qualification', 'src/app/api/crm/qualified-leads/[id]/qualification/route.ts'],
] as const) {
  test(`${name}/route.ts: vẫn load đủ getDuAn()/getNhanVien() (2 bảng nhỏ) song song với findKhachHangById — không chuyển 2 bảng đó thành point lookup (canManageCustomer/isDirectManager/tìm quản lý trực tiếp/target cần TOÀN BỘ, không phải 1 dòng)`, () => {
    const src = readFileSync(resolve(file), 'utf8');
    assert.match(src, /findKhachHangById\([^)]*\), getDuAn\(\), getNhanVien\(\)/);
  });
}

// ─── data-access.ts: findKhachHangById giữ đúng GS parity + PG fallback ────

test('data-access.ts: findKhachHangById — PG dùng getCustomerRepository().findById (point lookup thật, KHÔNG qua unstable_cache), GS dùng getKhachHang() (ĐÃ cached ở mem-cache.ts) + .find() — KHÔNG gọi getCustomerRepository().findById() cho nhánh GS (repo đó tự đọc GS.getKhachHang() RAW, bỏ qua cache, tăng gọi Google Sheets API thật)', () => {
  const src = readFileSync(resolve('src/lib/data-access.ts'), 'utf8');
  const start = src.indexOf('export async function findKhachHangById');
  const end = src.indexOf('export function addKhachHang', start);
  assert.ok(start > -1 && end > start);
  const body = src.slice(start, end);
  assert.match(body, /if \(!isPostgresEnabled\('crm'\)\) \{\s*\n\s*const all = await getKhachHang\(\);\s*\n\s*return all\.find\(kh => kh\.id_khach_hang === id\) \?\? null;\s*\n\s*\}/);
  assert.match(body, /return await getCustomerRepository\(\)\.findById\(id\);/);
  assert.match(body, /catch \(e\) \{[\s\S]*?const all = await getKhachHang\(\);\s*\n\s*return all\.find\(kh => kh\.id_khach_hang === id\) \?\? null;/, 'PG lỗi phải fallback GS (cùng convention withPgFallback/getKhachHang() còn lại trong file)');
});
