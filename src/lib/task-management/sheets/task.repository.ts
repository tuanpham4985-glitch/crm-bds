// ============================================================
// CRM BĐS — Task Management: Task Sheets Repository
// ============================================================
import { randomUUID } from 'crypto';
import { BaseSheetsRepository } from './base.repository';
import {
  loadRows, appendRow, updateRow, softDeleteRow,
  filterByField, filterByFieldIn, searchRows,
  sortByField, paginateRows,
} from './client';
import type {
  TmTask, TmSubtask, TmChecklist,
  CreateTaskInput, UpdateTaskInput,
  TaskFilters, PaginationOptions, PaginatedResult,
  CollaboratorEntry,
} from '../types';
import { SHEET_NAMES } from '../types';
import type {
  ITaskRepository, ISubtaskRepository, IChecklistRepository,
} from '../repository.interface';
import { isOpenTaskOverdue, todayYmd } from '../date-utils';

// ─── TASK REPOSITORY ──────────────────────────────────────

export class TaskSheetsRepository
  extends BaseSheetsRepository<TmTask>
  implements ITaskRepository
{
  protected sheetName = SHEET_NAMES.TASKS;
  protected idField   = 'task_id';

  protected deserialize(raw: Record<string, string>): TmTask {
    return {
      ...raw,
      progress_pct:    this.parseNumber(raw.progress_pct),
      estimated_hours: this.parseNumber(raw.estimated_hours),
      actual_hours:    this.parseNumber(raw.actual_hours),
      approval_level:  (this.parseNumber(raw.approval_level, 0) as 0 | 1 | 2 | 3),
    } as TmTask;
  }

  // ── READ ────────────────────────────────────────────────

  async findById(taskId: string): Promise<TmTask | null> {
    const rows = await loadRows(this.sheetName);
    const row  = rows.find(r => r.task_id === taskId && !r.deleted_at);
    return row ? this.deserialize(row) : null;
  }

  async findByCode(taskCode: string): Promise<TmTask | null> {
    const rows = await loadRows(this.sheetName);
    const row  = rows.find(r => r.task_code === taskCode && !r.deleted_at);
    return row ? this.deserialize(row) : null;
  }

  async findMany(
    filters: TaskFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TmTask>> {
    let rows = await loadRows(this.sheetName);
    rows = rows.filter(r => !r.deleted_at);

    // Apply filters in-memory
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      rows = filterByFieldIn(rows, 'status', statuses);
    }
    if (filters.priority) {
      const priorities = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
      rows = filterByFieldIn(rows, 'priority', priorities);
    }
    if (filters.owner_id)      rows = filterByField(rows, 'owner_id', filters.owner_id);
    if (filters.participant_id) {
      const me = filters.participant_id;
      rows = rows.filter(r => {
        if (r.owner_id === me) return true;
        try {
          const collabs: CollaboratorEntry[] = JSON.parse(r.collaborator_ids || '[]');
          return collabs.some(c => c.user_id === me);
        } catch {
          return false;
        }
      });
    }
    if (filters.department_id) rows = filterByField(rows, 'department_id', filters.department_id);
    if (filters.project_id)    rows = filterByField(rows, 'project_id', filters.project_id);

    if (filters.due_before) {
      rows = rows.filter(r => r.due_date && r.due_date <= filters.due_before!);
    }
    if (filters.due_after) {
      rows = rows.filter(r => r.due_date && r.due_date >= filters.due_after!);
    }
    if (filters.overdue_only) {
      const today = todayYmd();
      rows = rows.filter(r => isOpenTaskOverdue(r.due_date, r.status, today));
    }
    if (filters.tags?.length) {
      rows = rows.filter(r =>
        filters.tags!.some(tag => (r.tags || '').includes(tag)),
      );
    }
    if (filters.search) {
      rows = searchRows(rows, filters.search, ['title', 'objective', 'task_code', 'marketing_project_name', 'design_feedback_comment']);
    }

    rows = sortByField(rows, 'due_date', 'asc');

    const page  = pagination.page  ?? 1;
    const limit = pagination.limit ?? 50;
    const { data, total, has_more } = paginateRows(rows, page, limit);
    return {
      data: data.map(r => this.deserialize(r)),
      total,
      page,
      limit,
      has_more,
    };
  }

  async findByOwner(ownerId: string, pagination: PaginationOptions) {
    return this.findMany({ owner_id: ownerId }, pagination);
  }

  async findByDepartment(deptId: string, pagination: PaginationOptions) {
    return this.findMany({ department_id: deptId }, pagination);
  }

  async findByProject(projectId: string, pagination: PaginationOptions) {
    return this.findMany({ project_id: projectId }, pagination);
  }

  async findOverdue(): Promise<TmTask[]> {
    const today = todayYmd();
    const rows  = await loadRows(this.sheetName);
    return rows
      .filter(r =>
        !r.deleted_at &&
        isOpenTaskOverdue(r.due_date, r.status, today),
      )
      .map(r => this.deserialize(r));
  }

  async findPendingApproval(approverId: string, maxApprovalLevel: 1 | 2 | 3): Promise<TmTask[]> {
    const rows = await loadRows(this.sheetName);
    return rows
      .filter(r => {
        if (r.deleted_at || r.status !== 'review' || r.approval_status !== 'pending') return false;
        const level = Number(r.approval_level ?? 0);
        if (level <= 0 || level > maxApprovalLevel) return false;

        // New tasks store a concrete approver. Old rows without approver_id keep the legacy role-level behavior.
        return r.approver_id ? r.approver_id === approverId : true;
      })
      .map(r => this.deserialize(r));
  }

  // ── WRITE ───────────────────────────────────────────────

  async create(input: CreateTaskInput, createdBy: string): Promise<TmTask> {
    const taskCode = await this.nextTaskCode();
    const now = new Date().toISOString();
    const row: Record<string, string> = {
      task_id:                 randomUUID(),
      task_code:               taskCode,
      title:                   input.title,
      objective:               input.objective,
      description:             input.description ?? '',
      design_feedback_comment: input.design_feedback_comment?.trim() ?? '',
      project_id:              input.project_id,
      marketing_project_name:  input.marketing_project_name?.trim() ?? '',
      department_id:           input.department_id,
      requester_department_id: input.requester_department_id ?? '',
      owner_id:                input.owner_id || createdBy,
      collaborator_ids: JSON.stringify(input.collaborators ?? []),
      priority:         input.priority,
      status:           'todo',
      progress_pct:     '0',
      start_date:       input.start_date,
      due_date:         input.due_date,
      estimated_hours:  String(input.estimated_hours ?? 0),
      actual_hours:     '0',
      kpi_target:       JSON.stringify(input.kpi_target ?? []),
      kpi_actual:       '[]',
      approval_level:   String(input.approval_level ?? 0),
      approver_id:      input.approver_id ?? '',
      approval_status:  input.approval_level ? 'pending' : 'not_required',
      approved_by:      '',
      approved_at:      '',
      rejection_reason: '',
      tags:                (input.tags ?? []).join(','),
      email_reminder:      input.email_reminder ? '1' : '0',
      email_reminder_sent: '0',
      created_by:          createdBy,
      created_at:       now,
      updated_at:       now,
      completed_at:     '',
      closed_at:        '',
      deleted_at:       '',
    };
    await appendRow(this.sheetName, row);
    return this.deserialize(row);
  }

  async update(taskId: string, input: UpdateTaskInput): Promise<TmTask> {
    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    if (input.title         !== undefined) patch.title          = input.title;
    if (input.objective     !== undefined) patch.objective      = input.objective;
    if (input.description   !== undefined) patch.description    = input.description;
    if (input.design_feedback_comment !== undefined) patch.design_feedback_comment = input.design_feedback_comment.trim();
    if (input.owner_id      !== undefined) patch.owner_id       = input.owner_id;
    if (input.priority      !== undefined) patch.priority       = input.priority;
    if (input.start_date    !== undefined) patch.start_date     = input.start_date;
    if (input.due_date      !== undefined) patch.due_date       = input.due_date;
    if (input.estimated_hours !== undefined) patch.estimated_hours = String(input.estimated_hours);
    if (input.kpi_target    !== undefined) patch.kpi_target     = JSON.stringify(input.kpi_target);
    if (input.kpi_actual    !== undefined) patch.kpi_actual     = JSON.stringify(input.kpi_actual);
    if (input.tags                      !== undefined) patch.tags                      = input.tags.join(',');
    if (input.approval_level            !== undefined) patch.approval_level            = String(input.approval_level);
    if (input.approver_id               !== undefined) patch.approver_id               = input.approver_id;
    if (input.approval_status           !== undefined) patch.approval_status           = input.approval_status;
    if (input.department_id             !== undefined) patch.department_id             = input.department_id;
    if (input.requester_department_id   !== undefined) patch.requester_department_id   = input.requester_department_id;
    if (input.project_id                !== undefined) patch.project_id                = input.project_id;
    if (input.marketing_project_name    !== undefined) patch.marketing_project_name    = input.marketing_project_name.trim();

    const updated = await updateRow(this.sheetName, 'task_id', taskId, patch);
    if (!updated) throw new Error(`Task ${taskId} not found`);
    return this.deserialize(updated);
  }

  async updateStatus(
    taskId: string,
    status: TmTask['status'],
    reason?: string,
  ): Promise<TmTask> {
    const now = new Date().toISOString();
    const patch: Record<string, string> = {
      status,
      updated_at: now,
    };
    if (status === 'completed') patch.completed_at = now;
    if (!['completed', 'closed'].includes(status)) patch.completed_at = '';
    if (status === 'closed') patch.closed_at = now;
    if (reason)              patch.rejection_reason = reason;

    const updated = await updateRow(this.sheetName, 'task_id', taskId, patch);
    if (!updated) throw new Error(`Task ${taskId} not found`);
    return this.deserialize(updated);
  }

  async updateProgress(taskId: string, progressPct: number): Promise<TmTask> {
    const pct = Math.max(0, Math.min(100, progressPct));
    const updated = await updateRow(this.sheetName, 'task_id', taskId, {
      progress_pct: String(pct),
      updated_at:   new Date().toISOString(),
    });
    if (!updated) throw new Error(`Task ${taskId} not found`);
    return this.deserialize(updated);
  }

  async updateApproval(
    taskId: string,
    status: TmTask['approval_status'],
    approvedBy: string,
    reason?: string,
  ): Promise<TmTask> {
    const patch: Record<string, string> = {
      approval_status: status,
      approved_by:     approvedBy,
      approved_at:     new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };
    if (status === 'rejected' && reason) patch.rejection_reason = reason;
    const updated = await updateRow(this.sheetName, 'task_id', taskId, patch);
    if (!updated) throw new Error(`Task ${taskId} not found`);
    return this.deserialize(updated);
  }

  async transferOwner(taskId: string, newOwnerId: string): Promise<TmTask> {
    const updated = await updateRow(this.sheetName, 'task_id', taskId, {
      owner_id:   newOwnerId,
      updated_at: new Date().toISOString(),
    });
    if (!updated) throw new Error(`Task ${taskId} not found`);
    return this.deserialize(updated);
  }

  async softDelete(taskId: string): Promise<void> {
    await softDeleteRow(this.sheetName, 'task_id', taskId);
  }

  async addCollaborator(taskId: string, userId: string, role: string): Promise<void> {
    const task = await this.findById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const collabs: CollaboratorEntry[] = JSON.parse(task.collaborator_ids || '[]');
    if (collabs.some(c => c.user_id === userId)) return; // already exists
    collabs.push({ user_id: userId, role: role as CollaboratorEntry['role'] });
    await updateRow(this.sheetName, 'task_id', taskId, {
      collaborator_ids: JSON.stringify(collabs),
      updated_at:       new Date().toISOString(),
    });
  }

  async removeCollaborator(taskId: string, userId: string): Promise<void> {
    const task = await this.findById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const collabs: CollaboratorEntry[] = JSON.parse(task.collaborator_ids || '[]');
    const filtered = collabs.filter(c => c.user_id !== userId);
    await updateRow(this.sheetName, 'task_id', taskId, {
      collaborator_ids: JSON.stringify(filtered),
      updated_at:       new Date().toISOString(),
    });
  }

  async nextTaskCode(): Promise<string> {
    const year  = new Date().getFullYear();
    const rows  = await loadRows(this.sheetName);
    const codes = rows
      .map(r => r.task_code)
      .filter(c => c && c.startsWith(`T-${year}-`))
      .map(c => parseInt(c.split('-')[2] ?? '0', 10))
      .filter(n => !isNaN(n));
    const next = codes.length ? Math.max(...codes) + 1 : 1;
    return `T-${year}-${String(next).padStart(4, '0')}`;
  }
}

