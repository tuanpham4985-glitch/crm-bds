// ============================================================
// CRM BĐS — Task Management: KPI Dashboard Service
// ============================================================
import type {
  TmTask, DeptKpiSummary, UserWorkload, CompanyKpiDashboard,
  RbacContext,
} from '../types';
import type { ITaskManagementUoW } from '../repository.interface';
import { rbac, PERMISSIONS } from '../rbac/rbac';
import { CK, TTL, cached } from '../cache';

export class KpiService {
  constructor(private uow: ITaskManagementUoW) {}

  // ── COMPANY-LEVEL KPI (BGĐ only) ────────────────────────

  async getCompanyDashboard(ctx: RbacContext): Promise<CompanyKpiDashboard> {
    rbac.assert(ctx, PERMISSIONS.KPI_VIEW_COMPANY);

    return cached(CK.companyKpi(), TTL.KPI, async () => {
      const [depts, allTasks] = await Promise.all([
        this.uow.departments.findAll(),
        this.uow.tasks.findMany({}, { page: 1, limit: 9999 }).then(r => r.data),
      ]);

      const today       = new Date().toISOString().slice(0, 10);
      const monthStart  = new Date().toISOString().slice(0, 7) + '-01';

      const activeTasks    = allTasks.filter(t => !['closed'].includes(t.status));
      const overdueTasks   = allTasks.filter(t =>
        t.due_date < today && !['completed', 'closed'].includes(t.status),
      );
      const completedMonth = allTasks.filter(t =>
        t.status === 'completed' && t.updated_at >= monthStart,
      );
      const onTime         = allTasks.filter(t =>
        t.status === 'completed' && t.closed_at && t.closed_at <= t.due_date,
      );
      const onTimeRate     = completedMonth.length
        ? Math.round((onTime.length / completedMonth.length) * 100)
        : 0;

      const byDepartment: DeptKpiSummary[] = depts.map(dept => {
        const dTasks     = allTasks.filter(t => t.department_id === dept.dept_id);
        const dActive    = dTasks.filter(t => !['completed', 'closed'].includes(t.status));
        // "hoàn thành" = completed + closed (cả hai đều là done)
        const dCompleted = dTasks.filter(t => ['completed', 'closed'].includes(t.status));
        const dOverdue   = dTasks.filter(t =>
          t.due_date < today && !['completed', 'closed'].includes(t.status),
        );
        const dOnTime    = dCompleted.filter(t => t.closed_at && t.closed_at <= t.due_date);
        const dOnTimeRate = dCompleted.length
          ? Math.round((dOnTime.length / dCompleted.length) * 100)
          : 0;

        const kpiAchieved = dCompleted.filter(t => this.kpiAchieved(t)).length;
        const kpiRate     = dCompleted.length
          ? Math.round((kpiAchieved / dCompleted.length) * 100)
          : 0;

        const avgDays = dCompleted.length
          ? dCompleted.reduce((sum, t) => {
              const start = new Date(t.start_date).getTime();
              const end   = new Date(t.updated_at).getTime();
              return sum + (end - start) / 86_400_000;
            }, 0) / dCompleted.length
          : 0;

        return {
          department_id:        dept.dept_id,
          department_name:      dept.name,
          active_tasks:         dTasks.length,       // tổng tất cả task của phòng
          completed_tasks:      dCompleted.length,   // hoàn thành + đã đóng
          overdue_tasks:        dOverdue.length,
          on_time_rate_pct:     dOnTimeRate,
          avg_completion_days:  Math.round(avgDays),
          kpi_achievement_pct:  kpiRate,
        };
      });

      // Workload per user
      const users = await this.uow.users.findAll();
      const workloadDist: UserWorkload[] = await Promise.all(
        users.map(async user => {
          const uTasks    = allTasks.filter(t => t.owner_id === user.user_id);
          const uActive   = uTasks.filter(t => !['completed', 'closed'].includes(t.status));
          const uOverdue  = uActive.filter(t => t.due_date < today);
          const uDoneMonth = uTasks.filter(t =>
            t.status === 'completed' && t.updated_at >= monthStart,
          );
          const dept = depts.find(d => d.dept_id === user.department_id);
          const avgPct = uActive.length
            ? Math.round(uActive.reduce((s, t) => s + t.progress_pct, 0) / uActive.length)
            : 0;
          return {
            user_id:               user.user_id,
            full_name:             user.full_name,
            department:            dept?.name ?? '—',
            active_tasks:          uActive.length,
            overdue_tasks:         uOverdue.length,
            completed_this_month:  uDoneMonth.length,
            avg_progress_pct:      avgPct,
          };
        }),
      );

      const topOverdue = overdueTasks
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
        .slice(0, 10);

      // Aggregations by status
      const STATUS_LABELS: Record<string, string> = {
        todo: 'Chờ làm', in_progress: 'Đang làm', review: 'Chờ duyệt',
        completed: 'Hoàn thành', closed: 'Đã đóng',
      };
      const byStatus: Record<string, number> = {};
      for (const t of allTasks) {
        const label = STATUS_LABELS[t.status] ?? t.status;
        byStatus[label] = (byStatus[label] ?? 0) + 1;
      }

      const PRIORITY_LABELS: Record<string, string> = {
        urgent: 'Khẩn', high: 'Cao', medium: 'Trung bình', low: 'Thấp',
      };
      const byPriority: Record<string, number> = {};
      for (const t of allTasks) {
        const label = PRIORITY_LABELS[t.priority] ?? t.priority;
        byPriority[label] = (byPriority[label] ?? 0) + 1;
      }

      return {
        snapshot_date:              today,
        total_tasks:                allTasks.length,
        total_active_tasks:         activeTasks.length,
        total_overdue_tasks:        overdueTasks.length,
        total_completed_this_month: completedMonth.length,
        completed_tasks:            allTasks.filter(t => t.status === 'completed').length,
        overdue_tasks:              overdueTasks.length,
        pending_approval:           allTasks.filter(t => t.approval_status === 'pending').length,
        overall_on_time_rate_pct:   onTimeRate,
        by_status:                  byStatus,
        by_priority:                byPriority,
        by_department:              byDepartment,
        top_overdue:                topOverdue,
        workload_distribution:      workloadDist,
      };
    });
  }

