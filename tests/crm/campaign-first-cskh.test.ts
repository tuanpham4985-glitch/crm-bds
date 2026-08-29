import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { campaignProjectFieldTouched, campaignOwnerFieldsTouched, canManageCampaign, isCrmAdmin } from '../../src/lib/crm-auth';
import { eligibleCampaignSales } from '../../src/lib/campaign-sale-eligibility';

// REMEDIATION — CAMPAIGN-FIRST CSKH + PROJECT TEAM MANAGEMENT. Đây là UI/
// capability migration theo audit PROJECT_MODE_RETIREMENT_BLOCKED_BY_MIGRATION
// (không phải database migration — schema Campaign/DuAn/CampaignMembership
// giữ nguyên 100%). Test dưới đây khoá đúng các bất biến của remediation này:
// (1) /du-an trở thành UI authority quản lý DuAn.truong_nhom/ds_sale — reuse
//     NGUYÊN PUT /api/du-an, không tạo authority thứ 2; (2) Campaign MỚI bắt
//     buộc có Dự án (UI + server), Campaign legacy id_du_an=null vẫn đọc/dùng
//     được, Admin có đường gán Dự án tối thiểu; (3) Campaign/Dự án/Leader hiện
//     rõ trong CSKH → Theo Campaign; (4) /phan-khach mặc định Campaign mode,
//     tab "Theo Dự án" ẩn khỏi UI nhưng code/route KHÔNG bị xoá; (5)
//     eligibleCampaignSales/DuAn.ds_sale/scoring/Handoff/Pipeline/range/
//     pagination/distribution KHÔNG bị đụng.

const DU_AN_PAGE_PATH = 'src/app/du-an/page.tsx';
const PHAN_KHACH_PATH = 'src/app/phan-khach/page.tsx';
const WORK_QUEUE_PATH = 'src/components/crm/CampaignCskhWorkQueue.tsx';
const DISTRIBUTE_MODAL_PATH = 'src/components/crm/CampaignDistributeModal.tsx';
const CAMPAIGNS_ROUTE_PATH = 'src/app/api/campaigns/route.ts';
const CAMPAIGN_ID_ROUTE_PATH = 'src/app/api/campaigns/[id]/route.ts';
const CAMPAIGN_LIB_PATH = 'src/lib/crm-funnel/campaign.ts';
const DU_AN_API_ROUTE_PATH = 'src/app/api/du-an/route.ts';

// --- A. crm-auth.ts: campaignProjectFieldTouched (pure) ---

test('campaignProjectFieldTouched: body có key id_du_an -> true (kể cả null/rỗng) — presence check, không theo truthiness (cùng pattern campaignOwnerFieldsTouched)', () => {
  assert.equal(campaignProjectFieldTouched({ id_du_an: null }), true);
  assert.equal(campaignProjectFieldTouched({ id_du_an: '' }), true);
  assert.equal(campaignProjectFieldTouched({ id_du_an: 'DA_1' }), true);
});

test('campaignProjectFieldTouched: body không có id_du_an -> false, không kích hoạt Admin gate oan', () => {
  assert.equal(campaignProjectFieldTouched({ name: 'Đợt 2', status: 'active' }), false);
  assert.equal(campaignProjectFieldTouched({}), false);
  // owner_id/owner_name không phải id_du_an — 2 gate độc lập.
  assert.equal(campaignProjectFieldTouched({ owner_id: 'NV1' }), false);
});

test('campaignProjectFieldTouched độc lập hoàn toàn với campaignOwnerFieldsTouched — 1 request đụng owner_* không tự kích hoạt gate Project và ngược lại', () => {
  assert.equal(campaignOwnerFieldsTouched({ id_du_an: 'DA_1' }), false);
  assert.equal(campaignProjectFieldTouched({ owner_id: 'NV1', owner_name: 'A' }), false);
});

