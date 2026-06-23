// ============================================================
// CRM BĐS — Prisma Client Singleton (Prisma 7)
//
// Prisma 7 requires a driver adapter — URL is not in schema.prisma.
// Uses @prisma/adapter-pg for standard PostgreSQL (incl. Neon).
//
// The client is LAZY: instantiation succeeds even without a
// live database. Errors only happen when a query actually runs.
// Since PG_ENABLED_MODULES defaults to empty, this client is
// never called in Phase 0 — safe to deploy without DATABASE_URL.
// ============================================================

import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Return a client that will throw on first query with a clear error.
    // This path is only hit when PG_ENABLED_MODULES is non-empty but
    // DATABASE_URL has not been set — which shouldn't happen in practice.
    const adapter = new PrismaPg({ connectionString: 'postgresql://unreachable' });
    return new PrismaClient({ adapter });
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

// Reuse across hot reloads in dev to avoid exhausting connection pool
if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
