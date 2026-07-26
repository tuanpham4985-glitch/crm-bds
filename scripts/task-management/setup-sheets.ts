/**
 * Script: Khởi tạo Google Sheets cho Task Management
 * Chạy: npx ts-node scripts/task-management/setup-sheets.ts
 *
 * Tạo tất cả 9 sheet tabs với headers + seed demo data
 */
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config({ path: '.env.local' });

// ─── Cấu hình ───────────────────────────────────────────────

const SHEET_ID   = process.env.TM_GOOGLE_SHEET_ID || process.env.GOOGLE_SHEET_ID!;
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL!;
const PRIVATE_KEY  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

// ─── Column definitions per sheet ───────────────────────────

const SHEETS = {
  TM_Users: [
    'user_id','email','full_name','role','department_id',
    'employee_type','is_active','avatar_url',
    'created_at','updated_at',
  ],
  TM_Departments: [
    'dept_id','name','code','manager_id','parent_dept_id',
    'is_active','created_at','updated_at',
  ],
  TM_Projects: [
    'project_id','name','code','description','owner_id',
    'department_id','member_ids','status','start_date','end_date',
    'budget','tags','created_by','created_at','updated_at','deleted_at',
  ],
  TM_Tasks: [
    'task_id','task_code','title','objective','description',
    'project_id','marketing_project_name','department_id','owner_id','collaborator_ids',
    'priority','status','progress_pct','start_date','due_date',
    'estimated_hours','actual_hours','kpi_target',
    'approval_level','approver_id','approval_level1_status','approval_level1_by','approval_level1_at',
    'approval_level2_status','approval_level2_by','approval_level2_at',
    'approval_level3_status','approval_level3_by','approval_level3_at',
    'tags','attachments','blocked_reason','blocked_by_user_id',
    'created_by','created_at','updated_at','deleted_at',
  ],
  TM_Subtasks: [
    'subtask_id','subtask_code','parent_task_id','title','objective','description',
    'owner_id','collaborator_ids','priority','status','progress_pct',
    'start_date','due_date','estimated_hours','actual_hours',
    'created_by','created_at','updated_at','deleted_at',
  ],
  TM_Checklists: [
    'checklist_id','task_id','task_type','title','is_done',
    'completed_by','completed_at','sort_order','created_at','updated_at',
  ],
  TM_Comments: [
    'comment_id','task_id','task_type','user_id','body',
    'mentions','attachment_urls','parent_comment_id',
    'created_at','edited_at','is_deleted',
  ],
  TM_Notifications: [
    'notif_id','user_id','type','title','body','task_id','task_type',
    'channel','status','metadata','created_at','sent_at','read_at',
  ],
  TM_ActivityLogs: [
    'log_id','task_id','task_type','user_id','action',
    'old_value','new_value','metadata','ip_address','created_at',
  ],
};

// ─── Demo data ───────────────────────────────────────────────

const now = new Date().toISOString();
const today = now.slice(0, 10);
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

// IDs cố định để dễ tham chiếu
const ID = {
  dept_bds:   'dept-bds-001',
  dept_kinh:  'dept-kinh-001',
  dept_it:    'dept-it-001',

  user_admin:     'user-admin-001',
  user_manager:   'user-mgr-001',
  user_leader:    'user-lead-001',
  user_staff1:    'user-staff-001',
  user_staff2:    'user-staff-002',

  proj_001: 'proj-001',
  proj_002: 'proj-002',

  task_001: 'task-001',
  task_002: 'task-002',
  task_003: 'task-003',
};

