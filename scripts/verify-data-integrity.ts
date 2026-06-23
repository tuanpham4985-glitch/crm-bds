#!/usr/bin/env npx ts-node
// ============================================================
// CRM BĐS — Data Integrity Checker: GS vs PostgreSQL
//
// So sánh số lượng records và giá trị key fields giữa GS và PG.
// Chạy sau sync script và định kỳ trong Phase 1 (shadow write).
//
// Usage:
//   npx ts-node scripts/verify-data-integrity.ts
//   npx ts-node scripts/verify-data-integrity.ts --module=hrm,crm
//
// Output: báo cáo divergence, exit code 1 nếu có sai lệch
// ============================================================

import { prisma } from '../src/lib/db/client';
import {
  getNhanVien,
  getKhachHang,
  getPipeline,
  getDuAn,
  getCongViec,
  getHopDong,
  getChamCongNgoai,
} from '../src/lib/google-sheets';
import { loadRows } from '../src/lib/task-management/sheets/client';
import { SHEET_NAMES } from '../src/lib/task-management/types';

// ── CLI args ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const moduleArg = args.find(a => a.startsWith('--module='))?.replace('--module=', '') ?? 'all';
const modules = moduleArg === 'all'
  ? ['hrm', 'crm', 'contracts', 'attendance', 'tm']
  : moduleArg.split(',').map(s => s.trim());

// ── Result tracker ────────────────────────────────────────────

interface CheckResult {
  entity:    string;
  gs_count:  number;
  pg_count:  number;
  match:     boolean;
  details:   string[];
}

const results: CheckResult[] = [];
let hasErrors = false;

function report(r: CheckResult) {
  results.push(r);
  const icon = r.match ? '✓' : '✗';
  const diff = r.pg_count - r.gs_count;
  const diffStr = diff === 0 ? '' : ` (diff: ${diff > 0 ? '+' : ''}${diff})`;
  console.log(`  ${icon} ${r.entity.padEnd(20)} GS=${r.gs_count}  PG=${r.pg_count}${diffStr}`);
  if (!r.match) {
    hasErrors = true;
    r.details.forEach(d => console.log(`      → ${d}`));
  }
}

async function check(
  entity: string,
  gsCount: number,
  pgCount: number,
  details: string[] = [],
) {
  const match = gsCount === pgCount;
  report({ entity, gs_count: gsCount, pg_count: pgCount, match, details });
}

// ── Checks ────────────────────────────────────────────────────

async function checkHrm() {
  console.log('\n[HRM]');
  const gsRows = await getNhanVien();
  const pgCount = await prisma.nhanVien.count();

  const details: string[] = [];
  if (gsRows.length !== pgCount) {
    const pgIds = new Set(
      (await prisma.nhanVien.findMany({ select: { id_nhan_vien: true } }))
        .map(r => r.id_nhan_vien)
    );
    const missingInPg = gsRows.filter(r => r.id_nhan_vien && !pgIds.has(r.id_nhan_vien));
    if (missingInPg.length > 0) {
      details.push(`${missingInPg.length} records missing in PG: ${missingInPg.slice(0, 5).map(r => r.id_nhan_vien).join(', ')}`);
    }
  }
  await check('NHAN_VIEN', gsRows.length, pgCount, details);
}

async function checkCrm() {
  console.log('\n[CRM]');

  const [gsKh, gsPl, gsDa, gsCv] = await Promise.all([
    getKhachHang(), getPipeline(), getDuAn(), getCongViec(),
  ]);
  const [pgKh, pgPl, pgDa, pgCv] = await Promise.all([
    prisma.khachHang.count(),
    prisma.pipeline.count(),
    prisma.duAn.count(),
    prisma.congViec.count(),
  ]);

  await check('KHACH_HANG', gsKh.length, pgKh);
  await check('PIPELINE',   gsPl.length, pgPl);
  await check('DU_AN',      gsDa.length, pgDa);
  await check('CONG_VIEC',  gsCv.length, pgCv);

  // Spot-check: compare tổng tien_hoa_hong
  const gsTotal = gsPl.reduce((s, p) => s + (p.tien_hoa_hong ?? 0), 0);
  const pgSum = await prisma.pipeline.aggregate({ _sum: { tien_hoa_hong: true } });
  const pgTotal = pgSum._sum.tien_hoa_hong ?? 0;
  const match = Math.abs(gsTotal - pgTotal) < 1; // allow 1 VND rounding
  report({
    entity:   'PIPELINE tien_hoa_hong',
    gs_count: Math.round(gsTotal),
    pg_count: Math.round(pgTotal),
    match,
    details:  match ? [] : [`GS sum=${gsTotal.toLocaleString()}  PG sum=${pgTotal.toLocaleString()}`],
  });
}

