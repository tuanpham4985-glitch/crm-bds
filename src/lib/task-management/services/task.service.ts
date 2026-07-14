// ============================================================
// CRM BĐS — Task Management: Task Service (Business Logic)
// ============================================================
import type {
  TmTask, TmSubtask, TmChecklist, TaskWithDetails,
  CreateTaskInput, UpdateTaskInput, TaskFilters,
  PaginationOptions, PaginatedResult, RbacContext,
} from '../types';
import type { ITaskManagementUoW } from '../repository.interface';
import { rbac, PERMISSIONS } from '../rbac/rbac';
import { tmCache, CK, TTL, cached } from '../cache';
import { NotificationService } from './notification.service';

export class TaskService {
  constructor(
    private uow: ITaskManagementUoW,
    private notif: NotificationService,
  ) {}

  // ── CREATE ──────────────────────────────────────────────

  async createTask(ctx: RbacContext, input: CreateTaskInput): Promise<TmTask> {
    const normalizedInput: CreateTaskInput = {
      ...input,
      objective:     input.objective || input.title,
      project_id:    input.project_id || '',
      department_id: input.department_id || ctx.department_id || '',
      owner_id:      input.owner_id || ctx.user_id,
      start_date:    input.start_date || new Date().toISOString().slice(0, 10),
      due_date:      input.due_date || '',
    };

    // RBAC check
    if (normalizedInput.department_id !== ctx.department_id) {
      rbac.assert(ctx, PERMISSIONS.TASK_CREATE_ANY);
    } else {
      rbac.assert(ctx, PERMISSIONS.TASK_CREATE_OWN_DEPT);
    }

    const task = await this.uow.tasks.create(normalizedInput, ctx.user_id);

    // Bulk-create checklists if provided
    if (normalizedInput.checklists?.length) {
      await this.uow.checklists.bulkCreate(task.task_id, 'task', normalizedInput.checklists);
    }

    // Audit log
    await this.uow.activityLogs.log(
      task.task_id, 'task', ctx.user_id, 'created',
      undefined, { task_id: task.task_id, title: task.title },
    );

    // Notify owner (if different from creator)
    if (task.owner_id !== ctx.user_id) {
      await this.notif.notifyTaskAssigned(task, ctx.user_id);
    }

    // Invalidate relevant caches
    tmCache.invalidatePrefix(`tasks:dept:${task.department_id}`);
    tmCache.invalidate(CK.overdueList());

    return task;
  }

  // ── READ ────────────────────────────────────────────────

  async getTask(ctx: RbacContext, taskId: string): Promise<TaskWithDetails> {
    let task = await cached(
      CK.task(taskId),
      TTL.TASK_DETAIL,
      () => this.uow.tasks.findById(taskId),
    );
    // Fallback: taskId might be a task_code (T-YYYY-NNNN) when task_id column was missing
    if (!task && /^T-\d{4}-\d+$/.test(taskId)) {
      task = await this.uow.tasks.findByCode(taskId);
      if (task) tmCache.set(CK.task(task.task_id), task, TTL.TASK_DETAIL);
    }
    if (!task) throw new TaskNotFoundError(taskId);
    if (!rbac.canReadTask(ctx, task)) throw new UnauthorizedError('Cannot read this task');

    const [subtasks, checklists, comments, attachments] = await Promise.all([
      cached(CK.subtasks(taskId),   TTL.TASK_DETAIL, () => this.uow.subtasks.findByParentTask(taskId)).catch(() => []),
      cached(CK.checklists(taskId), TTL.TASK_DETAIL, () => this.uow.checklists.findByTask(taskId)).catch(() => []),
      cached(CK.comments(taskId),   TTL.TASK_DETAIL, () => this.uow.comments.findByTask(taskId)).catch(() => []),
      this.uow.attachments.findByTask(taskId).catch(() => []),
    ]);

    const checklistProgress = {
      done:  (checklists as { is_done: boolean }[]).filter(c => c.is_done).length,
      total: checklists.length,
    };

    return { ...task, subtasks, checklists, comments, attachments, checklist_progress: checklistProgress };
  }

