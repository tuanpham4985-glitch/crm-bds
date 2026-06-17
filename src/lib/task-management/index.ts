// ============================================================
// CRM BĐS — Task Management: Public API
// Single entry point — import from here, not from sub-modules
// ============================================================
export * from './types';
export * from './repository.interface';
export * from './rbac/rbac';
export * from './cache';
export * from './services/task.service';
export * from './services/notification.service';
export * from './services/kpi.service';

// Sheets implementations
export { TaskSheetsRepository }     from './sheets/task.repository';
export { SubtaskSheetsRepository }  from './sheets/task.repository';
export { ChecklistSheetsRepository } from './sheets/task.repository';
export { initTaskManagementSheets } from './sheets/client';

// ─── FACTORY: wire everything together ────────────────────
import { TaskSheetsRepository, SubtaskSheetsRepository, ChecklistSheetsRepository } from './sheets/task.repository';
import { NotificationService } from './services/notification.service';
import { TaskService } from './services/task.service';
import { KpiService } from './services/kpi.service';
import type { ITaskManagementUoW } from './repository.interface';

// Lightweight stubs for optional repositories (implement as needed)
import { loadRows, appendRow, updateRow } from './sheets/client';
import { SHEET_NAMES } from './types';
import { randomUUID } from 'crypto';
import type {
  TmComment, TmAttachment, TmNotification, TmActivityLog,
  TmUser, TmDepartment, TmProject, AuditAction,
  PaginationOptions, PaginatedResult,
} from './types';

class CommentSheetsRepo {
  async findByTask(taskId: string): Promise<TmComment[]> {
    const rows = await loadRows(SHEET_NAMES.COMMENTS, '__none__');
    return rows.filter(r => r.task_id === taskId && r.is_deleted !== 'TRUE') as unknown as TmComment[];
  }
  async findById(id: string): Promise<TmComment | null> {
    const rows = await loadRows(SHEET_NAMES.COMMENTS, '__none__');
    const r = rows.find(r => r.comment_id === id);
    return r ? r as unknown as TmComment : null;
  }
  async create(taskId: string, taskType: 'task'|'subtask', userId: string, body: string, mentions?: string[], parentId?: string): Promise<TmComment> {
    const row = { comment_id: randomUUID(), task_id: taskId, task_type: taskType, user_id: userId, body,
      mentions: JSON.stringify(mentions ?? []), attachment_urls: '[]',
      parent_comment_id: parentId ?? '', created_at: new Date().toISOString(), edited_at: '', is_deleted: 'FALSE' };
    await appendRow(SHEET_NAMES.COMMENTS, row);
    return row as unknown as TmComment;
  }
  async update(commentId: string, body: string): Promise<TmComment> {
    const r = await updateRow(SHEET_NAMES.COMMENTS, 'comment_id', commentId, { body, edited_at: new Date().toISOString() });
    return r as unknown as TmComment;
  }
  async softDelete(commentId: string): Promise<void> {
    await updateRow(SHEET_NAMES.COMMENTS, 'comment_id', commentId, { is_deleted: 'TRUE' });
  }
}

class AttachmentSheetsRepo {
  async findByTask(taskId: string): Promise<TmAttachment[]> {
    const rows = await loadRows(SHEET_NAMES.ATTACHMENTS, '__none__');
    return rows.filter(r => r.task_id === taskId) as unknown as TmAttachment[];
  }
  async create(data: Omit<TmAttachment, 'attachment_id'|'created_at'>): Promise<TmAttachment> {
    const row = { attachment_id: randomUUID(), ...data, created_at: new Date().toISOString() };
    await appendRow(SHEET_NAMES.ATTACHMENTS, row as unknown as Record<string, string>);
    return row as unknown as TmAttachment;
  }
  async delete(id: string): Promise<void> {
    await updateRow(SHEET_NAMES.ATTACHMENTS, 'attachment_id', id, { deleted: 'TRUE' });
  }
}

class NotifSheetsRepo {
  async findByUser(userId: string, unreadOnly = false): Promise<TmNotification[]> {
    const rows = await loadRows(SHEET_NAMES.NOTIFICATIONS, '__none__');
    return rows.filter(r => r.user_id === userId && (!unreadOnly || r.status !== 'read')) as unknown as TmNotification[];
  }
  async create(data: Omit<TmNotification,'notif_id'|'created_at'|'sent_at'|'read_at'>): Promise<TmNotification> {
    const row = { notif_id: randomUUID(), ...data, created_at: new Date().toISOString(), sent_at: '', read_at: '' };
    await appendRow(SHEET_NAMES.NOTIFICATIONS, row as Record<string, string>);
    return row as unknown as TmNotification;
  }
  async markAsRead(id: string): Promise<void> { await updateRow(SHEET_NAMES.NOTIFICATIONS, 'notif_id', id, { status: 'read', read_at: new Date().toISOString() }); }
  async markAllAsRead(userId: string): Promise<void> { /* batch */ }
  async updateStatus(id: string, status: string, sentAt?: string): Promise<void> {
    await updateRow(SHEET_NAMES.NOTIFICATIONS, 'notif_id', id, { status, ...(sentAt ? { sent_at: sentAt } : {}) });
  }
  async countUnread(userId: string): Promise<number> {
    const rows = await this.findByUser(userId, true);
    return rows.length;
  }
}

