// ============================================================
// CRM BĐS — Task Management: Seed Data
// Chạy: npx tsx scripts/task-management/seed.ts
// ============================================================
import { initTaskManagementSheets, appendRows } from '../../src/lib/task-management/sheets/client';
import { SHEET_NAMES } from '../../src/lib/task-management/types';
import { randomUUID } from 'crypto';

const now = new Date().toISOString();

const DEPARTMENTS = [
  { dept_id: 'dept-kd',    name: 'Phòng Kinh doanh',        code: 'KD',    manager_id: 'user-tp-kd', parent_dept_id: '', description: 'Kinh doanh và bán hàng BĐS', is_active: 'TRUE', sort_order: '1', created_at: now, updated_at: now },
  { dept_id: 'dept-mkt',   name: 'Phòng Marketing',         code: 'MKT',   manager_id: 'user-tp-mkt', parent_dept_id: '', description: 'Marketing và truyền thông', is_active: 'TRUE', sort_order: '2', created_at: now, updated_at: now },
  { dept_id: 'dept-legal', name: 'Phòng Pháp lý',           code: 'LEGAL', manager_id: 'user-tp-legal', parent_dept_id: '', description: 'Pháp chế và hợp đồng', is_active: 'TRUE', sort_order: '3', created_at: now, updated_at: now },
  { dept_id: 'dept-pm',    name: 'Phòng Dự án & Đầu tư',   code: 'PM',    manager_id: 'user-bgd', parent_dept_id: '', description: 'Quản lý dự án', is_active: 'TRUE', sort_order: '4', created_at: now, updated_at: now },
  { dept_id: 'dept-hr',    name: 'Phòng Hành chính - NS',  code: 'HR',    manager_id: 'user-tp-hr', parent_dept_id: '', description: 'Hành chính nhân sự', is_active: 'TRUE', sort_order: '5', created_at: now, updated_at: now },
];

const USERS = [
  { user_id: 'user-bgd',     employee_code: 'NV001', full_name: 'Nguyễn Văn Giám đốc', email: 'giamdoc@bds.vn',   phone: '0901000001', department_id: 'dept-pm',    team_id: '', role: 'director',    position: 'Giám đốc',              avatar_url: '', zalo_id: '', is_active: 'TRUE', last_active_at: now, created_at: now, updated_at: now },
  { user_id: 'user-tp-kd',   employee_code: 'NV002', full_name: 'Trần Thị Trưởng KD', email: 'truongkd@bds.vn',  phone: '0901000002', department_id: 'dept-kd',    team_id: '', role: 'manager',     position: 'Trưởng phòng Kinh doanh', avatar_url: '', zalo_id: '', is_active: 'TRUE', last_active_at: now, created_at: now, updated_at: now },
  { user_id: 'user-tp-mkt',  employee_code: 'NV003', full_name: 'Lê Văn Marketing',   email: 'truongmkt@bds.vn', phone: '0901000003', department_id: 'dept-mkt',   team_id: '', role: 'manager',     position: 'Trưởng phòng Marketing', avatar_url: '', zalo_id: '', is_active: 'TRUE', last_active_at: now, created_at: now, updated_at: now },
  { user_id: 'user-tp-legal',employee_code: 'NV004', full_name: 'Phạm Thị Pháp lý',  email: 'truonglegal@bds.vn',phone: '0901000004',department_id: 'dept-legal', team_id: '', role: 'manager',     position: 'Trưởng phòng Pháp lý',  avatar_url: '', zalo_id: '', is_active: 'TRUE', last_active_at: now, created_at: now, updated_at: now },
  { user_id: 'user-tp-hr',   employee_code: 'NV005', full_name: 'Vũ Văn HR',          email: 'truonghr@bds.vn',  phone: '0901000005', department_id: 'dept-hr',    team_id: '', role: 'manager',     position: 'Trưởng phòng Hành chính', avatar_url: '', zalo_id: '', is_active: 'TRUE', last_active_at: now, created_at: now, updated_at: now },
  { user_id: 'user-tl-kd',   employee_code: 'NV006', full_name: 'Ngô Minh Team Lead', email: 'tl.kd@bds.vn',    phone: '0901000006', department_id: 'dept-kd',    team_id: '', role: 'team_leader', position: 'Team Leader KD',         avatar_url: '', zalo_id: '', is_active: 'TRUE', last_active_at: now, created_at: now, updated_at: now },
  { user_id: 'user-minh',    employee_code: 'NV007', full_name: 'Phạm Văn Minh',      email: 'minh@bds.vn',     phone: '0901000007', department_id: 'dept-kd',    team_id: '', role: 'staff',       position: 'Chuyên viên KD',         avatar_url: '', zalo_id: '', is_active: 'TRUE', last_active_at: now, created_at: now, updated_at: now },
  { user_id: 'user-lan',     employee_code: 'NV008', full_name: 'Nguyễn Thị Lan',     email: 'lan@bds.vn',      phone: '0901000008', department_id: 'dept-mkt',   team_id: '', role: 'staff',       position: 'Designer',               avatar_url: '', zalo_id: '', is_active: 'TRUE', last_active_at: now, created_at: now, updated_at: now },
  { user_id: 'user-hung',    employee_code: 'NV009', full_name: 'Vũ Anh Hùng',        email: 'hung@bds.vn',     phone: '0901000009', department_id: 'dept-legal', team_id: '', role: 'staff',       position: 'Chuyên viên Pháp lý',    avatar_url: '', zalo_id: '', is_active: 'TRUE', last_active_at: now, created_at: now, updated_at: now },
  { user_id: 'user-hoa',     employee_code: 'NV010', full_name: 'Trần Thị Hoa',       email: 'hoa@bds.vn',      phone: '0901000010', department_id: 'dept-kd',    team_id: '', role: 'staff',       position: 'Chuyên viên KD',         avatar_url: '', zalo_id: '', is_active: 'TRUE', last_active_at: now, created_at: now, updated_at: now },
];