// ─── SUBTASK REPOSITORY ───────────────────────────────────

export class SubtaskSheetsRepository
  extends BaseSheetsRepository<TmSubtask>
  implements ISubtaskRepository
{
  protected sheetName = SHEET_NAMES.SUBTASKS;
  protected idField   = 'subtask_id';

  protected deserialize(raw: Record<string, string>): TmSubtask {
    return {
      ...raw,
      progress_pct:    this.parseNumber(raw.progress_pct),
      estimated_hours: this.parseNumber(raw.estimated_hours),
      actual_hours:    this.parseNumber(raw.actual_hours),
    } as TmSubtask;
  }

  async findById(id: string): Promise<TmSubtask | null> {
    const rows = await loadRows(this.sheetName);
    const row  = rows.find(r => r.subtask_id === id && !r.deleted_at);
    return row ? this.deserialize(row) : null;
  }

  async findByParentTask(taskId: string): Promise<TmSubtask[]> {
    const rows = await loadRows(this.sheetName);
    return rows
      .filter(r => r.parent_task_id === taskId && !r.deleted_at)
      .map(r => this.deserialize(r));
  }

  async create(
    parentTaskId: string,
    input: Omit<CreateTaskInput, 'project_id' | 'department_id'>,
    createdBy: string,
  ): Promise<TmSubtask> {
    const year   = new Date().getFullYear();
    const rows   = await loadRows(this.sheetName);
    const codes  = rows
      .map(r => r.subtask_code)
      .filter(c => c?.startsWith(`S-${year}-`))
      .map(c => parseInt(c.split('-')[2] ?? '0', 10));
    const next   = codes.length ? Math.max(...codes) + 1 : 1;
    const code   = `S-${year}-${String(next).padStart(4, '0')}`;
    const now    = new Date().toISOString();
    const row: Record<string, string> = {
      subtask_id:       randomUUID(),
      subtask_code:     code,
      parent_task_id:   parentTaskId,
      title:            input.title,
      objective:        input.objective,
      description:      input.description ?? '',
      owner_id:         input.owner_id,
      collaborator_ids: JSON.stringify(input.collaborators ?? []),
      priority:         input.priority,
      status:           'todo',
      progress_pct:     '0',
      start_date:       input.start_date,
      due_date:         input.due_date,
      estimated_hours:  String(input.estimated_hours ?? 0),
      actual_hours:     '0',
      created_by:       createdBy,
      created_at:       now,
      updated_at:       now,
      deleted_at:       '',
    };
    await appendRow(this.sheetName, row);
    return this.deserialize(row);
  }

  async update(subtaskId: string, data: Partial<TmSubtask>): Promise<TmSubtask> {
    const updated = await updateRow(this.sheetName, 'subtask_id', subtaskId, {
      ...data as Record<string, string>,
      updated_at: new Date().toISOString(),
    });
    if (!updated) throw new Error(`Subtask ${subtaskId} not found`);
    return this.deserialize(updated);
  }

  async updateStatus(subtaskId: string, status: TmSubtask['status']): Promise<TmSubtask> {
    const updated = await updateRow(this.sheetName, 'subtask_id', subtaskId, {
      status, updated_at: new Date().toISOString(),
    });
    if (!updated) throw new Error(`Subtask ${subtaskId} not found`);
    return this.deserialize(updated);
  }

  async updateProgress(subtaskId: string, progressPct: number): Promise<TmSubtask> {
    const updated = await updateRow(this.sheetName, 'subtask_id', subtaskId, {
      progress_pct: String(Math.max(0, Math.min(100, progressPct))),
      updated_at:   new Date().toISOString(),
    });
    if (!updated) throw new Error(`Subtask ${subtaskId} not found`);
    return this.deserialize(updated);
  }

  async softDelete(subtaskId: string): Promise<void> {
    await softDeleteRow(this.sheetName, 'subtask_id', subtaskId);
  }

  async countByParent(taskId: string): Promise<{ total: number; completed: number }> {
    const subtasks = await this.findByParentTask(taskId);
    return {
      total:     subtasks.length,
      completed: subtasks.filter(s => s.status === 'completed' || s.status === 'closed').length,
    };
  }
}

