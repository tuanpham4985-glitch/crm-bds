/**
 * Idempotent recompute for Qualified Lead Funnel scoring fields.
 *
 * When to run:
 *   - After a scoring formula change in src/lib/crm-funnel/{config,scoring}.ts
 *     (e.g. the nguon_data weight removal), so lead_quality_score/rank on
 *     existing rows reflect the current formula instead of the value frozen
 *     at write time.
 *   - As a one-time legacy backfill pass if the business decides customers
 *     that already had care/interest signals before the Qualified Lead
 *     Funnel columns existed should be re-evaluated (see caveat below).
 *
 * What it does NOT do:
 *   - It never invents a trang_thai_cham_soc/operational status for a
 *     customer that never had one. RAW stays RAW; there is no signal to
 *     recover for genuinely untouched legacy rows because the care-status
 *     columns themselves are new (added by the same migration). If the
 *     business later maps legacy fields (label_khach, ghi_chu_lan_1..3) to
 *     an inferred status, that must be an explicit, reviewed decision, not
 *     something this script guesses.
 *   - It never triggers a handoff. Recompute only updates score/rank/status
 *     and lead_score_history; it does not re-run maybeCreateHandoff. Any
 *     newly-INTERESTED-by-recompute customer must go through the normal
 *     telesale/qualification flow (or a separate, explicitly-approved pass)
 *     to be handed off.
 *
 * Idempotency: recomputing twice in a row with no other writes produces the
 * same score/rank/status and appends no-op history entries only when the
 * value actually changed (old !== new).
 *
 * This script is NOT wired into any npm script and must be run manually,
 * against a non-production DATABASE_URL, by someone who has reviewed the
 * diff it prints. It performs a dry run by default; pass --apply to write.
 *
 *   tsx --env-file=.env.local scripts/recompute-lead-quality.ts            # dry run
 *   tsx --env-file=.env.local scripts/recompute-lead-quality.ts --apply    # writes
 */
import { prisma } from '../src/lib/db/client';
import { calculateLeadQuality } from '../src/lib/crm-funnel/scoring';
import { parseJsonList } from '../src/lib/crm-workflow';
import type { LeadScoreHistoryEntry } from '../src/lib/types';

const APPLY = process.argv.includes('--apply');

async function main() {
  const customers = await prisma.khachHang.findMany();
  let changed = 0;

  for (const customer of customers) {
    const result = calculateLeadQuality(customer as Parameters<typeof calculateLeadQuality>[0]);
    const sameScore = result.score === customer.lead_quality_score;
    const sameRank = result.rank === customer.lead_quality_rank;
    const sameStatus = result.qualificationStatus === customer.qualification_status;
    if (sameScore && sameRank && sameStatus) continue;

    changed++;
    console.log(
      `${customer.id_khach_hang} (${customer.ten_KH}): ` +
      `score ${customer.lead_quality_score}->${result.score}, ` +
      `rank ${customer.lead_quality_rank}->${result.rank}, ` +
      `status ${customer.qualification_status}->${result.qualificationStatus}`,
    );
    if (!APPLY) continue;

    const history = parseJsonList<LeadScoreHistoryEntry>(customer.lead_score_history ?? undefined);
    const entry: LeadScoreHistoryEntry = {
      at: new Date().toISOString(),
      actor_id: 'SYSTEM_RECOMPUTE',
      actor_name: 'Recompute script',
      old_score: customer.lead_quality_score,
      new_score: result.score,
      old_rank: customer.lead_quality_rank as LeadScoreHistoryEntry['old_rank'],
      new_rank: result.rank,
      breakdown: result.breakdown,
    };
    await prisma.khachHang.update({
      where: { id_khach_hang: customer.id_khach_hang },
      data: {
        lead_quality_score: result.score,
        lead_quality_rank: result.rank,
        qualification_status: result.qualificationStatus,
        lead_score_breakdown: JSON.stringify(result.breakdown),
        lead_score_history: JSON.stringify([...history, entry]),
        row_version: { increment: 1 },
      },
    });
  }

  console.log(`\n${APPLY ? 'Applied' : 'Would change'}: ${changed}/${customers.length} customers.`);
  if (!APPLY && changed > 0) console.log('Re-run with --apply to write these changes.');
}

main().finally(() => prisma.$disconnect());