const DEMO_USERS = [
  {
    user_id: ID.user_admin,
    email: 'admin@victoryholdings.vn',
    full_name: 'Nguyễn Văn Admin',
    role: 'director',
    department_id: ID.dept_bds,
    employee_type: 'Ban Giám Đốc',
    is_active: 'TRUE',
    avatar_url: '',
    created_at: now, updated_at: now,
  },
  {
    user_id: ID.user_manager,
    email: 'manager@victoryholdings.vn',
    full_name: 'Trần Thị Manager',
    role: 'manager',
    department_id: ID.dept_bds,
    employee_type: 'Trưởng phòng',
    is_active: 'TRUE',
    avatar_url: '',
    created_at: now, updated_at: now,
  },
  {
    user_id: ID.user_leader,
    email: 'leader@victoryholdings.vn',
    full_name: 'Lê Văn Leader',
    role: 'team_leader',
    department_id: ID.dept_bds,
    employee_type: 'Leader',
    is_active: 'TRUE',
    avatar_url: '',
    created_at: now, updated_at: now,
  },
  {
    user_id: ID.user_staff1,
    email: 'staff1@victoryholdings.vn',
    full_name: 'Phạm Thị Nhân Viên',
    role: 'staff',
    department_id: ID.dept_bds,
    employee_type: 'Nhân viên',
    is_active: 'TRUE',
    avatar_url: '',
    created_at: now, updated_at: now,
  },
  {
    user_id: ID.user_staff2,
    email: 'staff2@victoryholdings.vn',
    full_name: 'Hoàng Văn Nhân Viên',
    role: 'staff',
    department_id: ID.dept_kinh,
    employee_type: 'Nhân viên',
    is_active: 'TRUE',
    avatar_url: '',
    created_at: now, updated_at: now,
  },
];

const DEMO_DEPARTMENTS = [
  {
    dept_id: ID.dept_bds,
    name: 'Phòng Kinh Doanh BĐS',
    code: 'KD-BDS',
    manager_id: ID.user_manager,
    parent_dept_id: '',
    is_active: 'TRUE',
    created_at: now, updated_at: now,
  },
  {
    dept_id: ID.dept_kinh,
    name: 'Phòng Kế Toán',
    code: 'KT',
    manager_id: ID.user_manager,
    parent_dept_id: '',
    is_active: 'TRUE',
    created_at: now, updated_at: now,
  },
  {
    dept_id: ID.dept_it,
    name: 'Phòng IT',
    code: 'IT',
    manager_id: ID.user_admin,
    parent_dept_id: '',
    is_active: 'TRUE',
    created_at: now, updated_at: now,
  },
];

const DEMO_PROJECTS = [
  {
    project_id: ID.proj_001,
    name: 'Dự án CRM BĐS Phase 2',
    code: 'CRM-P2',
    description: 'Phát triển module Task Management và tích hợp Google Sheets',
    owner_id: ID.user_admin,
    department_id: ID.dept_it,
    member_ids: JSON.stringify([ID.user_admin, ID.user_manager, ID.user_leader]),
    status: 'active',
    start_date: today,
    end_date: nextMonth,
    budget: '0',
    tags: JSON.stringify(['crm', 'it', 'development']),
    created_by: ID.user_admin,
    created_at: now, updated_at: now, deleted_at: '',
  },
  {
    project_id: ID.proj_002,
    name: 'Chiến dịch Marketing Q2/2026',
    code: 'MKT-Q2-26',
    description: 'Triển khai chiến dịch marketing bất động sản quý 2',
    owner_id: ID.user_manager,
    department_id: ID.dept_bds,
    member_ids: JSON.stringify([ID.user_manager, ID.user_leader, ID.user_staff1]),
    status: 'active',
    start_date: today,
    end_date: nextMonth,
    budget: '50000000',
    tags: JSON.stringify(['marketing', 'bds']),
    created_by: ID.user_manager,
    created_at: now, updated_at: now, deleted_at: '',
  },
];

