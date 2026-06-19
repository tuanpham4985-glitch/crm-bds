// ============================================================
// CRM BĐS — Task Management: TypeScript Types
// Google Sheets as database (migration-ready to PostgreSQL)
// ============================================================

// ─── ENUMS ────────────────────────────────────────────────

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export type TaskStatus =
  | 'todo'
  | 'inprogress'
  | 'waiting'
  | 'review'
  | 'completed'
  | 'closed';

export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

export type CollaboratorRole = 'contributor' | 'reviewer' | 'observer';

export type UserRole = 'director' | 'manager' | 'team_leader' | 'staff';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export type NotificationChannel = 'inapp' | 'email' | 'zalo' | 'telegram' | 'push';

export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read';

export type AuditAction =
  | 'created'       | 'updated'         | 'deleted'
  | 'status_changed'| 'owner_changed'   | 'priority_changed'
  | 'due_date_changed'                  | 'progress_updated'
  | 'checklist_toggled'                 | 'comment_added'
  | 'comment_edited'| 'comment_deleted' | 'collaborator_added'
  | 'collaborator_removed'              | 'attachment_added'
  | 'time_logged'   | 'submitted_review'| 'approved'
  | 'rejected'      | 'escalated'       | 'reopened'
  | 'closed';

// ─── CORE ENTITIES ────────────────────────────────────────

export interface TmUser {
  user_id: string;           // UUID
  employee_code: string;     // NV001
  full_name: string;
  email: string;
  phone: string;
  department_id: string;     // ref: Departments.dept_id
  team_id: string;           // ref: Teams (stored in Departments sheet)
  role: UserRole;
  position: string;          // "Chuyên viên KD", "Trưởng phòng"
  avatar_url: string;
  zalo_id: string;
  is_active: boolean;        // TRUE/FALSE in sheet
  last_active_at: string;    // ISO date string
  created_at: string;
  updated_at: string;
}

