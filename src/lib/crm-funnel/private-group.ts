// Private Group ("Nhóm riêng") — mô hình Sale tự khai thác data. KHÔNG phải
// Dataset (nguồn/lô data logic), KHÔNG phải Campaign (đợt CSKH Customer↔
// Telesale), KHÔNG phải DuAn.ds_sale (phạm vi Sale của 1 Dự án) — 3 entity đó
// giữ nguyên, không đụng tới (xem prisma/schema.prisma comment trên
// PrivateGroup cho lý do đầy đủ).
//
// Customer vẫn là KhachHang master DUY NHẤT — private_group_customers CHỈ là
// quan hệ (customer_id string ref, KHÔNG copy dữ liệu Customer).
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../db/client';
import { assertTransactionalCrm } from './transactional-workflow';
import { isPostgresEnabled } from '../db/feature-flags';
import { normalizePhone, phoneKey } from '../khach-hang-excel-import';
import { resolveManualCustomerGroup } from '../private-group-auth';
import type { PrivateGroupCustomerLinkLike } from '../private-group-auth';
import type { CrmSessionUser } from '../crm-auth';
import type { KhachHang } from '../types';

type Tx = Prisma.TransactionClient;

/** Cùng pattern retry-on-serialization-conflict đã dùng ở transactional-workflow.ts
 * và membership-workflow.ts (duplicate có chủ đích theo đúng convention hiện
 * có của repo — không centralize, xem 2 file đó). SERIALIZABLE + retry là cơ
 * chế concurrency-safe cho "đọc rồi ghi có điều kiện" (dedupe SĐT rồi tạo
 * Customer) khi 2 request cùng nhập 1 SĐT chạy đồng thời — Postgres tự phát
 * hiện write skew (2 transaction cùng đọc bảng rồi cùng ghi) và abort 1 bên
 * (P2034), retry helper tự chạy lại tối đa 3 lần. */
async function serializable<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
  assertTransactionalCrm();
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      lastError = error;
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : '';
      if (code !== 'P2034' && code !== 'P2002') throw error;
    }
  }
  throw lastError;
}

export class DuplicatePhoneError extends Error {
  constructor() { super('Số điện thoại đã tồn tại trong CRM'); }
}

/** Actor thuộc >=2 Nhóm riêng nhưng không gửi groupId — BẮT BUỘC chọn nhóm
 * trước khi tạo (xem resolveManualCustomerGroup 'required'). */
export class GroupSelectionRequiredError extends Error {
  constructor() { super('Bạn thuộc nhiều Nhóm riêng — phải chọn 1 nhóm trước khi thêm khách hàng'); }
}

/** groupId gửi lên không thuộc danh sách Leader/member của actor (xem
 * resolveManualCustomerGroup 'forbidden') — server tự validate, KHÔNG tin
 * groupId client gửi. */
export class GroupNotAllowedError extends Error {
  constructor() { super('Bạn không thuộc Nhóm riêng này'); }
}

// ─── CRUD nhóm ──────────────────────────────────────────────────────────────

export interface CreatePrivateGroupInput {
  name: string;
  leader_id: string;
  leader_name: string;
  actor: CrmSessionUser;
}

export async function createPrivateGroup(input: CreatePrivateGroupInput) {
  assertTransactionalCrm();
  return prisma.privateGroup.create({
    data: {
      name: input.name,
      leader_id: input.leader_id,
      leader_name: input.leader_name,
      created_by_id: input.actor.id_nhan_vien,
      created_by_name: input.actor.ho_ten,
    },
  });
}

export async function listPrivateGroups() {
  assertTransactionalCrm();
  return prisma.privateGroup.findMany({ orderBy: { created_at: 'desc' } });
}

export async function getPrivateGroup(id: string) {
  assertTransactionalCrm();
  return prisma.privateGroup.findUnique({ where: { id } });
}

export interface UpdatePrivateGroupPatch {
  name?: string;
  leader_id?: string;
  leader_name?: string;
}

export async function updatePrivateGroup(id: string, patch: UpdatePrivateGroupPatch) {
  assertTransactionalCrm();
  return prisma.privateGroup.update({
    where: { id },
    data: {
      name: patch.name,
      leader_id: patch.leader_id,
      leader_name: patch.leader_name,
    },
  });
}

export async function listPrivateGroupMembers(groupId: string) {
  assertTransactionalCrm();
  return prisma.privateGroupMember.findMany({ where: { group_id: groupId }, orderBy: { created_at: 'asc' } });
}