const DEMO_TASKS = [
  {
    task_id: ID.task_001,
    task_code: 'T-2026-0001',
    title: 'Thiết kế module Task Management',
    objective: 'Hoàn thành design doc và ERD cho module TM',
    description: 'Phân tích nghiệp vụ, thiết kế database schema, API spec, và UI wireframe cho module Quản lý Công việc của CRM BĐS Victory Holdings.',
    project_id: ID.proj_001,
    department_id: ID.dept_it,
    owner_id: ID.user_admin,
    collaborator_ids: JSON.stringify([{ user_id: ID.user_leader, role: 'contributor' }]),
    priority: 'high',
    status: 'completed',
    progress_pct: '100',
    start_date: today,
    due_date: today,
    estimated_hours: '16',
    actual_hours: '14',
    kpi_target: '[]',
    approval_level: '1',
    approval_level1_status: 'approved',
    approval_level1_by: ID.user_manager,
    approval_level1_at: now,
    approval_level2_status: 'not_required',
    approval_level2_by: '', approval_level2_at: '',
    approval_level3_status: 'not_required',
    approval_level3_by: '', approval_level3_at: '',
    tags: JSON.stringify(['design', 'architecture']),
    attachments: '[]',
    blocked_reason: '', blocked_by_user_id: '',
    created_by: ID.user_admin,
    created_at: now, updated_at: now, deleted_at: '',
  },
  {
    task_id: ID.task_002,
    task_code: 'T-2026-0002',
    title: 'Triển khai Google Sheets database layer',
    objective: 'Xây dựng repository pattern với Google Sheets làm backend',
    description: 'Implement BaseSheetsRepository, TaskSheetsRepository, service layer với cache TTL và RBAC.',
    project_id: ID.proj_001,
    department_id: ID.dept_it,
    owner_id: ID.user_leader,
    collaborator_ids: JSON.stringify([{ user_id: ID.user_admin, role: 'reviewer' }]),
    priority: 'high',
    status: 'inprogress',
    progress_pct: '60',
    start_date: today,
    due_date: nextWeek,
    estimated_hours: '24',
    actual_hours: '14',
    kpi_target: '[]',
    approval_level: '2',
    approval_level1_status: 'pending',
    approval_level1_by: '', approval_level1_at: '',
    approval_level2_status: 'not_required',
    approval_level2_by: '', approval_level2_at: '',
    approval_level3_status: 'not_required',
    approval_level3_by: '', approval_level3_at: '',
    tags: JSON.stringify(['backend', 'database']),
    attachments: '[]',
    blocked_reason: '', blocked_by_user_id: '',
    created_by: ID.user_admin,
    created_at: now, updated_at: now, deleted_at: '',
  },
  {
    task_id: ID.task_003,
    task_code: 'T-2026-0003',
    title: 'Lập kế hoạch marketing Q2 2026',
    objective: 'Xác định ngân sách, kênh và timeline chiến dịch',
    description: 'Phân tích thị trường BĐS, lập kế hoạch chi tiết cho chiến dịch marketing quý 2 bao gồm Facebook Ads, SEO, event offline.',
    project_id: ID.proj_002,
    department_id: ID.dept_bds,
    owner_id: ID.user_staff1,
    collaborator_ids: JSON.stringify([{ user_id: ID.user_leader, role: 'reviewer' }]),
    priority: 'medium',
    status: 'todo',
    progress_pct: '0',
    start_date: today,
    due_date: nextWeek,
    estimated_hours: '8',
    actual_hours: '0',
    kpi_target: '[]',
    approval_level: '1',
    approval_level1_status: 'pending',
    approval_level1_by: '', approval_level1_at: '',
    approval_level2_status: 'not_required',
    approval_level2_by: '', approval_level2_at: '',
    approval_level3_status: 'not_required',
    approval_level3_by: '', approval_level3_at: '',
    tags: JSON.stringify(['marketing', 'planning']),
    attachments: '[]',
    blocked_reason: '', blocked_by_user_id: '',
    created_by: ID.user_manager,
    created_at: now, updated_at: now, deleted_at: '',
  },
];

