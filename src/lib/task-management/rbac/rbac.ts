// ============================================================
// CRM BĐS — Task Management: RBAC
// Role-Based Access Control — in-memory, no DB round-trip
// ============================================================
import type { UserRole, TmTask, TmUser, RbacContext } from '../types';

// ─── PERMISSION DEFINITIONS ───────────────────────────────

export const PERMISSIONS = {
  // Task CRUD
  TASK_CREATE_OWN_DEPT:    'task:create:own_dept',
  TASK_CREATE_ANY:         'task:create:any',
  TASK_READ_OWN:           'task:read:own',
  TASK_READ_DEPT:          'task:read:dept',
  TASK_READ_ALL:           'task:read:all',
  TASK_UPDATE_OWN:         'task:update:own',
  TASK_UPDATE_DEPT:        'task:update:dept',
  TASK_UPDATE_ANY:         'task:update:any',
  TASK_DELETE_DRAFT:       'task:delete:draft',
  TASK_DELETE_ANY:         'task:delete:any',
  TASK_TRANSFER_OWNER:     'task:transfer_owner',

  // Priority & dates
  TASK_SET_PRIORITY:       'task:set_priority',
  TASK_EXTEND_DUE_DATE:    'task:extend_due_date',
  TASK_EXTEND_DUE_3DAYS:   'task:extend_due_3days',

  // Approval
  TASK_APPROVE_L1:         'task:approve:l1',
  TASK_APPROVE_L2:         'task:approve:l2',
  TASK_APPROVE_L3:         'task:approve:l3',
  TASK_REJECT:             'task:reject',
  TASK_REOPEN:             'task:reopen',
  TASK_ESCALATE:           'task:escalate',

  // Cross-department
  TASK_ASSIGN_CROSS_DEPT:  'task:assign:cross_dept',
  TASK_VIEW_CROSS_DEPT:    'task:view:cross_dept',

  // Reports & KPI
  KPI_VIEW_COMPANY:        'kpi:view:company',
  KPI_VIEW_DEPT:           'kpi:view:dept',
  KPI_VIEW_TEAM:           'kpi:view:team',
  KPI_VIEW_OWN:            'kpi:view:own',
  REPORT_EXPORT:           'report:export',
  REPORT_EXPORT_DEPT:      'report:export:dept',

  // Comments & attachments
  COMMENT_ANY:             'comment:any',
  COMMENT_DEPT:            'comment:dept',
  COMMENT_OWN:             'comment:own',
  COMMENT_DELETE_ANY:      'comment:delete:any',
  ATTACHMENT_UPLOAD:       'attachment:upload',
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ─── ROLE → PERMISSIONS MAP ───────────────────────────────

const ROLE_PERMISSIONS: Record<UserRole, PermissionCode[]> = {
  director: [
    PERMISSIONS.TASK_CREATE_OWN_DEPT,
    PERMISSIONS.TASK_CREATE_ANY,
    PERMISSIONS.TASK_READ_OWN,
    PERMISSIONS.TASK_READ_DEPT,
    PERMISSIONS.TASK_READ_ALL,
    PERMISSIONS.TASK_UPDATE_OWN,
    PERMISSIONS.TASK_UPDATE_DEPT,
    PERMISSIONS.TASK_UPDATE_ANY,
    PERMISSIONS.TASK_DELETE_DRAFT,
    PERMISSIONS.TASK_DELETE_ANY,
    PERMISSIONS.TASK_TRANSFER_OWNER,
    PERMISSIONS.TASK_SET_PRIORITY,
    PERMISSIONS.TASK_EXTEND_DUE_DATE,
    PERMISSIONS.TASK_APPROVE_L1,
    PERMISSIONS.TASK_APPROVE_L2,
    PERMISSIONS.TASK_APPROVE_L3,
    PERMISSIONS.TASK_REJECT,
    PERMISSIONS.TASK_REOPEN,
    PERMISSIONS.TASK_ESCALATE,
    PERMISSIONS.TASK_ASSIGN_CROSS_DEPT,
    PERMISSIONS.TASK_VIEW_CROSS_DEPT,
    PERMISSIONS.KPI_VIEW_COMPANY,
    PERMISSIONS.KPI_VIEW_DEPT,
    PERMISSIONS.KPI_VIEW_TEAM,
    PERMISSIONS.KPI_VIEW_OWN,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.REPORT_EXPORT_DEPT,
    PERMISSIONS.COMMENT_ANY,
    PERMISSIONS.COMMENT_DEPT,
    PERMISSIONS.COMMENT_OWN,
    PERMISSIONS.COMMENT_DELETE_ANY,
    PERMISSIONS.ATTACHMENT_UPLOAD,
  ],

  manager: [
    PERMISSIONS.TASK_CREATE_OWN_DEPT,
    PERMISSIONS.TASK_CREATE_ANY,
    PERMISSIONS.TASK_READ_OWN,
    PERMISSIONS.TASK_READ_DEPT,
    PERMISSIONS.TASK_UPDATE_OWN,
    PERMISSIONS.TASK_UPDATE_DEPT,
    PERMISSIONS.TASK_DELETE_DRAFT,
    PERMISSIONS.TASK_TRANSFER_OWNER,
    PERMISSIONS.TASK_SET_PRIORITY,
    PERMISSIONS.TASK_EXTEND_DUE_DATE,
    PERMISSIONS.TASK_APPROVE_L1,
    PERMISSIONS.TASK_APPROVE_L2,
    PERMISSIONS.TASK_REJECT,
    PERMISSIONS.TASK_REOPEN,
    PERMISSIONS.TASK_ESCALATE,
    PERMISSIONS.TASK_ASSIGN_CROSS_DEPT,
    PERMISSIONS.TASK_VIEW_CROSS_DEPT,
    PERMISSIONS.KPI_VIEW_DEPT,
    PERMISSIONS.KPI_VIEW_TEAM,
    PERMISSIONS.KPI_VIEW_OWN,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.REPORT_EXPORT_DEPT,
    PERMISSIONS.COMMENT_DEPT,
    PERMISSIONS.COMMENT_OWN,
    PERMISSIONS.ATTACHMENT_UPLOAD,
  ],

  team_leader: [
    PERMISSIONS.TASK_CREATE_OWN_DEPT,
    PERMISSIONS.TASK_READ_OWN,
    PERMISSIONS.TASK_READ_DEPT,
    PERMISSIONS.TASK_UPDATE_OWN,
    PERMISSIONS.TASK_UPDATE_DEPT,
    // Nhân viên xoá được task nháp của mình, nên team leader cũng phải xoá
    // được task nháp của mình / của nhóm — thiếu quyền này là lỗ hổng cũ.
    PERMISSIONS.TASK_DELETE_DRAFT,
    PERMISSIONS.TASK_SET_PRIORITY,
    PERMISSIONS.TASK_EXTEND_DUE_3DAYS,
    PERMISSIONS.TASK_APPROVE_L1,
    PERMISSIONS.TASK_REJECT,
    PERMISSIONS.TASK_ESCALATE,
    PERMISSIONS.KPI_VIEW_TEAM,
    PERMISSIONS.KPI_VIEW_OWN,
    PERMISSIONS.REPORT_EXPORT_DEPT,
    PERMISSIONS.COMMENT_DEPT,
    PERMISSIONS.COMMENT_OWN,
    PERMISSIONS.ATTACHMENT_UPLOAD,
  ],

  staff: [
    PERMISSIONS.TASK_CREATE_OWN_DEPT,
    PERMISSIONS.TASK_READ_OWN,
    PERMISSIONS.TASK_UPDATE_OWN,
    PERMISSIONS.TASK_DELETE_DRAFT,
    PERMISSIONS.KPI_VIEW_OWN,
    PERMISSIONS.COMMENT_OWN,
    PERMISSIONS.ATTACHMENT_UPLOAD,
  ],
};

// ─── RBAC CLASS ───────────────────────────────────────────

export class RbacService {
  private permCache = new Map<UserRole, Set<PermissionCode>>();

  private getPermSet(role: UserRole): Set<PermissionCode> {
    if (!this.permCache.has(role)) {
      this.permCache.set(role, new Set(ROLE_PERMISSIONS[role] ?? []));
    }
    return this.permCache.get(role)!;
  }

  /** Check if a role has a specific permission */
  can(role: UserRole, permission: PermissionCode): boolean {
    return this.getPermSet(role).has(permission);
  }

  /** Throw if not authorized */
  assert(ctx: RbacContext, permission: PermissionCode): void {
    if (!this.can(ctx.role, permission)) {
      throw new RbacError(
        `Unauthorized: role "${ctx.role}" cannot perform "${permission}"`,
        ctx,
        permission,
      );
    }
  }

  // ── CONTEXT-AWARE CHECKS ──────────────────────────────

  private userIds(ctx: RbacContext): Set<string> {
    return new Set([ctx.user_id, ctx.employee_code].filter(Boolean) as string[]);
  }

  private isCurrentUser(ctx: RbacContext, userId: string): boolean {
    return Boolean(userId && this.userIds(ctx).has(userId));
  }

  /** Can user READ this task? */
  canReadTask(ctx: RbacContext, task: Pick<TmTask, 'owner_id' | 'department_id' | 'collaborator_ids' | 'created_by'>): boolean {
    if (ctx.role === 'director')     return true;
    // Tasks with no owner/dept visible to all
    if (!task.owner_id && !task.department_id) return true;
    if (this.isCurrentUser(ctx, task.owner_id)) return true;
    if (this.isCurrentUser(ctx, task.created_by)) return true;

    // Is collaborator?
    try {
      const collabs: { user_id: string }[] = JSON.parse(task.collaborator_ids || '[]');
      if (collabs.some(c => this.isCurrentUser(ctx, c.user_id))) return true;
    } catch { /* ignore */ }

    if (ctx.role === 'manager' && task.department_id === ctx.department_id) return true;
    if (ctx.role === 'team_leader' && task.department_id === ctx.department_id) return true;
    return false;
  }

  /** Can user UPDATE this task? */
  canUpdateTask(ctx: RbacContext, task: Pick<TmTask, 'owner_id' | 'department_id' | 'created_by'>): boolean {
    if (ctx.role === 'director')    return true;
    if (this.isCurrentUser(ctx, task.owner_id)) return true;
    if (this.isCurrentUser(ctx, task.created_by)) return true;
    if (ctx.role === 'manager' && task.department_id === ctx.department_id) return true;
    if (ctx.role === 'team_leader' && task.department_id === ctx.department_id) return true;
    return false;
  }

  /**
   * Can user DELETE this task?
   *
   * Nguồn sự thật DUY NHẤT cho cả API lẫn nút thùng rác trên giao diện —
   * hai bên lệch nhau thì hoặc nút biến mất oan, hoặc bấm vào lại bị 403.
   *
   * - Task đã rời trạng thái "Chờ làm" → chỉ ai có TASK_DELETE_ANY (director).
   * - Task còn "Chờ làm" → phải có TASK_DELETE_DRAFT **và** thực sự liên quan
   *   tới task: người tạo, người thực hiện chính, hoặc quản lý cùng phòng ban.
   *   (Trước đây chỉ kiểm tra quyền, nên mọi nhân viên xoá được task nháp của
   *   bất kỳ ai.)
   */
  canDeleteTask(
    ctx: RbacContext,
    task: Pick<TmTask, 'status' | 'owner_id' | 'department_id' | 'created_by'>,
  ): boolean {
    if (task.status !== 'todo') return this.can(ctx.role, PERMISSIONS.TASK_DELETE_ANY);
    return this.can(ctx.role, PERMISSIONS.TASK_DELETE_DRAFT) && this.canUpdateTask(ctx, task);
  }

  /** Can user APPROVE this task at the required level? */
  canApprove(ctx: RbacContext, approvalLevel: 1 | 2 | 3): boolean {
    if (approvalLevel === 1) return this.can(ctx.role, PERMISSIONS.TASK_APPROVE_L1);
    if (approvalLevel === 2) return this.can(ctx.role, PERMISSIONS.TASK_APPROVE_L2);
    if (approvalLevel === 3) return this.can(ctx.role, PERMISSIONS.TASK_APPROVE_L3);
    return false;
  }

  /** Can user EXTEND due date? Returns max days allowed (0 = not allowed) */
  dueDateExtensionDays(role: UserRole): number {
    if (role === 'director' || role === 'manager') return Infinity;
    if (role === 'team_leader') return 3;
    return 0;
  }

  /** List all permissions for a role */
  listPermissions(role: UserRole): PermissionCode[] {
    return [...this.getPermSet(role)];
  }

  /** Check multiple permissions at once */
  canAll(role: UserRole, permissions: PermissionCode[]): boolean {
    return permissions.every(p => this.can(role, p));
  }

  canAny(role: UserRole, permissions: PermissionCode[]): boolean {
    return permissions.some(p => this.can(role, p));
  }
}

// ─── ERROR ────────────────────────────────────────────────

export class RbacError extends Error {
  constructor(
    message: string,
    public ctx: RbacContext,
    public permission: PermissionCode,
  ) {
    super(message);
    this.name = 'RbacError';
  }
}

// ─── SINGLETON ────────────────────────────────────────────

export const rbac = new RbacService();

// ─── NEXT.JS MIDDLEWARE HELPER ────────────────────────────

export function requirePermission(
  user: TmUser,
  permission: PermissionCode,
): void {
  const ctx: RbacContext = {
    user_id:       user.user_id,
    employee_code: user.employee_code,
    role:          user.role,
    department_id: user.department_id,
    team_id:       user.team_id,
  };
  rbac.assert(ctx, permission);
}