/** Toàn bộ membership của TẤT CẢ nhóm trong 1 query — dùng cho GET
 * /api/private-groups (danh sách nhóm) để lọc theo quyền mà không N+1. */
export async function listAllPrivateGroupMembers() {
  assertTransactionalCrm();
  return prisma.privateGroupMember.findMany();
}

export interface AddPrivateGroupMemberInput {
  group_id: string;
  employee_id: string;
  employee_name: string;
  actor: CrmSessionUser;
}

/** Idempotent qua @@unique([group_id, employee_id]) — thêm lại 1 Sale đã là
 * thành viên không tạo dòng trùng, không lỗi (upsert). */
export async function addPrivateGroupMember(input: AddPrivateGroupMemberInput) {
  assertTransactionalCrm();
  return prisma.privateGroupMember.upsert({
    where: { group_id_employee_id: { group_id: input.group_id, employee_id: input.employee_id } },
    create: {
      group_id: input.group_id,
      employee_id: input.employee_id,
      employee_name: input.employee_name,
      added_by_id: input.actor.id_nhan_vien,
      added_by_name: input.actor.ho_ten,
    },
    update: {},
  });
}

export async function removePrivateGroupMember(groupId: string, employeeId: string) {
  assertTransactionalCrm();
  await prisma.privateGroupMember.deleteMany({ where: { group_id: groupId, employee_id: employeeId } });
}

// ─── Badge "Nhóm riêng" trên GET /api/khach-hang ────────────────────────────
// Cùng convention isPostgresEnabled-guard-trả-rỗng như
// getCampaignMembershipCustomerRefs/getCampaignNamesByCustomerIds (campaign.ts)
// và getDatasetMembershipCustomerRefs (dataset.ts) — KHÔNG dùng
// assertTransactionalCrm() (throw) vì GET /khach-hang PHẢI luôn hoạt động kể
// cả khi Postgres CRM tắt (Private Group đơn giản coi như không có gì để badge).

/** PrivateGroupCustomer THÔ (chưa join tên group) cho 1 tập customer_id cụ
 * thể — dùng cho badge Nhóm riêng trên bảng /khach-hang. Luôn gọi với
 * customer_id CỦA TRANG ĐANG HIỂN THỊ (paginatedData, tối đa `limit` dòng),
 * KHÔNG BAO GIỜ cho toàn bộ dataset — 1 query, không N+1 (cùng tinh thần
 * getCampaignNamesByCustomerIds). Permission filtering (actor có được biết
 * group này không) PHẢI làm ở caller qua buildCustomerGroupBadges — hàm này
 * CHỈ trả dữ liệu thô. */
export async function getPrivateGroupLinksForCustomers(customerIds: readonly string[]): Promise<PrivateGroupCustomerLinkLike[]> {
  if (customerIds.length === 0 || !isPostgresEnabled('crm') || !process.env.DATABASE_URL) return [];
  return prisma.privateGroupCustomer.findMany({
    where: { customer_id: { in: [...customerIds] } },
    select: { customer_id: true, group_id: true, entered_by_id: true, assigned_to_id: true },
  });
}

/** PrivateGroup {id, name, leader_id} cho 1 tập group_id cụ thể — chỉ những
 * group THỰC SỰ được tham chiếu bởi getPrivateGroupLinksForCustomers ở trên
 * (thường 0-1 nhóm/trang 20 dòng), không phải toàn bộ bảng PrivateGroup. */
export async function getPrivateGroupsByIds(groupIds: readonly string[]) {
  if (groupIds.length === 0 || !isPostgresEnabled('crm') || !process.env.DATABASE_URL) return [];
  return prisma.privateGroup.findMany({
    where: { id: { in: [...groupIds] } },
    select: { id: true, name: true, leader_id: true },
  });
}

// ─── Customer của nhóm ──────────────────────────────────────────────────────

export async function getPrivateGroupCustomers(groupId: string) {
  assertTransactionalCrm();
  return prisma.privateGroupCustomer.findMany({ where: { group_id: groupId }, orderBy: { created_at: 'desc' } });
}

/** Join read-only với KhachHang (tên/SĐT/email hiển thị) — CÙNG pattern
 * getCampaignMembersWithCustomers (campaign.ts): customer_id chỉ là string
 * ref nên phải tự join ở application layer, không có Prisma relation. */