export interface TmDepartment {
  dept_id: string;           // UUID
  name: string;              // "Phòng Kinh doanh"
  code: string;              // "KD" | "MKT" | "LEGAL" | "PM" | "HR"
  manager_id: string;        // ref: Users.user_id
  parent_dept_id: string;    // optional, for sub-departments
  description: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TmProject {
  project_id: string;        // UUID
  name: string;              // "Vinhomes Ocean Park Phase 2"
  code: string;              // "VOP2"
  description: string;
  owner_id: string;          // ref: Users.user_id
  department_ids: string;    // JSON array string: '["dept1","dept2"]'
  member_ids: string;        // JSON array string: user_ids
  status: ProjectStatus;
  start_date: string;        // YYYY-MM-DD
  end_date: string;
  budget: number;
  tags: string;              // comma-separated or JSON
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string;
}

export interface TmTask {
  task_id: string;           // UUID — Primary Key
  task_code: string;         // T-2026-0001 — auto-generated
  title: string;
  objective: string;         // Mục tiêu cụ thể, đo được
  description: string;
  project_id: string;        // ref: Projects.project_id
  department_id: string;     // ref: Departments.dept_id
  owner_id: string;          // ref: Users.user_id — 1 người chịu TN
  collaborator_ids: string;  // JSON: [{"user_id":"x","role":"contributor"}]
  priority: TaskPriority;
  status: TaskStatus;
  progress_pct: number;      // 0–100
  start_date: string;
  due_date: string;
  estimated_hours: number;
  actual_hours: number;      // tính từ ActivityLogs
  kpi_target: string;        // JSON: [{unit,target,actual,currency?}]
  kpi_actual: string;        // JSON: same shape, filled as task progresses
  approval_level: 1 | 2 | 3;
  approval_status: ApprovalStatus;
  approved_by: string;
  approved_at: string;
  rejection_reason: string;
  tags: string;              // comma-separated
  zalo_reminder: string;     // '1' = bật nhắc Zalo trước 1 ngày
  zalo_reminder_sent: string; // '1' = đã gửi nhắc
  created_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string;
  deleted_at: string;        // soft delete
}

export interface TmSubtask {
  subtask_id: string;        // UUID — Primary Key
  subtask_code: string;      // S-2026-0001
  parent_task_id: string;    // ref: Tasks.task_id
  title: string;
  objective: string;
  description: string;
  owner_id: string;
  collaborator_ids: string;  // JSON
  priority: TaskPriority;
  status: TaskStatus;
  progress_pct: number;
  start_date: string;
  due_date: string;
  estimated_hours: number;
  actual_hours: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string;
}

export interface TmChecklist {
  checklist_id: string;      // UUID — Primary Key
  task_id: string;           // ref: Tasks.task_id OR Subtasks.subtask_id
  task_type: 'task' | 'subtask';
  title: string;
  is_done: boolean;
  done_by: string;           // ref: Users.user_id
  done_at: string;
  sort_order: number;
  created_at: string;
}

export interface TmComment {
  comment_id: string;        // UUID — Primary Key
  task_id: string;           // ref: Tasks OR Subtasks
  task_type: 'task' | 'subtask';
  user_id: string;           // ref: Users.user_id
  body: string;
  mentions: string;          // JSON: ["user_id1", "user_id2"]
  attachment_urls: string;   // JSON: [{name,url,size_kb}]
  parent_comment_id: string; // for threaded replies
  created_at: string;
  edited_at: string;
  is_deleted: boolean;
}

export interface TmAttachment {
  attachment_id: string;     // UUID — Primary Key
  task_id: string;
  task_type: 'task' | 'subtask';
  uploaded_by: string;       // ref: Users.user_id
  file_name: string;
  file_url: string;          // Google Drive URL hoặc S3
  file_type: string;         // pdf, docx, png...
  file_size_kb: number;
  created_at: string;
}

export interface TmNotification {
  notif_id: string;          // UUID — Primary Key
  user_id: string;           // Người nhận
  type: string;              // task_assigned | due_reminder | approved | rejected...
  title: string;
  body: string;
  task_id: string;           // Liên kết đến task
  task_type: 'task' | 'subtask';
  channel: NotificationChannel;
  status: NotificationStatus;
  metadata: string;          // JSON: extra data
  created_at: string;
  sent_at: string;
  read_at: string;
}

export interface TmActivityLog {
  log_id: string;            // UUID — Primary Key
  task_id: string;           // ref: Tasks OR Subtasks
  task_type: 'task' | 'subtask';
  user_id: string;           // Người thực hiện hành động
  action: AuditAction;
  old_value: string;         // JSON: trạng thái trước
  new_value: string;         // JSON: trạng thái sau
  metadata: string;          // JSON: thêm context
  ip_address: string;
  created_at: string;
}

// ─── DERIVED / COMPUTED TYPES ─────────────────────────────

export interface KpiMetric {
  unit: string;              // "calls" | "contracts" | "revenue"
  target: number;
  actual: number;
  currency?: string;         // "VND" — chỉ khi unit = revenue
}

export interface CollaboratorEntry {
  user_id: string;
  role: CollaboratorRole;
}

export interface AttachmentEntry {
  name: string;
  url: string;
  size_kb: number;
  type?: string;
}

// ─── API REQUEST / RESPONSE TYPES ─────────────────────────

export interface CreateTaskInput {
  title: string;
  objective: string;
  description?: string;
  project_id: string;
  department_id: string;
  owner_id: string;
  collaborators?: CollaboratorEntry[];
  priority: TaskPriority;
  start_date: string;
  due_date: string;
  estimated_hours?: number;
  kpi_target?: KpiMetric[];
  approval_level?: 0 | 1 | 2 | 3;
  tags?: string[];
  zalo_reminder?: boolean;
  checklists?: { title: string; sort_order: number }[];
}

export interface UpdateTaskInput {
  title?: string;
  objective?: string;
  description?: string;
  owner_id?: string;
  priority?: TaskPriority;
  start_date?: string;
  due_date?: string;
  estimated_hours?: number;
  kpi_target?: KpiMetric[];
  kpi_actual?: KpiMetric[];
  tags?: string[];
  approval_level?: 0 | 1 | 2 | 3;
  approval_status?: string;
}

export interface TaskStatusTransition {
  task_id: string;
  new_status: TaskStatus;
  reason?: string;          // required for waiting/reject
  blocked_by_user_id?: string; // for waiting status
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  cursor?: string;          // for cursor-based pagination
}

export interface TaskFilters {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  owner_id?: string;
  department_id?: string;
  project_id?: string;
  due_before?: string;      // YYYY-MM-DD
  due_after?: string;
  search?: string;          // full-text search on title/objective
  tags?: string[];
  overdue_only?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
  next_cursor?: string;
}

export interface TaskWithDetails extends TmTask {
  owner?: TmUser;
  project?: TmProject;
  department?: TmDepartment;
  collaborators?: (TmUser & { collab_role: CollaboratorRole })[];
  subtasks?: TmSubtask[];
  checklists?: TmChecklist[];
  comments?: TmComment[];
  attachments?: TmAttachment[];
  checklist_progress: { done: number; total: number };
}

// ─── RBAC TYPES ───────────────────────────────────────────

export interface Permission {
  code: string;              // "task:create" | "task:approve_l2"
  module: string;
  action: string;
  scope: 'own' | 'team' | 'department' | 'company';
}

export interface RbacContext {
  user_id: string;
  role: UserRole;
  department_id: string;
  team_id: string;
}

// ─── KPI DASHBOARD TYPES ──────────────────────────────────

export interface DeptKpiSummary {
  department_id: string;
  department_name: string;
  active_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  on_time_rate_pct: number;
  avg_completion_days: number;
  kpi_achievement_pct: number;
}

export interface UserWorkload {
  user_id: string;
  full_name: string;
  department: string;
  active_tasks: number;
  overdue_tasks: number;
  completed_this_month: number;
  avg_progress_pct: number;
}

export interface CompanyKpiDashboard {
  snapshot_date: string;
  total_active_tasks: number;
  total_overdue_tasks: number;
  total_completed_this_month: number;
  overall_on_time_rate_pct: number;
  by_department: DeptKpiSummary[];
  top_overdue: TmTask[];
  workload_distribution: UserWorkload[];
}

// ─── SHEET COLUMN MAPS ────────────────────────────────────
// Mapping từ tên cột trong Google Sheets → property name
// Dùng để đồng bộ khi thêm/xóa cột

export const SHEET_COLUMNS = {
  TASKS: [
    'task_id', 'task_code', 'title', 'objective', 'description',
    'project_id', 'department_id', 'owner_id', 'collaborator_ids',
    'priority', 'status', 'progress_pct', 'start_date', 'due_date',
    'estimated_hours', 'actual_hours', 'kpi_target', 'kpi_actual',
    'approval_level', 'approval_status', 'approved_by', 'approved_at',
    'rejection_reason', 'tags', 'zalo_reminder', 'zalo_reminder_sent',
    'created_by', 'created_at', 'updated_at', 'closed_at', 'deleted_at',
  ] as const,

  SUBTASKS: [
    'subtask_id', 'subtask_code', 'parent_task_id', 'title', 'objective',
    'description', 'owner_id', 'collaborator_ids', 'priority', 'status',
    'progress_pct', 'start_date', 'due_date', 'estimated_hours',
    'actual_hours', 'created_by', 'created_at', 'updated_at', 'deleted_at',
  ] as const,

  CHECKLISTS: [
    'checklist_id', 'task_id', 'task_type', 'title', 'is_done',
    'done_by', 'done_at', 'sort_order', 'created_at',
  ] as const,

  COMMENTS: [
    'comment_id', 'task_id', 'task_type', 'user_id', 'body',
    'mentions', 'attachment_urls', 'parent_comment_id',
    'created_at', 'edited_at', 'is_deleted',
  ] as const,

  ATTACHMENTS: [
    'attachment_id', 'task_id', 'task_type', 'uploaded_by',
    'file_name', 'file_url', 'file_type', 'file_size_kb', 'created_at',
  ] as const,

  NOTIFICATIONS: [
    'notif_id', 'user_id', 'type', 'title', 'body', 'task_id',
    'task_type', 'channel', 'status', 'metadata',
    'created_at', 'sent_at', 'read_at',
  ] as const,

  ACTIVITY_LOGS: [
    'log_id', 'task_id', 'task_type', 'user_id', 'action',
    'old_value', 'new_value', 'metadata', 'ip_address', 'created_at',
  ] as const,

  USERS: [
    'user_id', 'employee_code', 'full_name', 'email', 'phone',
    'department_id', 'team_id', 'role', 'position', 'avatar_url',
    'zalo_id', 'is_active', 'last_active_at', 'created_at', 'updated_at',
  ] as const,

  DEPARTMENTS: [
    'dept_id', 'name', 'code', 'manager_id', 'parent_dept_id',
    'description', 'is_active', 'sort_order', 'created_at', 'updated_at',
  ] as const,

  PROJECTS: [
    'project_id', 'name', 'code', 'description', 'owner_id',
    'department_ids', 'member_ids', 'status', 'start_date', 'end_date',
    'budget', 'tags', 'created_by', 'created_at', 'updated_at', 'archived_at',
  ] as const,
} as const;

// Sheet tab names in the spreadsheet
export const SHEET_NAMES = {
  USERS:          'TM_Users',
  DEPARTMENTS:    'TM_Departments',
  PROJECTS:       'TM_Projects',
  TASKS:          'TM_Tasks',
  SUBTASKS:       'TM_Subtasks',
  CHECKLISTS:     'TM_Checklists',
  COMMENTS:       'TM_Comments',
  ATTACHMENTS:    'TM_Attachments',
  NOTIFICATIONS:  'TM_Notifications',
  ACTIVITY_LOGS:  'TM_ActivityLogs',
} as const;

export type SheetName = typeof SHEET_NAMES[keyof typeof SHEET_NAMES];