  async listTasks(
    ctx: RbacContext,
    filters: TaskFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TmTask>> {
    // Scope filter by role
    const scopedFilters = this.applyScopeFilter(ctx, filters);
    return this.uow.tasks.findMany(scopedFilters, pagination);
  }

  async listOverdue(ctx: RbacContext): Promise<TmTask[]> {
    rbac.assert(ctx, PERMISSIONS.TASK_READ_DEPT);
    return cached(CK.overdueList(), TTL.OVERDUE, () => this.uow.tasks.findOverdue());
  }

  async getPendingApprovals(ctx: RbacContext): Promise<TmTask[]> {
    const level = this.approvalLevelForRole(ctx.role);
    if (!level) return [];
    return this.uow.tasks.findPendingApproval(ctx.user_id, level);
  }

  // ── UPDATE ──────────────────────────────────────────────

  async updateTask(ctx: RbacContext, taskId: string, input: UpdateTaskInput): Promise<TmTask> {
    const task = await this.requireTask(taskId);
    if (!rbac.canUpdateTask(ctx, task)) throw new UnauthorizedError('Cannot update this task');

    // Due date extension check for team_leader
    if (input.due_date && ctx.role === 'team_leader') {
      const maxDays = rbac.dueDateExtensionDays(ctx.role);
      const currentDue = new Date(task.due_date);
      const newDue     = new Date(input.due_date);
      const diffDays   = (newDue.getTime() - currentDue.getTime()) / 86_400_000;
      if (diffDays > maxDays) {
        throw new UnauthorizedError(`Team leader can only extend due date by max ${maxDays} days`);
      }
    }

    const old = { ...task };
    const updated = await this.uow.tasks.update(taskId, input, ctx.user_id);

    await this.uow.activityLogs.log(taskId, 'task', ctx.user_id, 'updated', old as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);
    this.invalidateTaskCache(task);

    // Notify new owner when assignment changes
    if (input.owner_id && input.owner_id !== old.owner_id && input.owner_id !== ctx.user_id) {
      await this.notif.notifyTaskAssigned(updated, ctx.user_id).catch(() => {});
    }

    return updated;
  }

  // ── STATUS TRANSITIONS ──────────────────────────────────

  async transitionStatus(
    ctx: RbacContext,
    taskId: string,
    newStatus: TmTask['status'],
    reason?: string,
    blockedByUserId?: string,
  ): Promise<TmTask> {
    const task = await this.requireTask(taskId);
    if (!rbac.canUpdateTask(ctx, task)) throw new UnauthorizedError('Cannot transition this task');

    this.validateTransition(task.status, newStatus, task, reason);

    // Extra validation before moving to Review
    if (newStatus === 'review') {
      if (task.progress_pct < 100) {
        throw new ValidationError('Progress must be 100% before submitting for review');
      }
      const checklistProg = await this.uow.checklists.progressByTask(taskId);
      if (checklistProg.total > 0 && checklistProg.done < checklistProg.total) {
        throw new ValidationError('All checklist items must be done before submitting for review');
      }
    }

    const updated = await this.uow.tasks.updateStatus(taskId, newStatus, reason);
    await this.uow.activityLogs.log(taskId, 'task', ctx.user_id, 'status_changed',
      { status: task.status }, { status: newStatus, reason },
    );

    // Notifications
    if (newStatus === 'review') {
      const approverIds = await this.resolveApprovers(updated);
      if (approverIds.length > 0) {
        for (const uid of approverIds) {
          await this.notif.notifyReviewRequired(updated, ctx.user_id, uid);
        }
      } else {
        await this.notif.notifyReviewRequired(updated, ctx.user_id, null);
      }
    }
    if (newStatus === 'waiting' && blockedByUserId) {
      await this.notif.notifyBlocked(updated, blockedByUserId);
    }

    this.invalidateTaskCache(task);
    return updated;
  }

  // ── PROGRESS UPDATE ─────────────────────────────────────

  async updateProgress(ctx: RbacContext, taskId: string, pct: number): Promise<TmTask> {
    const task = await this.requireTask(taskId);
    if (!rbac.canUpdateTask(ctx, task)) throw new UnauthorizedError('Cannot update this task');

    const updated = await this.uow.tasks.updateProgress(taskId, pct);

    // Auto-sync status
    if (pct > 0 && task.status === 'todo') {
      await this.uow.tasks.updateStatus(taskId, 'inprogress');
    }

    await this.uow.activityLogs.log(taskId, 'task', ctx.user_id, 'progress_updated',
      { progress_pct: task.progress_pct }, { progress_pct: pct },
    );

    this.invalidateTaskCache(task);
    return updated;
  }

  // ── APPROVAL ────────────────────────────────────────────

  async approveTask(ctx: RbacContext, taskId: string): Promise<TmTask> {
    const task = await this.requireTask(taskId);
    if (task.status !== 'review') throw new ValidationError('Task must be in Review status');
    if (!rbac.canApprove(ctx, task.approval_level)) {
      throw new UnauthorizedError(`Role "${ctx.role}" cannot approve level ${task.approval_level} tasks`);
    }

    const updated = await this.uow.tasks.updateApproval(taskId, 'approved', ctx.user_id);
    await this.uow.tasks.updateStatus(taskId, 'closed'); // duyệt = đóng luôn
    await this.uow.activityLogs.log(taskId, 'task', ctx.user_id, 'approved',
      { approval_status: 'pending' }, { approval_status: 'approved', approved_by: ctx.user_id },
    );
    await this.notif.notifyApproved(task, ctx.user_id);

    this.invalidateTaskCache(task);
    return updated;
  }

  async rejectTask(ctx: RbacContext, taskId: string, reason: string): Promise<TmTask> {
    if (!reason?.trim()) throw new ValidationError('Rejection reason is required');
    const task = await this.requireTask(taskId);
    if (task.status !== 'review') throw new ValidationError('Task must be in Review status');
    if (!rbac.canApprove(ctx, task.approval_level)) {
      throw new UnauthorizedError(`Role "${ctx.role}" cannot reject level ${task.approval_level} tasks`);
    }

    await this.uow.tasks.updateApproval(taskId, 'rejected', ctx.user_id, reason);
    const updated = await this.uow.tasks.updateStatus(taskId, 'inprogress', reason);
    await this.uow.activityLogs.log(taskId, 'task', ctx.user_id, 'rejected',
      { approval_status: 'pending' }, { approval_status: 'rejected', reason },
    );
    await this.notif.notifyRejected(task, ctx.user_id, reason);

    this.invalidateTaskCache(task);
    return updated;
  }

  async escalateTask(ctx: RbacContext, taskId: string): Promise<TmTask> {
    rbac.assert(ctx, PERMISSIONS.TASK_ESCALATE);
    const task = await this.requireTask(taskId);
    const newLevel = Math.min(3, task.approval_level + 1) as 1 | 2 | 3;

    const updated = await this.uow.tasks.update(taskId, { approval_level: newLevel } as UpdateTaskInput, ctx.user_id);
    await this.uow.activityLogs.log(taskId, 'task', ctx.user_id, 'escalated',
      { approval_level: task.approval_level }, { approval_level: newLevel },
    );
    await this.notif.notifyEscalated(task, ctx.user_id, newLevel);

    this.invalidateTaskCache(task);
    return updated;
  }

  // ── COLLABORATORS ───────────────────────────────────────

  async addCollaborator(ctx: RbacContext, taskId: string, userId: string, role: string): Promise<void> {
    const task = await this.requireTask(taskId);
    if (!rbac.canUpdateTask(ctx, task)) throw new UnauthorizedError('Cannot modify collaborators');

    // Cross-dept: requires extra permission
    const user = await this.uow.users.findById(userId);
    if (user && user.department_id !== task.department_id) {
      rbac.assert(ctx, PERMISSIONS.TASK_ASSIGN_CROSS_DEPT);
    }

    await this.uow.tasks.addCollaborator(taskId, userId, role);
    await this.uow.activityLogs.log(taskId, 'task', ctx.user_id, 'collaborator_added',
      undefined, { user_id: userId, role },
    );
    await this.notif.notifyCollaboratorAdded(task, userId);
    tmCache.invalidate(CK.task(taskId));
  }

  async removeCollaborator(ctx: RbacContext, taskId: string, userId: string): Promise<void> {
    const task = await this.requireTask(taskId);
    if (!rbac.canUpdateTask(ctx, task)) throw new UnauthorizedError('Cannot modify collaborators');
    await this.uow.tasks.removeCollaborator(taskId, userId);
    await this.uow.activityLogs.log(taskId, 'task', ctx.user_id, 'collaborator_removed',
      undefined, { user_id: userId },
    );
    tmCache.invalidate(CK.task(taskId));
  }

  // ── SUBTASKS ────────────────────────────────────────────

  async createSubtask(
    ctx: RbacContext,
    parentTaskId: string,
    input: Omit<CreateTaskInput, 'project_id' | 'department_id'>,
  ): Promise<TmSubtask> {
    const parent = await this.requireTask(parentTaskId);
    if (!rbac.canUpdateTask(ctx, parent)) throw new UnauthorizedError('Cannot add subtask to this task');

    const subtask = await this.uow.subtasks.create(parentTaskId, input, ctx.user_id);
    await this.uow.activityLogs.log(parentTaskId, 'task', ctx.user_id, 'created',
      undefined, { subtask_id: subtask.subtask_id, title: subtask.title },
    );
    tmCache.invalidate(CK.subtasks(parentTaskId));
    tmCache.invalidate(CK.task(parentTaskId));
    return subtask;
  }

  async toggleChecklist(ctx: RbacContext, checklistId: string, isDone: boolean): Promise<{
    checklist: TmChecklist;
    parent_progress: number;
  }> {
    const cl = await this.uow.checklists.toggle(checklistId, isDone, ctx.user_id);
    const progress = await this.uow.checklists.progressByTask(cl.task_id);
    const newPct   = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

    // Auto-update parent task progress
    await this.uow.tasks.updateProgress(cl.task_id, newPct);
    await this.uow.activityLogs.log(cl.task_id, 'task', ctx.user_id, 'checklist_toggled',
      { is_done: !isDone }, { is_done: isDone, checklist_id: checklistId },
    );

    tmCache.invalidate(CK.checklists(cl.task_id));
    tmCache.invalidate(CK.task(cl.task_id));
    return { checklist: cl, parent_progress: newPct };
  }

  // ── SOFT DELETE ─────────────────────────────────────────

  async deleteTask(ctx: RbacContext, taskId: string): Promise<void> {
    const task = await this.requireTask(taskId);

    if (task.status !== 'todo') {
      rbac.assert(ctx, PERMISSIONS.TASK_DELETE_ANY);
    } else {
      rbac.assert(ctx, PERMISSIONS.TASK_DELETE_DRAFT);
    }

    await this.uow.tasks.softDelete(taskId);
    await this.uow.activityLogs.log(taskId, 'task', ctx.user_id, 'deleted',
      { task_id: taskId }, undefined,
    );
    this.invalidateTaskCache(task);
  }

  // ── PRIVATE HELPERS ─────────────────────────────────────

  private async requireTask(taskId: string): Promise<TmTask> {
    const task = await this.uow.tasks.findById(taskId);
    if (!task) throw new TaskNotFoundError(taskId);
    return task;
  }

  // Tìm danh sách user_id có thể duyệt task dựa trên approval_level và department_id
  private async resolveApprovers(task: TmTask): Promise<string[]> {
    try {
      const level = Number(task.approval_level ?? 1);
      const allUsers = await this.uow.users.findAll();
      const results: string[] = [];

      for (const u of allUsers) {
        if (!u.user_id) continue;
        // director duyệt mọi cấp
        if (u.role === 'director') {
          if (level >= 3) results.push(u.user_id);
          continue;
        }
        // manager (cấp 2): cùng phòng ban
        if (u.role === 'manager' && level >= 2 && u.department_id === task.department_id) {
          results.push(u.user_id);
          continue;
        }
        // team_leader (cấp 1): cùng phòng ban
        if (u.role === 'team_leader' && level === 1 && u.department_id === task.department_id) {
          results.push(u.user_id);
        }
      }

      // Fallback: nếu không tìm được approver cùng phòng, gửi cho tất cả director
      if (results.length === 0) {
        allUsers.filter(u => u.role === 'director').forEach(u => results.push(u.user_id));
      }

      return [...new Set(results)]; // loại trùng
    } catch {
      return [];
    }
  }

  private applyScopeFilter(ctx: RbacContext, filters: TaskFilters): TaskFilters {
    if (ctx.role === 'director')    return filters;
    if (ctx.role === 'manager')
      return { ...filters, department_id: filters.department_id ?? ctx.department_id };
    if (ctx.role === 'team_leader')
      return { ...filters, department_id: filters.department_id ?? ctx.department_id };
    // staff: only own tasks
    return { ...filters, owner_id: ctx.user_id };
  }

  private approvalLevelForRole(role: string): 1 | 2 | 3 | null {
    if (role === 'director')     return 3;
    if (role === 'manager')      return 2;
    if (role === 'team_leader')  return 1;
    return null;
  }

  private validateTransition(
    from: TmTask['status'],
    to: TmTask['status'],
    task: TmTask,
    reason?: string,
  ): void {
    const allowed: Partial<Record<TmTask['status'], TmTask['status'][]>> = {
      todo:       ['inprogress'],
      inprogress: ['waiting', 'review'],
      waiting:    ['inprogress'],
      review:     ['completed', 'inprogress'],
      completed:  ['closed', 'inprogress'],
      closed:     [],
    };
    if (!allowed[from]?.includes(to)) {
      throw new ValidationError(`Cannot transition task from "${from}" to "${to}"`);
    }
    if (to === 'waiting' && !reason) {
      throw new ValidationError('Reason is required when setting task to Waiting');
    }
  }

  private invalidateTaskCache(task: TmTask): void {
    tmCache.invalidate(CK.task(task.task_id));
    tmCache.invalidatePrefix(`tasks:dept:${task.department_id}`);
    tmCache.invalidate(CK.overdueList());
    tmCache.invalidate(CK.deptKpi(task.department_id));
    tmCache.invalidate(CK.companyKpi());
  }
}

// ─── ERRORS ───────────────────────────────────────────────

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
  }
}
export class UnauthorizedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'UnauthorizedError'; }
}
export class ValidationError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
}