export async function getPrivateGroupCustomersWithDetails(groupId: string) {
  assertTransactionalCrm();
  const relations = await getPrivateGroupCustomers(groupId);
  const customerIds = [...new Set(relations.map(r => r.customer_id))];
  const customers = customerIds.length
    ? await prisma.khachHang.findMany({
        where: { id_khach_hang: { in: customerIds } },
        select: { id_khach_hang: true, ten_KH: true, so_dien_thoai: true, email: true },
      })
    : [];
  const customerMap = new Map(customers.map(c => [c.id_khach_hang, c]));
  return relations.map(r => ({ ...r, customer: customerMap.get(r.customer_id) ?? null }));
}

export interface ReassignGroupCustomerInput {
  relationId: string;
  groupId: string;
  assigned_to_id: string;
  assigned_to_name: string;
}

/** Giao lại 1 Customer trong nhóm cho Sale khác — CHỈ đổi assigned_to (authority
 * riêng cho "chăm sóc trong phạm vi nhóm"), KHÔNG đụng KhachHang.sale_phu_trach
 * (authority chung /khach-hang, xem comment PrivateGroupCustomer trong schema).
 * Trả về null nếu relation không thuộc đúng group này (tránh Leader nhóm A
 * reassign nhầm 1 relationId thực ra thuộc nhóm B). */
export async function reassignGroupCustomer(input: ReassignGroupCustomerInput) {
  assertTransactionalCrm();
  const { count } = await prisma.privateGroupCustomer.updateMany({
    where: { id: input.relationId, group_id: input.groupId },
    data: { assigned_to_id: input.assigned_to_id, assigned_to_name: input.assigned_to_name },
  });
  return count > 0;
}

export interface EmployeePrivateGroups {
  leaderOf: { id: string; name: string }[];
  memberOf: { id: string; name: string }[];
}

/** Nhóm mà 1 nhân viên là Leader HOẶC Sale thành viên — dùng để tự động gắn
 * Customer mới nhập vào ĐÚNG nhóm (xem createManualCustomerWithGroupLink).
 * Nhận `tx` optional để gọi được cả trong transaction lẫn standalone (VD UI
 * "Nhóm riêng" hiện thông tin nhóm của chính User đang đăng nhập). */
export async function resolvePrivateGroupsForEmployee(employeeId: string, tx?: Tx): Promise<EmployeePrivateGroups> {
  assertTransactionalCrm();
  const client = tx ?? prisma;
  const [leaderOf, memberships] = await Promise.all([
    client.privateGroup.findMany({ where: { leader_id: employeeId }, select: { id: true, name: true } }),
    client.privateGroupMember.findMany({ where: { employee_id: employeeId }, select: { group: { select: { id: true, name: true } } } }),
  ]);
  return {
    leaderOf,
    memberOf: memberships.map(m => m.group),
  };
}

// ─── Manual customer entry → resolve/create Customer master → gắn Nhóm riêng ─

export interface CreateManualCustomerInput {
  actor: CrmSessionUser;
  ten_KH: string;
  so_dien_thoai: string;
  email?: string;
  nguon?: string;
  nhu_cau?: string;
  ghi_chu?: string;
  du_an?: string;
  /** CHỈ Admin được set khác actor — route phải tự chặn trước khi gọi hàm
   * này (xem POST /api/khach-hang). Non-admin luôn tự gán actor.ho_ten. */
  sale_phu_trach?: string;
  /** Nhóm riêng actor muốn gắn Customer mới vào — optional khi actor thuộc
   * 0/1 nhóm (0 nhóm bị bỏ qua nếu có gửi; 1 nhóm auto-select nhưng vẫn được
   * validate nếu client gửi), BẮT BUỘC khi actor thuộc >=2 nhóm (xem
   * resolveManualCustomerGroup). Cũng CHÍNH LÀ tham số route
   * "Thêm khách từ group detail" dùng để gắn cứng vào 1 group đã biết trước. */
  groupId?: string;
}

export interface CreateManualCustomerResult {
  customer: KhachHang;
  /** null nếu actor không thuộc đúng 1 Nhóm riêng (0 nhóm: customer thường,
   * không có gì sai; >1 nhóm: KHÔNG đoán, bỏ qua auto-link — audit thấy
   * ambiguous, v1 chưa cần giải quyết case hiếm này). */
  groupLink: { id: string; group_id: string; group_name: string } | null;
}

