import { prisma } from '../../src/lib/db/client';

async function main() {
  const rows = await prisma.$queryRaw<{ tablename: string; indexname: string }[]>`
    SELECT tablename, indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE '%_idx'
    ORDER BY tablename, indexname
  `;
  console.log(`Total indexes: ${rows.length}`);
  for (const r of rows) console.log(`  ${r.tablename}.${r.indexname}`);
}

main().finally(() => prisma.$disconnect());
