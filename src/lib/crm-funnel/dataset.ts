// CUSTOMER DATASET (audit DATASET_ARCHITECTURE_NEEDS_AUTHORITY_DECISION,
// business đã CHỐT Option B) — Dataset là nguồn/lô data logic, CÓ THỂ gồm
// nhiều CrmImportBatch. Customer M:N Dataset qua CustomerDatasetMembership —
// 1 Customer có thể thuộc nhiều Dataset cùng lúc, vẫn CHỈ 1 bản ghi KhachHang
// duy nhất (KHÔNG duplicate Customer theo Dataset).
//
// KHÔNG thay thế/tái sử dụng KhachHang.import_batch_id — cột đó GIỮ NGUYÊN ý
// nghĩa cũ (batch nào TẠO customer này lần đầu). CustomerDatasetMembership là
// authority RIÊNG, độc lập, cho "Customer này có thuộc Dataset X hay không".
//
// KHÔNG đụng CampaignMembership/Campaign/DuAn — Dataset hoàn toàn tách biệt
// khỏi model Campaign-first đã chốt (không có Campaign.dataset_id, xem
// schema.prisma comment trên model Dataset).
import { prisma } from '../db/client';
import { isPostgresEnabled } from '../db/feature-flags';
import { assertTransactionalCrm } from './transactional-workflow';
import type { CrmSessionUser } from '../crm-auth';

export interface CreateDatasetInput {
  name: string;
  actor: CrmSessionUser;
}

export async function createDataset(input: CreateDatasetInput) {
  assertTransactionalCrm();
  return prisma.dataset.create({
    data: {
      name: input.name,
      created_by_id: input.actor.id_nhan_vien,
      created_by_name: input.actor.ho_ten,
    },
  });
}

export async function listDatasets() {
  assertTransactionalCrm();
  return prisma.dataset.findMany({ orderBy: { created_at: 'desc' } });
}

export async function getDataset(id: string) {
  assertTransactionalCrm();
  return prisma.dataset.findUnique({ where: { id } });
}

/**
 * "Đã vào Campaign" ở /khach-hang dùng getCampaignMembershipCustomerRefs()
 * (campaign.ts) qua ĐÚNG 1 query rồi build Set phía caller — Dataset filter
 * dùng CHUNG pattern này (không N+1 dù dataset có hàng nghìn Customer). KHÔNG
 * throw khi Postgres CRM chưa bật — trang /khach-hang phải luôn render được.
 */
export async function getDatasetMembershipCustomerRefs(datasetId: string): Promise<{ customer_id: string }[]> {
  if (!datasetId || !isPostgresEnabled('crm') || !process.env.DATABASE_URL) return [];
  return prisma.customerDatasetMembership.findMany({ where: { dataset_id: datasetId }, select: { customer_id: true } });
}

/**
 * Dataset như MỘT chiều filter nữa cho Customer Range/Filter → Campaign
 * (resolveCustomerIdsByRange/resolveCustomerIdsByFilter, campaign.ts) — tái
 * dùng getDatasetMembershipCustomerRefs (1 query) thay vì viết lại range/filter
 * engine thứ 2. Không truyền datasetId -> trả về nguyên input, không đụng gì.
 */
export async function filterByDataset<T extends { id_khach_hang: string }>(
  customers: readonly T[],
  datasetId?: string,
): Promise<T[]> {
  if (!datasetId) return [...customers];
  const refs = await getDatasetMembershipCustomerRefs(datasetId);
  const memberSet = new Set(refs.map(ref => ref.customer_id));
  return customers.filter(customer => memberSet.has(customer.id_khach_hang));
}

const MEMBERSHIP_INSERT_CHUNK_SIZE = 500;

/**
 * Idempotent: createMany + skipDuplicates dựa vào @@unique([customer_id,
 * dataset_id]) — gọi lại nhiều lần với cùng input (VD retry sau lỗi mạng,
 * hoặc re-import cùng Customer vào cùng Dataset) không bao giờ tạo dòng
 * membership trùng. Dedupe customerIds ở phía caller trước khi gọi (Set) —
 * hàm này cũng tự dedupe lại 1 lần nữa cho chắc (input có thể tới từ nhiều
 * nguồn gộp lại, VD ready + already_exists trong cùng 1 lần import).
 * Chunk để tránh 1 câu lệnh createMany quá lớn trên file hàng nghìn dòng,
 * cùng tinh thần PG_INSERT_CHUNK_SIZE của import-excel/route.ts (không dùng
 * chung hằng số vì 2 nơi khác mục đích, nhưng cùng lý do kỹ thuật).
 */