// --- B. POST /api/campaigns: Dự án bắt buộc cho Campaign MỚI, validate server-side ---

test('api/campaigns/route.ts: POST reject khi thiếu id_du_an (400, thông báo rõ "phải gắn với 1 Dự án") — validate SAU isCrmAdmin gate, KHÔNG đổi guardCount Admin-only cũ', () => {
  const src = readFileSync(resolve(CAMPAIGNS_ROUTE_PATH), 'utf8');
  assert.match(src, /if \(!isCrmAdmin\(user\)\) \{/, 'regression: Admin-only gate cũ vẫn còn nguyên');
  assert.match(src, /Chỉ Admin\/Ban lãnh đạo mới được tạo Campaign/, 'regression: message cũ không đổi');
  const adminGateIdx = src.indexOf('Chỉ Admin/Ban lãnh đạo mới được tạo Campaign');
  const projectCheckIdx = src.indexOf("if (!id_du_an) return NextResponse.json({ success: false, error: 'Thiếu Dự án");
  assert.ok(adminGateIdx > -1 && projectCheckIdx > -1 && adminGateIdx < projectCheckIdx, 'check thiếu Dự án phải nằm SAU Admin gate');
});

test('api/campaigns/route.ts: POST validate Dự án THẬT tồn tại (tìm trong getDuAn(), không tin id_du_an lạ), resolve ten_du_an từ record tìm thấy — KHÔNG tin ten_du_an client gửi', () => {
  const src = readFileSync(resolve(CAMPAIGNS_ROUTE_PATH), 'utf8');
  assert.match(src, /import \{ getDuAn \} from '@\/lib\/data-access';/);
  assert.match(src, /const project = \(await getDuAn\(\)\)\.find\(item => item\.id_du_an === id_du_an\);/);
  assert.match(src, /if \(!project\) return NextResponse\.json\(\{ success: false, error: 'Dự án không tồn tại' \}, \{ status: 400 \}\);/);
  const createCallStart = src.indexOf('await createCampaign({');
  const createCallBody = src.slice(createCallStart, createCallStart + 250);
  assert.match(createCallBody, /id_du_an: project\.id_du_an,/);
  assert.match(createCallBody, /ten_du_an: project\.ten_du_an,/);
  assert.doesNotMatch(createCallBody, /ten_du_an: body\?\.ten_du_an/, 'không được tin ten_du_an client gửi thẳng — phải resolve từ project tìm thấy');
});

// --- C. PUT /api/campaigns/[id]: Admin-only gán/sửa Dự án cho Campaign legacy ---

test('api/campaigns/[id]/route.ts: PUT gate campaignProjectFieldTouched(body) && !isCrmAdmin(user) — Admin-only, cùng pattern owner_id/owner_name — đặt SAU canManageCampaign, TRƯỚC updateCampaign', () => {
  const src = readFileSync(resolve(CAMPAIGN_ID_ROUTE_PATH), 'utf8');
  assert.match(src, /import \{[^}]*campaignProjectFieldTouched[^}]*\} from '@\/lib\/crm-auth';/);
  const putStart = src.indexOf('export async function PUT');
  const putBody = src.slice(putStart);
  const canManageIdx = putBody.indexOf('canManageCampaign(user, campaign)');
  const ownerGateIdx = putBody.indexOf('campaignOwnerFieldsTouched(body) && !isCrmAdmin(user)');
  const projectGateIdx = putBody.indexOf('campaignProjectFieldTouched(body) && !isCrmAdmin(user)');
  const updateIdx = putBody.indexOf('updateCampaign(id,');
  assert.ok(canManageIdx > -1 && ownerGateIdx > -1 && projectGateIdx > -1 && updateIdx > -1);
  assert.ok(canManageIdx < ownerGateIdx && ownerGateIdx < projectGateIdx && projectGateIdx < updateIdx, 'thứ tự phải là: canManageCampaign -> owner gate -> project gate -> updateCampaign');
  assert.match(putBody, /Chỉ Admin được gán\/sửa Dự án cho Campaign/);
});

