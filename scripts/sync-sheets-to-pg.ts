#!/usr/bin/env npx ts-node
// ============================================================
// CRM BĐS — Initial Data Sync: Google Sheets → PostgreSQL
//
// Chạy một lần duy nhất để migrate toàn bộ dữ liệu hiện có.
// Sử dụng upsert để idempotent (chạy lại không tạo duplicate).
//
// Usage:
//   npx ts-node scripts/sync-sheets-to-pg.ts [--module=tm,hrm,crm,...]
//   npx ts-node scripts/sync-sheets-to-pg.ts --module=all
//
// Requires DATABASE_URL in .env.local
// ============================================================

import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

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

// Task Management sheets client
import { loadRows } from '../src/lib/task-management/sheets/client';
import { SHEET_NAMES } from '../src/lib/task-management/types';

// ── CLI args ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const moduleArg = args.find(a => a.startsWith('--module='))?.replace('--module=', '') ?? 'all';
const enabledModules = moduleArg === 'all'
  ? ['tm', 'hrm', 'crm', 'attendance', 'contracts']
  : moduleArg.split(',').map(s => s.trim());

// ── Helpers ───────────────────────────────────────────────────

function log(module: string, msg: string) {
  console.log(`[sync:${module}] ${msg}`);
}

function err(module: string, msg: string, e?: unknown) {
  console.error(`[sync:${module}] ERROR ${msg}`, e instanceof Error ? e.message : e);
}