// ─── CHECKLIST REPOSITORY ─────────────────────────────────

export class ChecklistSheetsRepository
  extends BaseSheetsRepository<TmChecklist>
  implements IChecklistRepository
{
  protected sheetName = SHEET_NAMES.CHECKLISTS;
  protected idField   = 'checklist_id';

  protected deserialize(raw: Record<string, string>): TmChecklist {
    return {
      ...raw,
      is_done:    this.parseBoolean(raw.is_done),
      sort_order: this.parseNumber(raw.sort_order),
    } as TmChecklist;
  }

  async findByTask(taskId: string, taskType?: 'task' | 'subtask'): Promise<TmChecklist[]> {
    const rows = await loadRows(this.sheetName, '__none__');
    return rows
      .filter(r => r.task_id === taskId && (!taskType || r.task_type === taskType))
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      .map(r => this.deserialize(r));
  }

  async create(
    taskId: string,
    taskType: 'task' | 'subtask',
    title: string,
    sortOrder = 0,
  ): Promise<TmChecklist> {
    const row: Record<string, string> = {
      checklist_id: randomUUID(),
      task_id:      taskId,
      task_type:    taskType,
      title,
      is_done:      'FALSE',
      done_by:      '',
      done_at:      '',
      sort_order:   String(sortOrder),
      created_at:   new Date().toISOString(),
    };
    await appendRow(this.sheetName, row);
    return this.deserialize(row);
  }

  async toggle(checklistId: string, isDone: boolean, doneBy: string): Promise<TmChecklist> {
    const patch: Record<string, string> = {
      is_done: isDone ? 'TRUE' : 'FALSE',
      done_by: isDone ? doneBy : '',
      done_at: isDone ? new Date().toISOString() : '',
    };
    const updated = await updateRow(this.sheetName, 'checklist_id', checklistId, patch);
    if (!updated) throw new Error(`Checklist ${checklistId} not found`);
    return this.deserialize(updated);
  }

  async reorder(taskId: string, orderedIds: string[]): Promise<void> {
    const updates = orderedIds.map((id, index) => ({
      keyValue: id,
      data: { sort_order: String(index) },
    }));
    const { batchUpdateCells } = await import('./client');
    await batchUpdateCells(this.sheetName, 'checklist_id', updates);
  }

  async delete(checklistId: string): Promise<void> {
    // Hard delete for checklists (no audit trail needed)
    const { updateRow: ur } = await import('./client');
    await ur(this.sheetName, 'checklist_id', checklistId, { deleted: 'TRUE' });
  }

  async bulkCreate(
    taskId: string,
    taskType: 'task' | 'subtask',
    items: { title: string; sort_order: number }[],
  ): Promise<TmChecklist[]> {
    const now  = new Date().toISOString();
    const rows = items.map(item => ({
      checklist_id: randomUUID(),
      task_id:      taskId,
      task_type:    taskType,
      title:        item.title,
      is_done:      'FALSE',
      done_by:      '',
      done_at:      '',
      sort_order:   String(item.sort_order),
      created_at:   now,
    }));
    const { appendRows } = await import('./client');
    await appendRows(this.sheetName, rows);
    return rows.map(r => this.deserialize(r));
  }

  async progressByTask(taskId: string): Promise<{ done: number; total: number }> {
    const items = await this.findByTask(taskId);
    return {
      done:  items.filter(i => i.is_done).length,
      total: items.length,
    };
  }
}