test('api/campaigns/[id]/route.ts: PUT validate Dự án tồn tại thật + reject khi id_du_an rỗng (KHÔNG cho "gỡ" Dự án đã gán) — resolve ten_du_an từ record tìm thấy, không tin client', () => {
  const src = readFileSync(resolve(CAMPAIGN_ID_ROUTE_PATH), 'utf8');
  const putStart = src.indexOf('export async function PUT');
  const putBody = src.slice(putStart);
  assert.match(putBody, /if \(!id_du_an\) return NextResponse\.json\(\{ success: false, error: 'Phải chọn Dự án' \}, \{ status: 400 \}\);/);
  assert.match(putBody, /const project = \(await getDuAn\(\)\)\.find\(item => item\.id_du_an === id_du_an\);/);
  assert.match(putBody, /if \(!project\) return NextResponse\.json\(\{ success: false, error: 'Dự án không tồn tại' \}, \{ status: 400 \}\);/);
  assert.match(putBody, /projectPatch = \{ id_du_an: project\.id_du_an, ten_du_an: project\.ten_du_an \};/);
});

test('api/campaigns/[id]/route.ts: PUT vẫn tái sử dụng updateCampaign() — projectPatch merge vào patch chung, không tạo lệnh ghi DB riêng', () => {
  const src = readFileSync(resolve(CAMPAIGN_ID_ROUTE_PATH), 'utf8');
  const putStart = src.indexOf('export async function PUT');
  const putBody = src.slice(putStart);
  assert.match(putBody, /await updateCampaign\(id, \{[\s\S]*?\.\.\.projectPatch,[\s\S]*?\}\);/);
  assert.doesNotMatch(putBody, /prisma\.campaign\.update/);
});

test('campaign.ts: UpdateCampaignPatch có thêm id_du_an?/ten_du_an? (optional) — không đổi field owner_*/name/status/... cũ', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const ifaceStart = src.indexOf('export interface UpdateCampaignPatch');
  const ifaceEnd = src.indexOf('\n}', ifaceStart);
  const iface = src.slice(ifaceStart, ifaceEnd);
  assert.match(iface, /id_du_an\?:\s*string;/);
  assert.match(iface, /ten_du_an\?:\s*string;/);
  assert.match(iface, /owner_id\?:\s*string \| null;/);
  assert.match(iface, /owner_name\?:\s*string \| null;/);
});

test('regression: GET /api/campaigns vẫn KHÔNG bị siết Admin-only bởi remediation này', () => {
  const src = readFileSync(resolve(CAMPAIGNS_ROUTE_PATH), 'utf8');
  const getStart = src.indexOf('export async function GET');
  const postStart = src.indexOf('export async function POST');
  const getBody = src.slice(getStart, postStart);
  assert.doesNotMatch(getBody, /isCrmAdmin/);
});

// --- D. CampaignDistributeModal.tsx: Dự án bắt buộc cho Campaign MỚI ---

test('CampaignDistributeModal.tsx: label "Dự án *" (không còn "(tuỳ chọn)"), option mặc định "— Chọn Dự án —" (không còn "— Không gắn Dự án —")', () => {
  const src = readFileSync(resolve(DISTRIBUTE_MODAL_PATH), 'utf8');
  assert.match(src, /<label className="form-label">Dự án \*<\/label>/);
  assert.match(src, /<option value="">— Chọn Dự án —<\/option>/);
  assert.doesNotMatch(src, /Dự án \(tuỳ chọn\)/);
  assert.doesNotMatch(src, /Không gắn Dự án/);
});

