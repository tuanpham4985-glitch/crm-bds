import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { isPostgresEnabled } from '@/lib/db/feature-flags';

const PG_MODULES = ['tm', 'hrm', 'crm', 'contracts', 'attendance'] as const;

export async function GET() {
  const pgEnabled = PG_MODULES.filter(m => isPostgresEnabled(m));

  let pgStatus: 'ok' | 'error' = 'ok';
  let pgLatencyMs: number | null = null;
  let pgError: string | null = null;

  if (pgEnabled.length > 0) {
    const t0 = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      pgLatencyMs = Date.now() - t0;
    } catch (e) {
      pgStatus = 'error';
      pgError = e instanceof Error ? e.message : String(e);
      pgLatencyMs = Date.now() - t0;
    }
  }

  const status = pgStatus === 'error' ? 503 : 200;

  return NextResponse.json(
    {
      ok: pgStatus === 'ok',
      timestamp: new Date().toISOString(),
      pg: {
        status: pgEnabled.length === 0 ? 'disabled' : pgStatus,
        latency_ms: pgLatencyMs,
        enabled_modules: pgEnabled,
        error: pgError,
      },
    },
    { status },
  );
}