async function syncModule(name: string, fn: () => Promise<{ synced: number; skipped: number; errors: number }>) {
  if (!enabledModules.includes(name)) return;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Syncing: ${name.toUpperCase()}`);
  try {
    const result = await fn();
    console.log(`✓ ${name}: synced=${result.synced}  skipped=${result.skipped}  errors=${result.errors}`);
  } catch (e) {
    err(name, 'sync failed', e);
  }
}

// ── Module sync functions ─────────────────────────────────────

async function syncHrm() {
  const rows = await getNhanVien();
  let synced = 0; let skipped = 0; let errors = 0;

  for (const nv of rows) {
    if (!nv.id_nhan_vien) { skipped++; continue; }
    try {
      await prisma.nhanVien.upsert({
        where:  { id_nhan_vien: nv.id_nhan_vien },
        create: {
          id_nhan_vien:            nv.id_nhan_vien,
          ho_ten:                  nv.ho_ten,
          so_dien_thoai:           nv.so_dien_thoai,
          email:                   nv.email || `${nv.id_nhan_vien}@placeholder.local`,
          vai_tro:                 nv.vai_tro,
          employee_type:           nv.employee_type,
          gioi_tinh:               nv.gioi_tinh,
          khu_vuc:                 nv.khu_vuc,
          phong_KD:                nv.phong_KD,
          ql_truc_tiep:            nv.ql_truc_tiep,
          so_cccd:                 nv.so_cccd,
          ngay_cap:                nv.ngay_cap,
          noi_cap:                 nv.noi_cap,
          HKTT:                    nv.HKTT,
          ngay_sinh:               nv.ngay_sinh,
          ma_so_thue:              nv.ma_so_thue,
          so_nguoi_phu_thuoc:      nv.so_nguoi_phu_thuoc,
          trang_thai:              nv.trang_thai,
          ngay_tao:                nv.ngay_tao,
          avatar_url:              nv.avatar_url,
          mat_khau:                nv.mat_khau,
          so_tk_ngan_hang:         nv.so_tk_ngan_hang,
          ten_ngan_hang_thu_huong: nv.ten_ngan_hang_thu_huong,
        },
        update: {
          ho_ten:        nv.ho_ten,
          trang_thai:    nv.trang_thai,
          employee_type: nv.employee_type,
          vai_tro:       nv.vai_tro,
          avatar_url:    nv.avatar_url,
        },
      });
      synced++;
    } catch (e) {
      err('hrm', `upsert ${nv.id_nhan_vien}`, e);
      errors++;
    }
  }
  return { synced, skipped, errors };
}

async function syncCrm() {
  // KhachHang
  const customers = await getKhachHang();
  let synced = 0; let skipped = 0; let errors = 0;

  for (const kh of customers) {
    if (!kh.id_khach_hang) { skipped++; continue; }
    try {
      await prisma.khachHang.upsert({
        where:  { id_khach_hang: kh.id_khach_hang },
        create: {
          id_khach_hang:  kh.id_khach_hang,
          ngay_tao:       kh.ngay_tao,
          ten_KH:         kh.ten_KH,
          so_dien_thoai:  kh.so_dien_thoai,
          email:          kh.email,
          nguon:          kh.nguon,
          nhu_cau:        kh.nhu_cau,
          ghi_chu:        kh.ghi_chu,
          sale_phu_trach: kh.sale_phu_trach,
          label_khach:    kh.label_khach,
          du_an:          kh.du_an,
          sale_lan_1:     kh.sale_lan_1,
          ghi_chu_lan_1:  kh.ghi_chu_lan_1,
          sale_lan_2:     kh.sale_lan_2,
          ghi_chu_lan_2:  kh.ghi_chu_lan_2,
          sale_lan_3:     kh.sale_lan_3,
          ghi_chu_lan_3:  kh.ghi_chu_lan_3,
        },
        update: {
          ten_KH:         kh.ten_KH,
          sale_phu_trach: kh.sale_phu_trach,
          label_khach:    kh.label_khach,
          ghi_chu:        kh.ghi_chu,
        },
      });
      synced++;
    } catch (e) {
      err('crm:khach-hang', `upsert ${kh.id_khach_hang}`, e);
      errors++;
    }
  }
  log('crm', `KhachHang: ${synced} synced`);

  // Pipeline
  const pipelines = await getPipeline();
  for (const pl of pipelines) {
    if (!pl.id_pipeline) { skipped++; continue; }
    try {
      await prisma.pipeline.upsert({
        where:  { id_pipeline: pl.id_pipeline },
        create: {
          id_pipeline:     pl.id_pipeline,
          id_khach_hang:   pl.id_khach_hang,
          giai_doan:       pl.giai_doan,
          gia_tri_thuc_te: pl.gia_tri_thuc_te,
          sale_phu_trach:  pl.sale_phu_trach,
          id_du_an:        pl.id_du_an,
          ten_du_an:       pl.ten_du_an,
          hoa_hong:        pl.hoa_hong,
          tien_hoa_hong:   pl.tien_hoa_hong,
          ngay_cap_nhat:   pl.ngay_cap_nhat,
          thang:           pl.thang,
          ma_can:          pl.ma_can,
          loai_can:        pl.loai_can,
          gdda:            pl.gdda,
          gdkd:            pl.gdkd,
          phong_kd:        pl.phong_kd,
          ho_ten_kh:       pl.ho_ten_kh,
        },
        update: {
          giai_doan:       pl.giai_doan,
          gia_tri_thuc_te: pl.gia_tri_thuc_te,
          hoa_hong:        pl.hoa_hong,
          tien_hoa_hong:   pl.tien_hoa_hong,
          ngay_cap_nhat:   pl.ngay_cap_nhat,
        },
      });
      synced++;
    } catch (e) {
      err('crm:pipeline', `upsert ${pl.id_pipeline}`, e);
      errors++;
    }
  }
  log('crm', `Pipeline: ${synced} synced`);

  // DuAn
  const duAns = await getDuAn();
  for (const da of duAns) {
    if (!da.id_du_an) { skipped++; continue; }
    try {
      await prisma.duAn.upsert({
        where:  { id_du_an: da.id_du_an },
        create: {
          id_du_an:          da.id_du_an,
          ma_du_an:          da.ma_du_an,
          ten_du_an:         da.ten_du_an,
          hien_thi:          da.hien_thi,
          hoa_hong_mac_dinh: da.hoa_hong_mac_dinh,
          link_tai_lieu:     da.link_tai_lieu,
          chu_dau_tu:        da.chu_dau_tu,
          link_du_an:        da.link_du_an,
          stacking_config:   da.stacking_config,
          truong_nhom:       da.truong_nhom,
          ds_sale:           da.ds_sale,
        },
        update: {
          ten_du_an:         da.ten_du_an,
          hien_thi:          da.hien_thi,
          hoa_hong_mac_dinh: da.hoa_hong_mac_dinh,
        },
      });
      synced++;
    } catch (e) {
      err('crm:du-an', `upsert ${da.id_du_an}`, e);
      errors++;
    }
  }
  log('crm', `DuAn: ${synced} synced`);

  // CongViec
  const congViecs = await getCongViec();
  for (const cv of congViecs) {
    if (!cv.id_cong_viec) { skipped++; continue; }
    try {
      await prisma.congViec.upsert({
        where:  { id_cong_viec: cv.id_cong_viec },
        create: {
          id_cong_viec:   cv.id_cong_viec,
          ngay_tao:       cv.ngay_tao,
          ghi_chu:        cv.ghi_chu,
          id_pipeline:    cv.id_pipeline,
          trang_thai:     cv.trang_thai,
          ngay_hen:       cv.ngay_hen,
          sale_phu_trach: cv.sale_phu_trach,
          ket_qua:        cv.ket_qua,
        },
        update: {
          trang_thai: cv.trang_thai,
          ket_qua:    cv.ket_qua,
        },
      });
      synced++;
    } catch (e) {
      err('crm:cong-viec', `upsert ${cv.id_cong_viec}`, e);
      errors++;
    }
  }
  log('crm', `CongViec: ${synced} synced`);

  return { synced, skipped, errors };
}

async function syncContracts() {
  const rows = await getHopDong();
  let synced = 0; let skipped = 0; let errors = 0;

  for (const hd of rows) {
    if (!hd.id) { skipped++; continue; }
    try {
      await prisma.hopDong.upsert({
        where:  { id: hd.id },
        create: {
          id:            hd.id,
          id_nhan_vien:  hd.id_nhan_vien,
          ten_nhan_vien: hd.ten_nhan_vien,
          so_hop_dong:   hd.so_hop_dong,
          phong_KD:      hd.phong_KD,
          employee_type: hd.employee_type,
          department:    hd.department,
          contract_type: hd.contract_type,
          template_file: hd.template_file,
          ngay_bat_dau:  hd.ngay_bat_dau,
          ngay_ket_thuc: hd.ngay_ket_thuc,
          luong_co_ban:  hd.luong_co_ban,
          ghi_chu:       hd.ghi_chu,
        },
        update: {
          luong_co_ban:  hd.luong_co_ban,
          ngay_ket_thuc: hd.ngay_ket_thuc,
        },
      });
      synced++;
    } catch (e) {
      err('contracts', `upsert ${hd.id}`, e);
      errors++;
    }
  }
  return { synced, skipped, errors };
}

async function syncAttendance() {
  const rows = await getChamCongNgoai();
  let synced = 0; let skipped = 0; let errors = 0;

  for (const cc of rows) {
    if (!cc.id) { skipped++; continue; }
    try {
      await prisma.chamCongNgoai.upsert({
        where:  { id: cc.id },
        create: {
          id:               cc.id,
          id_nhan_vien:     cc.id_nhan_vien,
          ho_ten:           cc.ho_ten,
          ngay:             cc.ngay,
          gio_bat_dau:      cc.gio_bat_dau,
          gio_ket_thuc:     cc.gio_ket_thuc,
          du_an_khach_hang: cc.du_an_khach_hang,
          dia_diem:         cc.dia_diem,
          ghi_chu:          cc.ghi_chu,
          vi_tri_gps:       cc.vi_tri_gps,
          ql_truc_tiep:     cc.ql_truc_tiep,
          trang_thai:       cc.trang_thai,
          nguoi_duyet:      cc.nguoi_duyet,
          ghi_chu_duyet:    cc.ghi_chu_duyet,
        },
        update: {
          trang_thai:    cc.trang_thai,
          nguoi_duyet:   cc.nguoi_duyet,
          ghi_chu_duyet: cc.ghi_chu_duyet,
        },
      });
      synced++;
    } catch (e) {
      err('attendance', `upsert ${cc.id}`, e);
      errors++;
    }
  }
  return { synced, skipped, errors };
}

async function syncTm() {
  let synced = 0; let skipped = 0; let errors = 0;

  // TM_Users
  const users = await loadRows(SHEET_NAMES.USERS);
  for (const u of users) {
    if (!u.user_id) { skipped++; continue; }
    try {
      await prisma.tmUser.upsert({
        where:  { user_id: u.user_id },
        create: {
          user_id:       u.user_id,
          employee_code: u.employee_code || u.user_id,
          full_name:     u.full_name || '',
          email:         u.email || `${u.user_id}@placeholder.local`,
          phone:         u.phone,
          department_id: u.department_id || 'default',
          team_id:       u.team_id,
          role:          u.role || 'staff',
          position:      u.position,
          avatar_url:    u.avatar_url,
          zalo_id:       u.zalo_id,
          is_active:     u.is_active === 'TRUE',
        },
        update: {
          full_name:  u.full_name,
          role:       u.role,
          is_active:  u.is_active === 'TRUE',
          avatar_url: u.avatar_url,
        },
      });
      synced++;
    } catch (e) {
      err('tm:users', `upsert ${u.user_id}`, e);
      errors++;
    }
  }
  log('tm', `Users: ${synced} synced`);

  // TM_Departments
  const depts = await loadRows(SHEET_NAMES.DEPARTMENTS);
  for (const d of depts) {
    if (!d.dept_id) { skipped++; continue; }
    try {
      await prisma.tmDepartment.upsert({
        where:  { dept_id: d.dept_id },
        create: {
          dept_id:       d.dept_id,
          name:          d.name || '',
          code:          d.code || d.dept_id,
          manager_id:    d.manager_id,
          parent_dept_id: d.parent_dept_id,
          description:   d.description,
          is_active:     d.is_active !== 'FALSE',
          sort_order:    parseInt(d.sort_order || '0', 10),
        },
        update: {
          name:       d.name,
          manager_id: d.manager_id,
          is_active:  d.is_active !== 'FALSE',
        },
      });
      synced++;
    } catch (e) {
      err('tm:depts', `upsert ${d.dept_id}`, e);
      errors++;
    }
  }
  log('tm', `Departments: ${synced} synced`);

  // TM_Projects
  const projects = await loadRows(SHEET_NAMES.PROJECTS);
  for (const p of projects) {
    if (!p.project_id) { skipped++; continue; }
    try {
      await prisma.tmProject.upsert({
        where:  { project_id: p.project_id },
        create: {
          project_id:    p.project_id,
          name:          p.name || '',
          code:          p.code,
          description:   p.description,
          owner_id:      p.owner_id || 'system',
          department_ids: p.department_ids,
          member_ids:    p.member_ids,
          status:        p.status || 'active',
          start_date:    p.start_date,
          end_date:      p.end_date,
          budget:        p.budget ? parseFloat(p.budget) : undefined,
          tags:          p.tags,
          created_by:    p.created_by || 'system',
        },
        update: {
          name:       p.name,
          status:     p.status,
          member_ids: p.member_ids,
        },
      });
      synced++;
    } catch (e) {
      err('tm:projects', `upsert ${p.project_id}`, e);
      errors++;
    }
  }
  log('tm', `Projects: ${synced} synced`);

  // TM_Tasks
  const tasks = await loadRows(SHEET_NAMES.TASKS);
  for (const t of tasks) {
    if (!t.task_id) { skipped++; continue; }
    try {
      await prisma.tmTask.upsert({
        where:  { task_id: t.task_id },
        create: {
          task_id:         t.task_id,
          task_code:       t.task_code || t.task_id,
          title:           t.title || '',
          objective:       t.objective,
          description:     t.description,
          project_id:      t.project_id || undefined,
          department_id:   t.department_id || undefined,
          owner_id:        t.owner_id || 'system',
          collaborator_ids: t.collaborator_ids,
          priority:        t.priority || 'medium',
          status:          t.status || 'todo',
          progress_pct:    parseInt(t.progress_pct || '0', 10),
          start_date:      t.start_date,
          due_date:        t.due_date,
          estimated_hours: t.estimated_hours ? parseFloat(t.estimated_hours) : undefined,
          actual_hours:    parseFloat(t.actual_hours || '0'),
          approval_level:  parseInt(t.approval_level || '1', 10),
          approval_status: t.approval_status || 'not_required',
          approved_by:     t.approved_by || undefined,
          approved_at:     t.approved_at || undefined,
          rejection_reason: t.rejection_reason || undefined,
          tags:            t.tags,
          email_reminder:  t.email_reminder,
          email_reminder_sent: t.email_reminder_sent,
          created_by:      t.created_by || 'system',
          deleted_at:      t.deleted_at ? new Date(t.deleted_at) : undefined,
        },
        update: {
          title:          t.title,
          status:         t.status,
          progress_pct:   parseInt(t.progress_pct || '0', 10),
          approval_status: t.approval_status,
          priority:       t.priority,
        },
      });
      synced++;
    } catch (e) {
      err('tm:tasks', `upsert ${t.task_id}`, e);
      errors++;
    }
  }
  log('tm', `Tasks: ${synced} synced`);

  // TM_Subtasks
  const subtasks = await loadRows(SHEET_NAMES.SUBTASKS);
  for (const s of subtasks) {
    if (!s.subtask_id || !s.parent_task_id) { skipped++; continue; }
    try {
      await prisma.tmSubtask.upsert({
        where:  { subtask_id: s.subtask_id },
        create: {
          subtask_id:      s.subtask_id,
          subtask_code:    s.subtask_code || s.subtask_id,
          parent_task_id:  s.parent_task_id,
          title:           s.title || '',
          objective:       s.objective,
          description:     s.description,
          owner_id:        s.owner_id || 'system',
          collaborator_ids: s.collaborator_ids,
          priority:        s.priority || 'medium',
          status:          s.status || 'todo',
          progress_pct:    parseInt(s.progress_pct || '0', 10),
          start_date:      s.start_date,
          due_date:        s.due_date,
          estimated_hours: s.estimated_hours ? parseFloat(s.estimated_hours) : undefined,
          actual_hours:    parseFloat(s.actual_hours || '0'),
          created_by:      s.created_by || 'system',
          deleted_at:      s.deleted_at ? new Date(s.deleted_at) : undefined,
        },
        update: {
          title:        s.title,
          status:       s.status,
          progress_pct: parseInt(s.progress_pct || '0', 10),
        },
      });
      synced++;
    } catch (e) {
      err('tm:subtasks', `upsert ${s.subtask_id}`, e);
      errors++;
    }
  }
  log('tm', `Subtasks: ${synced} synced`);

  return { synced, skipped, errors };
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(50));
  console.log('CRM BĐS — Sheets → PostgreSQL Sync');
  console.log('='.repeat(50));
  console.log(`Modules: ${enabledModules.join(', ')}`);
  console.log(`Database: ${(process.env.DATABASE_URL ?? '').replace(/:([^:@]+)@/, ':***@')}`);

  // Verify DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✓ Database connection OK\n');
  } catch (e) {
    console.error('✗ Database connection FAILED:', e instanceof Error ? e.message : e);
    console.error('  → Set DATABASE_URL in .env.local and run: npx prisma migrate dev');
    process.exit(1);
  }

  await syncModule('hrm',        syncHrm);
  await syncModule('crm',        syncCrm);
  await syncModule('contracts',  syncContracts);
  await syncModule('attendance', syncAttendance);
  await syncModule('tm',         syncTm);

  console.log('\n' + '='.repeat(50));
  console.log('Sync complete. Run verify script to check integrity:');
  console.log('  npx ts-node scripts/verify-data-integrity.ts');
  console.log('='.repeat(50));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