const PROJECTS = [
  { project_id: 'proj-vop2',  name: 'Vinhomes Ocean Park Phase 2', code: 'VOP2',  description: 'Dự án căn hộ cao cấp ven biển Hải Phòng', owner_id: 'user-bgd', department_ids: '["dept-kd","dept-mkt","dept-legal","dept-pm"]', member_ids: '["user-minh","user-lan","user-hung","user-hoa"]', status: 'active',   start_date: '2026-01-01', end_date: '2026-12-31', budget: '5000000000', tags: 'vinhomes,hanoi', created_by: 'user-bgd', created_at: now, updated_at: now, archived_at: '' },
  { project_id: 'proj-manor', name: 'The Manor Central Park',      code: 'MANOR', description: 'Khu đô thị phức hợp trung tâm TP.HCM',    owner_id: 'user-bgd', department_ids: '["dept-kd","dept-legal"]',                    member_ids: '["user-minh","user-hung"]',                        status: 'planning', start_date: '2026-07-01', end_date: '2027-06-30', budget: '3000000000', tags: 'manor,hcm',     created_by: 'user-bgd', created_at: now, updated_at: now, archived_at: '' },
];

const TASKS = [
  {
    task_id: randomUUID(), task_code: 'T-2026-0001',
    title: 'Chiến dịch Telesale VOP2 - Tháng 6/2026',
    objective: 'Thực hiện 200 cuộc gọi telesale, đặt lịch ít nhất 40 buổi xem nhà trong tháng 6',
    description: 'Phân chia danh sách khách hàng tiềm năng, gọi điện theo kịch bản đã duyệt, log kết quả vào CRM.',
    project_id: 'proj-vop2', department_id: 'dept-kd', owner_id: 'user-minh',
    collaborator_ids: '[{"user_id":"user-lan","role":"contributor"},{"user_id":"user-tl-kd","role":"reviewer"}]',
    priority: 'high', status: 'inprogress', progress_pct: '40',
    start_date: '2026-06-01', due_date: '2026-06-30', estimated_hours: '80', actual_hours: '32',
    kpi_target: '[{"unit":"calls","target":200},{"unit":"appointments","target":40}]',
    kpi_actual: '[{"unit":"calls","actual":80},{"unit":"appointments","actual":14}]',
    approval_level: '2', approval_status: 'pending',
    approved_by: '', approved_at: '', rejection_reason: '',
    tags: 'telesale,vop2,tháng-6',
    created_by: 'user-tp-kd', created_at: now, updated_at: now, closed_at: '', deleted_at: '',
  },
  {
    task_id: randomUUID(), task_code: 'T-2026-0002',
    title: 'Thiết kế vật liệu marketing VOP2',
    objective: 'Hoàn thiện bộ ấn phẩm: brochure A4, banner 3x6m, tờ rơi A5 cho dự án VOP2',
    description: 'Thiết kế theo brand guideline VOP2, gửi duyệt TP Marketing trước 15/6.',
    project_id: 'proj-vop2', department_id: 'dept-mkt', owner_id: 'user-lan',
    collaborator_ids: '[{"user_id":"user-tp-mkt","role":"reviewer"},{"user_id":"user-minh","role":"observer"}]',
    priority: 'medium', status: 'review', progress_pct: '100',
    start_date: '2026-06-01', due_date: '2026-06-15', estimated_hours: '40', actual_hours: '38',
    kpi_target: '[{"unit":"designs","target":3}]',
    kpi_actual: '[{"unit":"designs","actual":3}]',
    approval_level: '1', approval_status: 'pending',
    approved_by: '', approved_at: '', rejection_reason: '',
    tags: 'marketing,design,vop2',
    created_by: 'user-tp-mkt', created_at: now, updated_at: now, closed_at: '', deleted_at: '',
  },
  {
    task_id: randomUUID(), task_code: 'T-2026-0003',
    title: 'Soạn mẫu hợp đồng mua bán VOP2',
    objective: 'Soạn và phê duyệt mẫu hợp đồng mua bán căn hộ VOP2 theo Luật Nhà ở 2023',
    description: 'Cần quy hoạch 1/500 từ chủ đầu tư để xác định hạn chế chuyển nhượng. Hiện đang Waiting.',
    project_id: 'proj-vop2', department_id: 'dept-legal', owner_id: 'user-hung',
    collaborator_ids: '[{"user_id":"user-bgd","role":"reviewer"}]',
    priority: 'critical', status: 'waiting', progress_pct: '30',
    start_date: '2026-06-02', due_date: '2026-06-10', estimated_hours: '24', actual_hours: '8',
    kpi_target: '[{"unit":"contracts_drafted","target":1}]',
    kpi_actual: '[]',
    approval_level: '3', approval_status: 'pending',
    approved_by: '', approved_at: '', rejection_reason: '',
    tags: 'legal,hợp-đồng,critical',
    created_by: 'user-tp-legal', created_at: now, updated_at: now, closed_at: '', deleted_at: '',
  },
];