class ActivityLogSheetsRepo {
  async findByTask(taskId: string, limit = 50): Promise<TmActivityLog[]> {
    const rows = await loadRows(SHEET_NAMES.ACTIVITY_LOGS, '__none__');
    return rows.filter(r => r.task_id === taskId).slice(-limit) as unknown as TmActivityLog[];
  }
  async findByUser(userId: string, limit = 50): Promise<TmActivityLog[]> {
    const rows = await loadRows(SHEET_NAMES.ACTIVITY_LOGS, '__none__');
    return rows.filter(r => r.user_id === userId).slice(-limit) as unknown as TmActivityLog[];
  }
  async log(taskId: string, taskType: 'task'|'subtask', userId: string, action: AuditAction, oldValue?: Record<string,unknown>, newValue?: Record<string,unknown>, metadata?: Record<string,unknown>): Promise<TmActivityLog> {
    const row = {
      log_id: randomUUID(), task_id: taskId, task_type: taskType, user_id: userId,
      action, old_value: JSON.stringify(oldValue ?? {}), new_value: JSON.stringify(newValue ?? {}),
      metadata: JSON.stringify(metadata ?? {}), ip_address: '', created_at: new Date().toISOString(),
    };
    await appendRow(SHEET_NAMES.ACTIVITY_LOGS, row);
    return row as unknown as TmActivityLog;
  }
}

class UserSheetsRepo {
  async findById(userId: string): Promise<TmUser | null> {
    const rows = await loadRows(SHEET_NAMES.USERS);
    const r = rows.find(r => r.user_id === userId);
    return r ? r as unknown as TmUser : null;
  }
  async findByEmail(email: string): Promise<TmUser | null> {
    const rows = await loadRows(SHEET_NAMES.USERS);
    const r = rows.find(r => r.email === email);
    return r ? r as unknown as TmUser : null;
  }
  async findByDepartment(deptId: string): Promise<TmUser[]> {
    const rows = await loadRows(SHEET_NAMES.USERS);
    return rows.filter(r => r.department_id === deptId) as unknown as TmUser[];
  }
  async findAll(activeOnly = true): Promise<TmUser[]> {
    const rows = await loadRows(SHEET_NAMES.USERS);
    return (activeOnly ? rows.filter(r => r.is_active === 'TRUE') : rows) as unknown as TmUser[];
  }
  async update(userId: string, data: Partial<TmUser>): Promise<TmUser> {
    const r = await updateRow(SHEET_NAMES.USERS, 'user_id', userId, data as Record<string,string>);
    return r as unknown as TmUser;
  }
}

class DeptSheetsRepo {
  async findById(deptId: string): Promise<TmDepartment | null> {
    const rows = await loadRows(SHEET_NAMES.DEPARTMENTS);
    const r = rows.find(r => r.dept_id === deptId);
    return r ? r as unknown as TmDepartment : null;
  }
  async findAll(activeOnly = true): Promise<TmDepartment[]> {
    const rows = await loadRows(SHEET_NAMES.DEPARTMENTS);
    return (activeOnly ? rows.filter(r => r.is_active === 'TRUE') : rows) as unknown as TmDepartment[];
  }
}

class ProjectSheetsRepo {
  async findById(id: string): Promise<TmProject | null> {
    const rows = await loadRows(SHEET_NAMES.PROJECTS);
    const r = rows.find(r => r.project_id === id);
    return r ? r as unknown as TmProject : null;
  }
  async findAll(filters?: Partial<TmProject>): Promise<TmProject[]> {
    const rows = await loadRows(SHEET_NAMES.PROJECTS);
    return rows as unknown as TmProject[];
  }
  async findByMember(userId: string): Promise<TmProject[]> {
    const rows = await loadRows(SHEET_NAMES.PROJECTS);
    return rows.filter(r => (r.member_ids || '').includes(userId)) as unknown as TmProject[];
  }
  async create(data: Omit<TmProject,'project_id'|'created_at'|'updated_at'>): Promise<TmProject> {
    const row = { project_id: randomUUID(), ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await appendRow(SHEET_NAMES.PROJECTS, row as unknown as Record<string, string>);
    return row as unknown as TmProject;
  }
  async update(id: string, data: Partial<TmProject>): Promise<TmProject> {
    const r = await updateRow(SHEET_NAMES.PROJECTS, 'project_id', id, data as unknown as Record<string,string>);
    return r as unknown as TmProject;
  }
}

// ─── SINGLETON FACTORY ────────────────────────────────────

let _taskService: TaskService | null = null;
let _kpiService: KpiService | null   = null;

function buildUoW(): ITaskManagementUoW {
  return {
    tasks:         new TaskSheetsRepository(),
    subtasks:      new SubtaskSheetsRepository(),
    checklists:    new ChecklistSheetsRepository(),
    comments:      new CommentSheetsRepo(),
    attachments:   new AttachmentSheetsRepo(),
    notifications: new NotifSheetsRepo(),
    activityLogs:  new ActivityLogSheetsRepo(),
    users:         new UserSheetsRepo(),
    departments:   new DeptSheetsRepo(),
    projects:      new ProjectSheetsRepo(),
  };
}

export function getTaskService(): TaskService {
  if (!_taskService) {
    const uow   = buildUoW();
    const notif = new NotificationService();
    _taskService = new TaskService(uow, notif);
  }
  return _taskService;
}

export function getKpiService(): KpiService {
  if (!_kpiService) {
    _kpiService = new KpiService(buildUoW());
  }
  return _kpiService;
}
