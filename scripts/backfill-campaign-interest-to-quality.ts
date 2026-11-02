import { prisma } from '../src/lib/db/client';
import { buildMembershipScoreInput, planCanonicalQualificationSync } from '../src/lib/crm-funnel/membership-workflow';
import { calculateLeadQuality } from '../src/lib/crm-funnel/scoring';

const apply = process.argv.includes('--apply');

async function main() {
  const memberships = await prisma.campaignMembership.findMany({
    where: {
      muc_do_quan_tam: 'Quan tâm',
      NOT: { trang_thai_cham_soc: { in: ['Sai số', 'Không phù hợp'] } },
    },
    select: {
      customer_id: true,
      campaign: { select: { name: true, ten_du_an: true } },
      san_pham_quan_tam: true,
      nhu_cau: true,
      ngan_sach_min: true,
      ngan_sach_max: true,
      muc_dich: true,
      thoi_gian_du_kien: true,
      phuong_an_tai_chinh: true,
      khu_vuc_yeu_cau: true,
      muc_do_quan_tam: true,
      hanh_dong_tiep_theo: true,
      trang_thai_cham_soc: true,
      updated_at: true,
    },
  });
  const customerIds = [...new Set(memberships.map(item => item.customer_id))];
  const customers = await prisma.khachHang.findMany({
    where: { id_khach_hang: { in: customerIds } },
    select: {
      id_khach_hang: true,
      qualification_status: true,
      lead_quality_score: true,
      ngay_quan_tam: true,
      qualified_at: true,
      hot_at: true,
    },
  });
  const customerById = new Map(customers.map(customer => [customer.id_khach_hang, customer]));

  // Một Customer có thể nằm trong nhiều Campaign. Chọn kết quả mạnh nhất để
  // backfill một lần, sau đó vẫn dùng cùng rule chống downgrade với runtime.
  const candidates = new Map<string, { membership: typeof memberships[number]; score: ReturnType<typeof calculateLeadQuality> }>();
  for (const membership of memberships) {
    const score = calculateLeadQuality(buildMembershipScoreInput(membership, membership.campaign));
    const current = candidates.get(membership.customer_id);
    if (!current || score.score > current.score.score) candidates.set(membership.customer_id, { membership, score });
  }

  const updates = [...candidates.entries()].flatMap(([customerId, candidate]) => {
    const customer = customerById.get(customerId);
    if (!customer) return [];
    if (customer.qualification_status === candidate.score.qualificationStatus && customer.lead_quality_score >= candidate.score.score) return [];
    const patch = planCanonicalQualificationSync(customer, {
      qualification_status: candidate.score.qualificationStatus,
      lead_quality_score: candidate.score.score,
      lead_quality_rank: candidate.score.rank,
      lead_score_breakdown: JSON.stringify(candidate.score.breakdown),
    }, candidate.membership.updated_at.toISOString());
    return patch ? [{ customerId, campaign: candidate.membership.campaign.name, from: customer.qualification_status, to: candidate.score.qualificationStatus, score: candidate.score.score, patch }] : [];
  });

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', matchedMemberships: memberships.length, customersToUpdate: updates.length, updates: updates.map(({ customerId, campaign, from, to, score }) => ({ customerId, campaign, from, to, score })) }, null, 2));
  if (apply && updates.length > 0) {
    await prisma.$transaction(async tx => {
      for (const update of updates) {
        await tx.khachHang.update({ where: { id_khach_hang: update.customerId }, data: update.patch });
      }
    });
    console.log(`Applied ${updates.length} customer qualification updates.`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => void prisma['$disconnect']());