async function checkContracts() {
  console.log('\n[CONTRACTS]');
  const gsRows = await getHopDong();
  const pgCount = await prisma.hopDong.count();
  await check('HOP_DONG', gsRows.length, pgCount);
}

async function checkAttendance() {
  console.log('\n[ATTENDANCE]');
  const gsRows = await getChamCongNgoai();
  const pgCount = await prisma.chamCongNgoai.count();
  await check('CHAM_CONG_NGOAI', gsRows.length, pgCount);

  // Status distribution
  const gsByStatus = gsRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.trang_thai] = (acc[r.trang_thai] ?? 0) + 1;
    return acc;
  }, {});
  const pgByStatus = await prisma.chamCongNgoai.groupBy({
    by: ['trang_thai'],
    _count: true,
  });
  for (const [status, gsN] of Object.entries(gsByStatus)) {
    const pgN = pgByStatus.find(r => r.trang_thai === status)?._count ?? 0;
    await check(`  status:${status}`, gsN, pgN);
  }
}

async function checkTm() {
  console.log('\n[TASK MANAGEMENT]');

  const [gsUsers, gsDepts, gsProjects, gsTasks, gsSubtasks] = await Promise.all([
    loadRows(SHEET_NAMES.USERS),
    loadRows(SHEET_NAMES.DEPARTMENTS),
    loadRows(SHEET_NAMES.PROJECTS),
    loadRows(SHEET_NAMES.TASKS),
    loadRows(SHEET_NAMES.SUBTASKS),
  ]);
  const [pgUsers, pgDepts, pgProjects, pgTasks, pgSubtasks] = await Promise.all([
    prisma.tmUser.count(),
    prisma.tmDepartment.count(),
    prisma.tmProject.count(),
    prisma.tmTask.count(),
    prisma.tmSubtask.count(),
  ]);

  await check('TM_Users',       gsUsers.length,    pgUsers);
  await check('TM_Departments', gsDepts.length,    pgDepts);
  await check('TM_Projects',    gsProjects.length, pgProjects);
  await check('TM_Tasks',       gsTasks.length,    pgTasks);
  await check('TM_Subtasks',    gsSubtasks.length, pgSubtasks);

  // Spot-check: tasks per status
  const gsTasksByStatus = gsTasks.reduce<Record<string, number>>((acc, t) => {
    const s = t.status ?? 'unknown';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const pgTasksByStatus = await prisma.tmTask.groupBy({ by: ['status'], _count: true });
  for (const [status, gsN] of Object.entries(gsTasksByStatus)) {
    const pgN = pgTasksByStatus.find(r => r.status === status)?._count ?? 0;
    await check(`  task:${status}`, gsN, pgN);
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(55));
  console.log('CRM BĐS — Data Integrity: Google Sheets vs PostgreSQL');
  console.log('='.repeat(55));

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error('✗ Database connection FAILED:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  if (modules.includes('hrm'))        await checkHrm();
  if (modules.includes('crm'))        await checkCrm();
  if (modules.includes('contracts'))  await checkContracts();
  if (modules.includes('attendance')) await checkAttendance();
  if (modules.includes('tm'))         await checkTm();

  console.log('\n' + '='.repeat(55));
  const totalChecks = results.length;
  const passed = results.filter(r => r.match).length;
  const failed = totalChecks - passed;
  console.log(`Summary: ${passed}/${totalChecks} checks passed${failed > 0 ? `  (${failed} FAILED)` : ''}`);

  if (hasErrors) {
    console.log('\nFailed checks — run sync to fix:');
    console.log('  npx ts-node scripts/sync-sheets-to-pg.ts');
  } else {
    console.log('\n✓ All checks passed — GS and PG are in sync.');
  }
  console.log('='.repeat(55));

  await prisma.$disconnect();
  process.exit(hasErrors ? 1 : 0);
}

main().catch(async (e) => {
  console.error('Fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