/**
 * Flow D (locked business decision, mở rộng cho multi-group — xem
 * resolveManualCustomerGroup):
 * 0. Resolve Nhóm riêng actor thuộc về + validate input.groupId TRƯỚC khi
 *    đụng DB ghi gì — actor thuộc >=2 nhóm mà không gửi groupId hợp lệ (hoặc
 *    gửi groupId không thuộc actor) -> throw ngay, KHÔNG tạo Customer (tránh
 *    trạng thái nửa vời "Customer đã tạo nhưng group link thất bại/bị bỏ qua
 *    silently" — atomic với bước 2).
 * 1. Validate + normalize/dedupe theo authority hiện tại (phoneKey — GIỐNG HỆT
 *    /api/khach-hang cũ) — trùng SĐT -> DuplicatePhoneError, KHÔNG tạo Customer
 *    thứ 2, KHÔNG đụng Customer cũ (silently steal/reassign) — an toàn tuyệt
 *    đối vì hàm này KHÔNG BAO GIỜ ghi vào 1 Customer đã tồn tại, chỉ tạo mới.
 * 2. Create Customer master (KhachHang) — id cùng format `KH_<ts>_<rand>` với
 *    route cũ.
 * 3+4. Nếu bước 0 resolve ra 1 group ('ok') -> tạo PrivateGroupCustomer
 *    (entered_by = actor) trong CÙNG transaction — atomic với bước 2.
 * 5. assigned_to mặc định = entered_by (actor tự động được quyền chăm sóc —
 *    canViewGroupCustomer trong private-group-auth.ts check đúng field này).
 *
 * Toàn bộ trong 1 transaction SERIALIZABLE — 2 request cùng nhập 1 SĐT không
 * thể cùng tạo 2 Customer (xem serializable() ở trên).
 */
export async function createManualCustomerWithGroupLink(
  input: CreateManualCustomerInput
): Promise<CreateManualCustomerResult> {
  assertTransactionalCrm();
  const so_dien_thoai = normalizePhone(input.so_dien_thoai);
  const key = phoneKey(so_dien_thoai);

  return serializable(async tx => {
    // Bước 0 — group resolution TRƯỚC dedupe/create: fail-fast, không ghi gì
    // vào DB nếu actor chưa hợp lệ về group (xem resolveManualCustomerGroup).
    const groups = await resolvePrivateGroupsForEmployee(input.actor.id_nhan_vien, tx);
    const resolution = resolveManualCustomerGroup(groups.leaderOf, groups.memberOf, input.groupId);
    if (resolution.status === 'required') throw new GroupSelectionRequiredError();
    if (resolution.status === 'forbidden') throw new GroupNotAllowedError();

    const existing = await tx.khachHang.findMany({ select: { so_dien_thoai: true } });
    if (existing.some(c => phoneKey(c.so_dien_thoai || '') === key)) {
      throw new DuplicatePhoneError();
    }

    const id_khach_hang = `KH_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const created = await tx.khachHang.create({
      data: {
        id_khach_hang,
        ngay_tao: new Date().toISOString(),
        ten_KH: input.ten_KH,
        so_dien_thoai,
        email: input.email || '',
        nguon: input.nguon || '',
        nhu_cau: input.nhu_cau || '',
        ghi_chu: input.ghi_chu || '',
        sale_phu_trach: input.sale_phu_trach || '',
        label_khach: `${input.ten_KH} - ${so_dien_thoai}`,
        du_an: input.du_an || '',
        trang_thai_cham_soc: 'Chưa gọi',
        muc_do_quan_tam: 'Chưa xác định',
        so_lan_lien_he: 0,
        lich_su_cham_soc: '[]',
        trang_thai_ban_giao: 'Chưa bàn giao',
        lich_su_ban_giao: '[]',
      },
    });

    let groupLink: CreateManualCustomerResult['groupLink'] = null;
    if (resolution.status === 'ok') {
      const { id: group_id, name: group_name } = resolution.group;
      const relation = await tx.privateGroupCustomer.create({
        data: {
          group_id,
          customer_id: id_khach_hang,
          entered_by_id: input.actor.id_nhan_vien,
          entered_by_name: input.actor.ho_ten,
          assigned_to_id: input.actor.id_nhan_vien,
          assigned_to_name: input.actor.ho_ten,
        },
      });
      groupLink = { id: relation.id, group_id, group_name };
    }

    return { customer: created as unknown as KhachHang, groupLink };
  });
}