const CHECKLISTS = [
  { checklist_id: randomUUID(), task_id: 'T-2026-0001-placeholder', task_type: 'task', title: 'Lập danh sách 500 KH tiềm năng', is_done: 'TRUE',  done_by: 'user-minh', done_at: '2026-06-01T09:00:00Z', sort_order: '0', created_at: now },
  { checklist_id: randomUUID(), task_id: 'T-2026-0001-placeholder', task_type: 'task', title: 'Chuẩn bị kịch bản telesale',     is_done: 'TRUE',  done_by: 'user-minh', done_at: '2026-06-03T10:00:00Z', sort_order: '1', created_at: now },
  { checklist_id: randomUUID(), task_id: 'T-2026-0001-placeholder', task_type: 'task', title: 'Gọi điện 50 KH/tuần (Tuần 1)',   is_done: 'TRUE',  done_by: 'user-minh', done_at: '2026-06-08T17:00:00Z', sort_order: '2', created_at: now },
  { checklist_id: randomUUID(), task_id: 'T-2026-0001-placeholder', task_type: 'task', title: 'Gọi điện 50 KH/tuần (Tuần 2)',   is_done: 'FALSE', done_by: '',           done_at: '',                      sort_order: '3', created_at: now },
  { checklist_id: randomUUID(), task_id: 'T-2026-0001-placeholder', task_type: 'task', title: 'Log kết quả vào CRM hàng ngày',  is_done: 'FALSE', done_by: '',           done_at: '',                      sort_order: '4', created_at: now },
];

async function main() {
  console.log('🚀 Khởi tạo Task Management Sheets...');
  await initTaskManagementSheets();

  console.log('📋 Seed Departments...');
  await appendRows(SHEET_NAMES.DEPARTMENTS, DEPARTMENTS);

  console.log('👥 Seed Users...');
  await appendRows(SHEET_NAMES.USERS, USERS);

  console.log('📁 Seed Projects...');
  await appendRows(SHEET_NAMES.PROJECTS, PROJECTS);

  console.log('✅ Seed Tasks...');
  await appendRows(SHEET_NAMES.TASKS, TASKS);

  console.log('☑️  Seed Checklists (dùng task_id thực sau khi có data)...');
  // Note: checklist task_id phải dùng UUID thực từ TASKS — bỏ qua trong demo
  // await appendRows(SHEET_NAMES.CHECKLISTS, CHECKLISTS);

  console.log('✅ Seed hoàn tất!');
  console.log('   Departments:  ', DEPARTMENTS.length);
  console.log('   Users:        ', USERS.length);
  console.log('   Projects:     ', PROJECTS.length);
  console.log('   Tasks:        ', TASKS.length);
}

main().catch(err => {
  console.error('❌ Seed thất bại:', err);
  process.exit(1);
});