const DEMO_CHECKLISTS = [
  { checklist_id: randomUUID(), task_id: ID.task_001, task_type: 'task', title: 'Phân tích nghiệp vụ', is_done: 'TRUE', completed_by: ID.user_admin, completed_at: now, sort_order: '1', created_at: now, updated_at: now },
  { checklist_id: randomUUID(), task_id: ID.task_001, task_type: 'task', title: 'Thiết kế ERD database', is_done: 'TRUE', completed_by: ID.user_admin, completed_at: now, sort_order: '2', created_at: now, updated_at: now },
  { checklist_id: randomUUID(), task_id: ID.task_001, task_type: 'task', title: 'Viết design document', is_done: 'TRUE', completed_by: ID.user_admin, completed_at: now, sort_order: '3', created_at: now, updated_at: now },
  { checklist_id: randomUUID(), task_id: ID.task_002, task_type: 'task', title: 'Setup Google Sheets API', is_done: 'TRUE', completed_by: ID.user_leader, completed_at: now, sort_order: '1', created_at: now, updated_at: now },
  { checklist_id: randomUUID(), task_id: ID.task_002, task_type: 'task', title: 'Implement BaseSheetsRepository', is_done: 'TRUE', completed_by: ID.user_leader, completed_at: now, sort_order: '2', created_at: now, updated_at: now },
  { checklist_id: randomUUID(), task_id: ID.task_002, task_type: 'task', title: 'Implement TaskService + RBAC', is_done: 'FALSE', completed_by: '', completed_at: '', sort_order: '3', created_at: now, updated_at: now },
  { checklist_id: randomUUID(), task_id: ID.task_002, task_type: 'task', title: 'Viết unit tests', is_done: 'FALSE', completed_by: '', completed_at: '', sort_order: '4', created_at: now, updated_at: now },
];

const DEMO_COMMENTS = [
  {
    comment_id: randomUUID(),
    task_id: ID.task_001,
    task_type: 'task',
    user_id: ID.user_manager,
    body: 'Design document đã hoàn chỉnh, approve nhé team!',
    mentions: '[]',
    attachment_urls: '[]',
    parent_comment_id: '',
    created_at: now, edited_at: '', is_deleted: 'FALSE',
  },
  {
    comment_id: randomUUID(),
    task_id: ID.task_002,
    task_type: 'task',
    user_id: ID.user_leader,
    body: 'Đang implement phần cache TTL, dự kiến xong cuối tuần.',
    mentions: JSON.stringify([ID.user_admin]),
    attachment_urls: '[]',
    parent_comment_id: '',
    created_at: now, edited_at: '', is_deleted: 'FALSE',
  },
];

const DEMO_NOTIFICATIONS = [
  {
    notif_id: randomUUID(),
    user_id: ID.user_leader,
    type: 'task_assigned',
    title: 'Bạn được giao task mới: T-2026-0002',
    body: '"Triển khai Google Sheets database layer" — Hạn: ' + nextWeek + '. Ưu tiên: Cao.',
    task_id: ID.task_002,
    task_type: 'task',
    channel: 'inapp',
    status: 'read',
    metadata: JSON.stringify({ assigned_by: ID.user_admin }),
    created_at: now, sent_at: now, read_at: now,
  },
  {
    notif_id: randomUUID(),
    user_id: ID.user_staff1,
    type: 'task_assigned',
    title: 'Bạn được giao task mới: T-2026-0003',
    body: '"Lập kế hoạch marketing Q2 2026" — Hạn: ' + nextWeek + '. Ưu tiên: Trung bình.',
    task_id: ID.task_003,
    task_type: 'task',
    channel: 'inapp',
    status: 'pending',
    metadata: JSON.stringify({ assigned_by: ID.user_manager }),
    created_at: now, sent_at: '', read_at: '',
  },
];