test('CampaignDistributeModal.tsx: submit() reject khi creatingNew && !newProjectId ("Chọn Dự án.") — check nằm cùng khối validate tên Campaign, TRƯỚC gọi POST /api/campaigns', () => {
  const src = readFileSync(resolve(DISTRIBUTE_MODAL_PATH), 'utf8');
  const submitStart = src.indexOf('async function submit()');
  const fetchIdx = src.indexOf("fetch('/api/campaigns',", submitStart);
  const validateBlock = src.slice(submitStart, fetchIdx);
  assert.match(validateBlock, /if \(creatingNew && !newProjectId\) \{ setError\('Chọn Dự án\.'\); return; \}/);
});

// --- E. CSKH → Theo Campaign: hiển thị rõ Campaign/Dự án/Leader + Gán Dự án Admin-only ---

test('CampaignCskhWorkQueue.tsx: hiện rõ "Campaign: <tên>", "Dự án: <tên>" hoặc cảnh báo "Chưa gắn Dự án — Leader chưa thể chia Sale." khi id_du_an null', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /Campaign: <strong style=\{\{ color: 'var\(--text-title\)' \}\}>\{selectedCampaign\.name\}<\/strong>/);
  assert.match(src, /Dự án: <strong style=\{\{ color: 'var\(--text-title\)' \}\}>\{selectedCampaign\.ten_du_an\}<\/strong>/);
  assert.match(src, /Chưa gắn Dự án — Leader chưa thể chia Sale\./);
});

test('CampaignCskhWorkQueue.tsx: nút "Gán Dự án"/"Sửa Dự án" CHỈ hiện cho isAdmin (Leader chỉ thấy cảnh báo/label, không sửa được Project linkage)', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /\{isAdmin && <button className="btn btn-ghost btn-sm" onClick=\{\(\) => setShowProjectEdit\(true\)\}>\{selectedCampaign\.id_du_an \? 'Sửa Dự án' : 'Gán Dự án'\}<\/button>\}/);
});

test('CampaignCskhWorkQueue.tsx: CampaignProjectEditModal PUT /api/campaigns/${campaign.id} với { id_du_an }, KHÔNG cho chọn rỗng (reject khi !projectId), dùng đúng "projects" prop có sẵn (không fetch riêng)', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  const modalStart = src.indexOf('function CampaignProjectEditModal');
  assert.ok(modalStart >= 0);
  const modalBody = src.slice(modalStart, modalStart + 2200);
  assert.match(modalBody, /body: JSON\.stringify\(\{ id_du_an: projectId \}\)/);
  assert.match(modalBody, /if \(!projectId\) \{ setError\('Chọn Dự án\.'\); return; \}/);
  assert.match(modalBody, /projects\.filter\(item => item\.hien_thi !== 0\)/);
  assert.doesNotMatch(modalBody, /fetch\('\/api\/du-an'\)/, 'không tự fetch lại danh sách Dự án — dùng "projects" prop có sẵn');
});

test('CampaignCskhWorkQueue.tsx: showProjectEdit wiring — onSaved cập nhật campaigns state để Dự án đổi ngay (không cần reload trang), cùng pattern showLeaderEdit', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /\{showProjectEdit && selectedCampaign && \(/);
  assert.match(src, /onSaved=\{updated => \{\s*\n\s*setCampaigns\(current => current\.map\(item => item\.id === updated\.id \? updated : item\)\);\s*\n\s*setShowProjectEdit\(false\);/);
});

test('regression: nút "Gán Leader"/"Sửa Leader" (CampaignLeaderEditModal) và toàn bộ luồng Leader hiện có KHÔNG bị đụng bởi block Dự án mới', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /\{isAdmin && <button className="btn btn-ghost btn-sm" onClick=\{\(\) => setShowLeaderEdit\(true\)\}>\{selectedCampaign\.owner_name \? 'Sửa Leader' : 'Gán Leader'\}<\/button>\}/);
  assert.match(src, /function CampaignLeaderEditModal/);
});

// --- F. /du-an: Project-team configuration authority ---