  // ── DEPT KPI ────────────────────────────────────────────

  async getDeptKpi(ctx: RbacContext, deptId: string): Promise<DeptKpiSummary> {
    if (ctx.role !== 'director') {
      rbac.assert(ctx, PERMISSIONS.KPI_VIEW_DEPT);
      if (ctx.department_id !== deptId) {
        throw new Error('Cannot view KPI for another department');
      }
    }

    return cached(CK.deptKpi(deptId), TTL.KPI, async () => {
      const [dept, tasks] = await Promise.all([
        this.uow.departments.findById(deptId),
        this.uow.tasks.findByDepartment(deptId, { page: 1, limit: 9999 }).then(r => r.data),
      ]);
      if (!dept) throw new Error(`Department ${deptId} not found`);

      const today      = new Date().toISOString().slice(0, 10);
      const active     = tasks.filter(t => !['closed'].includes(t.status));
      const completed  = tasks.filter(t => t.status === 'completed');
      const overdue    = tasks.filter(t =>
        t.due_date < today && !['completed', 'closed'].includes(t.status),
      );
      const onTime     = completed.filter(t => t.closed_at && t.closed_at <= t.due_date);
      const kpiAchiev  = completed.filter(t => this.kpiAchieved(t));

      return {
        department_id:        dept.dept_id,
        department_name:      dept.name,
        active_tasks:         active.length,
        completed_tasks:      completed.length,
        overdue_tasks:        overdue.length,
        on_time_rate_pct:     completed.length ? Math.round(onTime.length * 100 / completed.length) : 0,
        avg_completion_days:  0,
        kpi_achievement_pct:  completed.length ? Math.round(kpiAchiev.length * 100 / completed.length) : 0,
      };
    });
  }

  // ── USER KPI (cá nhân) ──────────────────────────────────

  async getUserKpi(ctx: RbacContext, userId: string): Promise<{
    active: number;
    completed_month: number;
    overdue: number;
    on_time_rate: number;
    avg_progress: number;
    kpi_achievement_pct: number;
  }> {
    if (ctx.role === 'staff' && ctx.user_id !== userId) {
      throw new Error('Staff can only view own KPI');
    }

    const tasks = await this.uow.tasks.findByOwner(userId, { page: 1, limit: 9999 }).then(r => r.data);
    const today      = new Date().toISOString().slice(0, 10);
    const monthStart = new Date().toISOString().slice(0, 7) + '-01';

    const active        = tasks.filter(t => !['completed', 'closed'].includes(t.status));
    const completedMonth = tasks.filter(t => t.status === 'completed' && t.updated_at >= monthStart);
    const overdue       = active.filter(t => t.due_date < today);
    const onTime        = completedMonth.filter(t => t.closed_at && t.closed_at <= t.due_date);
    const kpiAchieved   = completedMonth.filter(t => this.kpiAchieved(t));
    const avgProgress   = active.length
      ? Math.round(active.reduce((s, t) => s + t.progress_pct, 0) / active.length)
      : 0;

    return {
      active:               active.length,
      completed_month:      completedMonth.length,
      overdue:              overdue.length,
      on_time_rate:         completedMonth.length ? Math.round(onTime.length * 100 / completedMonth.length) : 0,
      avg_progress:         avgProgress,
      kpi_achievement_pct:  completedMonth.length ? Math.round(kpiAchieved.length * 100 / completedMonth.length) : 0,
    };
  }

  // ── KPI ACHIEVEMENT HELPER ─────────────────────────────

  private kpiAchieved(task: TmTask): boolean {
    try {
      const targets: { unit: string; target: number; actual?: number }[] =
        JSON.parse(task.kpi_target || '[]');
      const actuals: { unit: string; actual: number }[] =
        JSON.parse(task.kpi_actual || '[]');
      if (!targets.length) return true; // no KPI set = n/a
      return targets.every(t => {
        const act = actuals.find(a => a.unit === t.unit);
        return act ? act.actual >= t.target : false;
      });
    } catch { return false; }
  }
}