const DEMO_ACTIVITY = [
  {
    log_id: randomUUID(),
    task_id: ID.task_001,
    task_type: 'task',
    user_id: ID.user_admin,
    action: 'created',
    old_value: '{}',
    new_value: JSON.stringify({ title: 'Thiết kế module Task Management', status: 'todo' }),
    metadata: '{}',
    ip_address: '',
    created_at: now,
  },
  {
    log_id: randomUUID(),
    task_id: ID.task_001,
    task_type: 'task',
    user_id: ID.user_admin,
    action: 'status_changed',
    old_value: JSON.stringify({ status: 'inprogress' }),
    new_value: JSON.stringify({ status: 'completed' }),
    metadata: '{}',
    ip_address: '',
    created_at: now,
  },
  {
    log_id: randomUUID(),
    task_id: ID.task_002,
    task_type: 'task',
    user_id: ID.user_leader,
    action: 'created',
    old_value: '{}',
    new_value: JSON.stringify({ title: 'Triển khai Google Sheets database layer', status: 'todo' }),
    metadata: '{}',
    ip_address: '',
    created_at: now,
  },
];

// ─── MAIN ────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Khởi tạo Task Management Sheets...\n');

  if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error('❌ Thiếu environment variables: TM_GOOGLE_SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY');
    process.exit(1);
  }

  const auth = new JWT({
    email:  CLIENT_EMAIL,
    key:    PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(SHEET_ID, auth);
  await doc.loadInfo();
  console.log(`📊 Spreadsheet: "${doc.title}"\n`);

  for (const [sheetName, headers] of Object.entries(SHEETS)) {
    let sheet = doc.sheetsByTitle[sheetName];

    if (!sheet) {
      console.log(`➕ Tạo sheet: ${sheetName}`);
      sheet = await doc.addSheet({
        title: sheetName,
        gridProperties: {
          columnCount: Math.max(headers.length + 5, 30),
          rowCount: 1000,
        },
      });
      await sheet.setHeaderRow(headers);
    } else {
      console.log(`✅ Sheet đã tồn tại: ${sheetName} — cập nhật headers`);
      // Resize if existing sheet has fewer columns than needed
      const neededCols = Math.max(headers.length + 5, 30);
      if ((sheet.columnCount ?? 26) < headers.length) {
        await sheet.resize({ columnCount: neededCols, rowCount: sheet.rowCount ?? 1000 });
      }
      await sheet.setHeaderRow(headers);
    }

    // Clear data (giữ header)
    const rows = await sheet.getRows();
    if (rows.length > 0) {
      await sheet.clearRows();
      console.log(`   🗑  Đã xóa ${rows.length} dòng cũ`);
    }
  }

  // ─── Seed data ─────────────────────────────────────────────

  console.log('\n📦 Seeding demo data...');

  async function addRows(sheetName: string, rows: Record<string, string>[]) {
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet || rows.length === 0) return;
    await sheet.addRows(rows as never[]);
    console.log(`   ✅ ${sheetName}: ${rows.length} dòng`);
  }

  await addRows('TM_Users',         DEMO_USERS);
  await addRows('TM_Departments',   DEMO_DEPARTMENTS);
  await addRows('TM_Projects',      DEMO_PROJECTS);
  await addRows('TM_Tasks',         DEMO_TASKS);
  await addRows('TM_Checklists',    DEMO_CHECKLISTS);
  await addRows('TM_Comments',      DEMO_COMMENTS);
  await addRows('TM_Notifications', DEMO_NOTIFICATIONS);
  await addRows('TM_ActivityLogs',  DEMO_ACTIVITY);

  console.log('\n🎉 Hoàn thành! Dữ liệu demo đã được tạo.\n');
  console.log('📋 Tài khoản demo (đăng nhập qua CRM chính):');
  console.log('   Admin   : admin@victoryholdings.vn');
  console.log('   Manager : manager@victoryholdings.vn');
  console.log('   Leader  : leader@victoryholdings.vn');
  console.log('   Staff   : staff1@victoryholdings.vn');
  console.log('\n⚠  Lưu ý: Mật khẩu được quản lý bởi sheet CRM chính (không phải TM sheet)');
  console.log('   Chạy script seed CRM chính để tạo tài khoản đăng nhập.\n');
}

main().catch(err => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
