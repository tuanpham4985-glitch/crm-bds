// ============================================================
// CRM BĐS — Task Management: Repository Interface (Abstraction Layer)
// Implement for Google Sheets now → swap to PostgreSQL later
// without changing any service/business logic.
// ============================================================
import type {
  TmTask, TmSubtask, TmChecklist, TmComment, TmAttachment,
  TmNotification, TmActivityLog, TmUser, TmDepartment, TmProject,
  CreateTaskInput, UpdateTaskInput, TaskFilters, PaginationOptions,
  PaginatedResult, AuditAction,
} from './types';

// ─── GENERIC REPOSITORY ───────────────────────────────────

export interface IRepository<T, TCreate, TUpdate = Partial<TCreate>> {
  findById(id: string): Promise<T | null>;
  findMany(filters?: Partial<T>, pagination?: PaginationOptions): Promise<PaginatedResult<T>>;
  create(data: TCreate): Promise<T>;
  update(id: string, data: TUpdate): Promise<T>;
  delete(id: string): Promise<void>;   // soft delete where applicable
}

// ─── TASK REPOSITORY ──────────────────────────────────────

export interface ITaskRepository {
  findById(taskId: string): Promise<TmTask | null>;
  findByCode(taskCode: string): Promise<TmTask | null>;
  findMany(filters: TaskFilters, pagination: PaginationOptions): Promise<PaginatedResult<TmTask>>;
  findByOwner(ownerId: string, pagination: PaginationOptions): Promise<PaginatedResult<TmTask>>;
  findByDepartment(deptId: string, pagination: PaginationOptions): Promise<PaginatedResult<TmTask>>;
  findByProject(projectId: string, pagination: PaginationOptions): Promise<PaginatedResult<TmTask>>;
  findOverdue(): Promise<TmTask[]>;
  findPendingApproval(approverId: string, approvalLevel: 1 | 2 | 3): Promise<TmTask[]>;

  create(input: CreateTaskInput, createdBy: string): Promise<TmTask>;
  update(taskId: string, input: UpdateTaskInput, updatedBy: string): Promise<TmTask>;
  updateStatus(taskId: string, status: TmTask['status'], reason?: string): Promise<TmTask>;
  updateProgress(taskId: string, progressPct: number): Promise<TmTask>;
  updateApproval(
    taskId: string,
    status: TmTask['approval_status'],
    approvedBy: string,
    reason?: string,
  ): Promise<TmTask>;
  transferOwner(taskId: string, newOwnerId: string): Promise<TmTask>;
  softDelete(taskId: string): Promise<void>;

  addCollaborator(taskId: string, userId: string, role: string): Promise<void>;
  removeCollaborator(taskId: string, userId: string): Promise<void>;

  nextTaskCode(): Promise<string>;  // generate T-2026-XXXX
}

// ─── SUBTASK REPOSITORY ───────────────────────────────────

export interface ISubtaskRepository {
  findById(subtaskId: string): Promise<TmSubtask | null>;
  findByParentTask(taskId: string): Promise<TmSubtask[]>;
  create(parentTaskId: string, input: Omit<CreateTaskInput, 'project_id' | 'department_id'>, createdBy: string): Promise<TmSubtask>;
  update(subtaskId: string, input: Partial<TmSubtask>): Promise<TmSubtask>;
  updateStatus(subtaskId: string, status: TmSubtask['status']): Promise<TmSubtask>;
  updateProgress(subtaskId: string, progressPct: number): Promise<TmSubtask>;
  softDelete(subtaskId: string): Promise<void>;
  countByParent(taskId: string): Promise<{ total: number; completed: number }>;
}

// ─── CHECKLIST REPOSITORY ─────────────────────────────────