test('du-an/page.tsx: fetch employees (/api/nhan-vien) để build roster picker — reuse employee source hiện có, không tạo API mới', () => {
  const src = readFileSync(resolve(DU_AN_PAGE_PATH), 'utf8');
  assert.match(src, /fetch\('\/api\/nhan-vien'\)/);
});

test('du-an/page.tsx: nút "Cấu hình team" hiện cho Admin HOẶC đúng Trưởng nhóm hiện tại của Dự án đó (canConfigureTeam) — cùng authority split với PUT /api/du-an (Admin sửa cả 2 field, Trưởng nhóm chỉ sửa ds_sale)', () => {
  const src = readFileSync(resolve(DU_AN_PAGE_PATH), 'utf8');
  assert.match(src, /const canConfigureTeam = \(da: DuAn\) => Boolean\(isAdmin \|\| \(user && da\.truong_nhom === user\.ho_ten\)\);/);
  assert.match(src, /\{canConfigureTeam\(da\) && \(/);
});

test('du-an/page.tsx: saveTeam() gọi ĐÚNG PUT /api/du-an hiện có, gửi nguyên object project + truong_nhom/ds_sale mới (JSON.stringify) — reuse write path cũ, không tạo endpoint Project-team mới', () => {
  const src = readFileSync(resolve(DU_AN_PAGE_PATH), 'utf8');
  const fnStart = src.indexOf('const saveTeam = async () => {');
  const fnEnd = src.indexOf('\n  };', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert.match(fnBody, /fetch\('\/api\/du-an', \{/);
  assert.match(fnBody, /method: 'PUT'/);
  assert.match(fnBody, /body: JSON\.stringify\(\{ \.\.\.teamProject, truong_nhom: teamForm\.truong_nhom, ds_sale: JSON\.stringify\(teamForm\.ds_sale\) \}\)/);
});

test('du-an/page.tsx: modal "Cấu hình team" disable field Trưởng nhóm khi !isAdmin — Trưởng nhóm hiện tại chỉ sửa ds_sale, không tự đổi chính mình (cùng semantics phan-khach cũ)', () => {
  const src = readFileSync(resolve(DU_AN_PAGE_PATH), 'utf8');
  assert.match(src, /<select className="form-select" disabled=\{!isAdmin\} value=\{teamForm\.truong_nhom\}/);
});

test('du-an/page.tsx: hiển thị roster hiện tại (Trưởng nhóm + số Sale) trên mỗi card Dự án — Admin "xem roster hiện tại" theo yêu cầu', () => {
  const src = readFileSync(resolve(DU_AN_PAGE_PATH), 'utf8');
  assert.match(src, /Trưởng nhóm: <strong style=\{\{ color: 'var\(--text-label\)' \}\}>\{da\.truong_nhom \|\| 'Chưa cấu hình'\}<\/strong>/);
  assert.match(src, /\{parseSaleList\(da\.ds_sale\)\.length\} Sale/);
});

test('api/du-an/route.ts: PUT authority KHÔNG bị đổi bởi remediation này — Admin sửa toàn bộ, Trưởng nhóm hiện tại chỉ sửa được ds_sale (không đổi truong_nhom của chính mình)', () => {
  const src = readFileSync(resolve(DU_AN_API_ROUTE_PATH), 'utf8');
  assert.match(src, /if \(!admin && current\.truong_nhom !== user\.ho_ten\)/);
  assert.match(src, /truong_nhom: current\.truong_nhom,\s*\n\s*ds_sale: body\.ds_sale \?\? current\.ds_sale,/);
});

test('regression: /du-an CRUD dự án hiện có (Thêm/Sửa/Xóa, stacking config, filter CDT) không bị đụng bởi Project-team feature mới', () => {
  const src = readFileSync(resolve(DU_AN_PAGE_PATH), 'utf8');
  assert.match(src, /const handleSave = async \(\) => \{/);
  assert.match(src, /const handleDelete = async \(\) => \{/);
  assert.match(src, /Phân khu Stacking/);
});

// --- G. /phan-khach: Campaign-first default, tab "Theo Dự án" ẩn khỏi UI ---

test('phan-khach/page.tsx: mode default = campaign cho MỌI role (?mode=project mới vào lại Project mode) — không còn phân biệt admin/non-admin như trước', () => {
  const src = readFileSync(resolve(PHAN_KHACH_PATH), 'utf8');
  assert.match(src, /const \[mode, setMode\] = useState<'project' \| 'campaign'>\(searchParams\.get\('mode'\) === 'project' \? 'project' : 'campaign'\);/);
  assert.doesNotMatch(src, /if \(!authLoading && !isAdmin && user\) setMode\('campaign'\)/, 'effect auto-chuyển non-admin cũ phải được gỡ (không còn cần thiết vì default đã là campaign cho mọi role)');
});

test('phan-khach/page.tsx: KHÔNG còn nút chuyển mode ("Theo Dự án"/"Theo Campaign") trong JSX — tab Project ẩn khỏi UI', () => {
  const src = readFileSync(resolve(PHAN_KHACH_PATH), 'utf8');
  assert.doesNotMatch(src, /onClick=\{\(\) => setMode\('project'\)\}/);
  assert.doesNotMatch(src, /onClick=\{\(\) => setMode\('campaign'\)\}/);
  assert.doesNotMatch(src, />Theo Dự án</);
  assert.doesNotMatch(src, />Theo Campaign</);
});

test('phan-khach/page.tsx: KHÔNG xoá code/nhánh "project" — CustomerTable, isTelesale, loadCustomers, canManage, modal "Cấu hình team" cũ vẫn còn nguyên trong file (chỉ ẩn khỏi UI, không xoá)', () => {
  const src = readFileSync(resolve(PHAN_KHACH_PATH), 'utf8');
  assert.match(src, /function CustomerTable\(/);
  assert.match(src, /function isTelesale\(employee: NhanVien\)/);
  assert.match(src, /const loadCustomers = useCallback/);
  assert.match(src, /mode === 'campaign' \? <CampaignCskhWorkQueue/);
  assert.match(src, /: <>/, 'nhánh else (Project mode JSX) vẫn phải còn trong file');
  assert.match(src, /Cấu hình team dự án/);
});

test('regression: deep link ?mode=campaign&campaignId=... (từ CampaignDistributeModal sau khi tạo Campaign) tiếp tục hoạt động — resolve về "campaign" (đã là default) + initialCampaignId truyền đúng', () => {
  const src = readFileSync(resolve(PHAN_KHACH_PATH), 'utf8');
  assert.match(src, /const initialCampaignId = searchParams\.get\('campaignId'\) \|\| undefined;/);
  const modalSrc = readFileSync(resolve(DISTRIBUTE_MODAL_PATH), 'utf8');
  assert.match(modalSrc, /router\.push\(`\/phan-khach\?mode=campaign&campaignId=\$\{createdCampaign\?\.id \|\| campaignId\}`\)/);
});

test('regression: Sidebar CSKH vẫn trỏ /phan-khach KHÔNG kèm query param — tự động vào Campaign mode nhờ default mới, không cần sửa menu-registry.ts', () => {
  const src = readFileSync(resolve('src/lib/menu-registry.ts'), 'utf8');
  assert.match(src, /href: '\/phan-khach'/);
  assert.doesNotMatch(src, /\/phan-khach\?/, 'Sidebar link không cần (và không nên) tự thêm ?mode= — default đã là campaign');
});

// --- H. Project Roster Authority — MUST PRESERVE (không đổi) ---

test('eligibleCampaignSales: KHÔNG bị đổi bởi remediation này — Admin luôn full quyền, Leader vẫn resolve theo Campaign.id_du_an -> DuAn.ds_sale, vẫn blocked (không fallback company-wide) khi thiếu Dự án/roster', () => {
  const employees = [
    { id_nhan_vien: 'S1', ho_ten: 'Sale A', vai_tro: 'Sale', trang_thai: 'Chính thức' },
    { id_nhan_vien: 'S2', ho_ten: 'Sale B', vai_tro: 'Sale', trang_thai: 'Chính thức' },
  ] as never[];
  const projects = [{ id_du_an: 'DA_1', ds_sale: JSON.stringify(['Sale A']) }] as never[];
  // Admin: full quyền, không thu hẹp.
  const adminResult = eligibleCampaignSales(true, { id_du_an: null }, projects, employees);
  assert.equal(adminResult.blocked, false);
  if (!adminResult.blocked) assert.equal(adminResult.scoped, false);
  // Leader, Campaign chưa gắn Dự án -> blocked, không fallback company-wide.
  const blockedResult = eligibleCampaignSales(false, { id_du_an: null }, projects, employees);
  assert.equal(blockedResult.blocked, true);
  // Leader, Campaign ĐÃ gắn Dự án có roster -> resolve đúng DuAn.ds_sale.
  const scopedResult = eligibleCampaignSales(false, { id_du_an: 'DA_1' }, projects, employees);
  assert.equal(scopedResult.blocked, false);
  if (!scopedResult.blocked) {
    assert.equal(scopedResult.scoped, true);
    assert.deepEqual(scopedResult.sales.map(s => s.ho_ten), ['Sale A']);
  }
});

test('CampaignCskhWorkQueue.tsx: rangeEligibility vẫn dùng ĐÚNG eligibleCampaignSales(isAdmin, selectedCampaign, projects, employees) — không viết lại eligibility riêng cho block Dự án mới', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /const rangeEligibility = selectedCampaign \? eligibleCampaignSales\(isAdmin, selectedCampaign, projects, employees\) : null;/);
});

test('regression: Campaign.owner_* và DuAn.truong_nhom vẫn là 2 authority độc lập — không có chỗ nào ép owner_name phải bằng truong_nhom', () => {
  const workQueueSrc = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  const eligibilitySrc = readFileSync(resolve('src/lib/campaign-sale-eligibility.ts'), 'utf8');
  assert.doesNotMatch(workQueueSrc, /owner_name === .*truong_nhom|truong_nhom === .*owner_name/);
  assert.doesNotMatch(eligibilitySrc, /owner_name/, 'eligibleCampaignSales không được biết gì về Campaign.owner_name — chỉ dùng id_du_an/ds_sale');
});

test('prisma schema: Campaign/CampaignMembership/DuAn KHÔNG có thay đổi field nào — đây là UI/capability migration, không phải database migration', () => {
  const schemaSrc = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  // id_du_an đã tồn tại sẵn trong schema Campaign từ trước (optional) — remediation
  // này chỉ SIẾT validation ở application layer khi TẠO MỚI, không đổi cột DB.
  assert.match(schemaSrc, /model Campaign \{[\s\S]*?id_du_an\s+String\?[\s\S]*?\}/);
  assert.doesNotMatch(schemaSrc, /model CampaignMembership \{[\s\S]{0,50}\/\/ CAMPAIGN-FIRST/, 'không được thêm field mới vào CampaignMembership cho remediation này');
});

test('regression: không có route/API nào bị xoá — /api/crm/telesale/{assign,interaction,handoff} (legacy Project-mode write path) vẫn còn nguyên file', () => {
  for (const file of [
    'src/app/api/crm/telesale/assign/route.ts',
    'src/app/api/crm/telesale/interaction/route.ts',
    'src/app/api/crm/telesale/handoff/route.ts',
  ]) {
    assert.doesNotThrow(() => readFileSync(resolve(file), 'utf8'), `${file} phải còn tồn tại — không xoá legacy Project-mode routes`);
  }
});