export async function ensureCustomerDatasetMemberships(
  customerIds: readonly string[],
  datasetId: string,
): Promise<{ attempted: number }> {
  assertTransactionalCrm();
  const uniqueIds = [...new Set(customerIds)];
  for (let start = 0; start < uniqueIds.length; start += MEMBERSHIP_INSERT_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(start, start + MEMBERSHIP_INSERT_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    await prisma.customerDatasetMembership.createMany({
      data: chunk.map(customer_id => ({ customer_id, dataset_id: datasetId })),
      skipDuplicates: true,
    });
  }
  return { attempted: uniqueIds.length };
}

// --- Remediation path cho dữ liệu production đã import TRƯỚC KHI Dataset
// tồn tại (audit: 3.346/3.346 Customer hiện có đều có import_batch_id, đến
// từ 3 CrmImportBatch của CÙNG 1 file "DATA MKT VIN HẠ LONG XANH.xlsx") ------
//
// CHỈ hợp lệ cho Customer ĐƯỢC TẠO BỞI batch đã chọn (import_batch_id trỏ
// đúng batch đó) — đây là provenance DUY NHẤT còn tin cậy được. KHÔNG BAO GIỜ
// cố dựng lại "already_exists" trong lịch sử (dữ liệu đó chưa từng được ghi
// DB, không thể phục hồi — xem audit). KHÔNG tự động đoán/gộp theo tên file —
// Admin phải tự chọn đúng batch cần gán. KHÔNG chạy tự động lúc migration/
// deploy — chỉ chạy khi Admin bấm xác nhận qua API riêng.

export interface DatasetBackfillPreflight {
  dataset: { id: string; name: string } | null;
  batches: { id: string; filename: string; alreadyAssignedToThisDataset: boolean; assignedToOtherDataset: boolean }[];
  /** Batch đã thuộc Dataset KHÁC bị loại khỏi backfill (không tự ý cướp/gộp provenance) — xem batches[].assignedToOtherDataset. */
  eligibleBatchIds: string[];
  totalCustomersFromEligibleBatches: number;
  alreadyMember: number;
  willCreate: number;
}

export async function getDatasetBackfillPreflight(
  datasetId: string,
  batchIds: readonly string[],
): Promise<DatasetBackfillPreflight> {
  assertTransactionalCrm();
  const [dataset, batches] = await Promise.all([
    prisma.dataset.findUnique({ where: { id: datasetId }, select: { id: true, name: true } }),
    prisma.crmImportBatch.findMany({
      where: { id: { in: [...batchIds] } },
      select: { id: true, filename: true, dataset_id: true },
    }),
  ]);
  const batchInfos = batches.map(b => ({
    id: b.id,
    filename: b.filename,
    alreadyAssignedToThisDataset: b.dataset_id === datasetId,
    assignedToOtherDataset: Boolean(b.dataset_id) && b.dataset_id !== datasetId,
  }));
  // Loại batch đã thuộc Dataset KHÁC — không tự ý gộp/cướp provenance của
  // Dataset đó (xem comment đầu file). Batch chưa gán (null) hoặc đã gán
  // ĐÚNG Dataset này (re-run idempotent) đều hợp lệ.
  const eligibleBatchIds = batchInfos.filter(b => !b.assignedToOtherDataset).map(b => b.id);
  const customers = eligibleBatchIds.length
    ? await prisma.khachHang.findMany({ where: { import_batch_id: { in: eligibleBatchIds } }, select: { id_khach_hang: true } })
    : [];
  const customerIds = customers.map(c => c.id_khach_hang);
  const existingMemberships = customerIds.length
    ? await prisma.customerDatasetMembership.findMany({
        where: { dataset_id: datasetId, customer_id: { in: customerIds } },
        select: { customer_id: true },
      })
    : [];
  const alreadyMemberCount = existingMemberships.length;
  return {
    dataset: dataset ? { id: dataset.id, name: dataset.name } : null,
    batches: batchInfos,
    eligibleBatchIds,
    totalCustomersFromEligibleBatches: customerIds.length,
    alreadyMember: alreadyMemberCount,
    willCreate: customerIds.length - alreadyMemberCount,
  };
}

export interface DatasetBackfillResult {
  batchesAssigned: number;
  membershipsCreated: number;
}

/**
 * Thực thi remediation: (1) gán dataset_id cho các batch ĐỦ ĐIỀU KIỆN (chưa
 * thuộc Dataset khác — re-check lại ở đây, không chỉ tin preflight, tránh
 * TOCTOU); (2) tạo CustomerDatasetMembership cho MỌI Customer mà
 * import_batch_id trỏ đúng 1 trong các batch đó. Idempotent hoàn toàn — gọi
 * lại nhiều lần với cùng input cho cùng kết quả cuối, không tạo trùng.
 */
export async function applyDatasetBackfill(
  datasetId: string,
  batchIds: readonly string[],
): Promise<DatasetBackfillResult> {
  assertTransactionalCrm();
  const batches = await prisma.crmImportBatch.findMany({
    where: { id: { in: [...batchIds] } },
    select: { id: true, dataset_id: true },
  });
  const eligibleBatchIds = batches.filter(b => !b.dataset_id || b.dataset_id === datasetId).map(b => b.id);
  if (eligibleBatchIds.length === 0) return { batchesAssigned: 0, membershipsCreated: 0 };

  const { count: batchesAssigned } = await prisma.crmImportBatch.updateMany({
    where: { id: { in: eligibleBatchIds }, dataset_id: null },
    data: { dataset_id: datasetId },
  });

  const customers = await prisma.khachHang.findMany({
    where: { import_batch_id: { in: eligibleBatchIds } },
    select: { id_khach_hang: true },
  });
  const before = await prisma.customerDatasetMembership.count({ where: { dataset_id: datasetId } });
  await ensureCustomerDatasetMemberships(customers.map(c => c.id_khach_hang), datasetId);
  const after = await prisma.customerDatasetMembership.count({ where: { dataset_id: datasetId } });

  return { batchesAssigned, membershipsCreated: after - before };
}