export interface IChecklistRepository {
  findByTask(taskId: string, taskType?: 'task' | 'subtask'): Promise<TmChecklist[]>;
  create(taskId: string, taskType: 'task' | 'subtask', title: string, sortOrder?: number): Promise<TmChecklist>;
  toggle(checklistId: string, isDone: boolean, doneBy: string): Promise<TmChecklist>;
  reorder(taskId: string, orderedIds: string[]): Promise<void>;
  delete(checklistId: string): Promise<void>;
  bulkCreate(taskId: string, taskType: 'task' | 'subtask', items: { title: string; sort_order: number }[]): Promise<TmChecklist[]>;
  progressByTask(taskId: string): Promise<{ done: number; total: number }>;
}

// ─── COMMENT REPOSITORY ───────────────────────────────────

export interface ICommentRepository {
  findByTask(taskId: string, taskType?: 'task' | 'subtask'): Promise<TmComment[]>;
  findById(commentId: string): Promise<TmComment | null>;
  create(taskId: string, taskType: 'task' | 'subtask', userId: string, body: string, mentions?: string[], parentCommentId?: string): Promise<TmComment>;
  update(commentId: string, body: string): Promise<TmComment>;
  softDelete(commentId: string): Promise<void>;
}

// ─── ATTACHMENT REPOSITORY ────────────────────────────────

export interface IAttachmentRepository {
  findByTask(taskId: string): Promise<TmAttachment[]>;
  create(data: Omit<TmAttachment, 'attachment_id' | 'created_at'>): Promise<TmAttachment>;
  delete(attachmentId: string): Promise<void>;
}

// ─── NOTIFICATION REPOSITORY ──────────────────────────────

export interface INotificationRepository {
  findByUser(userId: string, unreadOnly?: boolean): Promise<TmNotification[]>;
  create(data: Omit<TmNotification, 'notif_id' | 'created_at' | 'sent_at' | 'read_at'>): Promise<TmNotification>;
  markAsRead(notifId: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  updateStatus(notifId: string, status: TmNotification['status'], sentAt?: string): Promise<void>;
  countUnread(userId: string): Promise<number>;
}

// ─── ACTIVITY LOG REPOSITORY ──────────────────────────────

export interface IActivityLogRepository {
  findByTask(taskId: string, limit?: number): Promise<TmActivityLog[]>;
  findByUser(userId: string, limit?: number): Promise<TmActivityLog[]>;
  log(
    taskId: string,
    taskType: 'task' | 'subtask',
    userId: string,
    action: AuditAction,
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<TmActivityLog>;
}

// ─── USER / DEPT / PROJECT REPOSITORIES ──────────────────

export interface IUserRepository {
  findById(userId: string): Promise<TmUser | null>;
  findByEmail(email: string): Promise<TmUser | null>;
  findByDepartment(deptId: string): Promise<TmUser[]>;
  findAll(activeOnly?: boolean): Promise<TmUser[]>;
  update(userId: string, data: Partial<TmUser>): Promise<TmUser>;
}

export interface IDepartmentRepository {
  findById(deptId: string): Promise<TmDepartment | null>;
  findAll(activeOnly?: boolean): Promise<TmDepartment[]>;
}

export interface IProjectRepository {
  findById(projectId: string): Promise<TmProject | null>;
  findAll(filters?: Partial<TmProject>): Promise<TmProject[]>;
  findByMember(userId: string): Promise<TmProject[]>;
  create(data: Omit<TmProject, 'project_id' | 'created_at' | 'updated_at'>): Promise<TmProject>;
  update(projectId: string, data: Partial<TmProject>): Promise<TmProject>;
}

// ─── UNIT OF WORK — tập hợp tất cả repositories ──────────

export interface ITaskManagementUoW {
  tasks:        ITaskRepository;
  subtasks:     ISubtaskRepository;
  checklists:   IChecklistRepository;
  comments:     ICommentRepository;
  attachments:  IAttachmentRepository;
  notifications: INotificationRepository;
  activityLogs: IActivityLogRepository;
  users:        IUserRepository;
  departments:  IDepartmentRepository;
  projects:     IProjectRepository;
}
