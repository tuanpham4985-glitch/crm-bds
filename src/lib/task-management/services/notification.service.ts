// ============================================================
// CRM BĐS — Task Management: Notification Service
// ============================================================
import { randomUUID } from 'crypto';
import type { TmTask, TmNotification } from '../types';
import { SHEET_NAMES } from '../types';
import { appendRow, updateRow } from '../sheets/client';
import { tmCache, CK } from '../cache';

export class NotificationService {
  private async send(notif: Omit<TmNotification, 'notif_id' | 'created_at' | 'sent_at' | 'read_at' | 'status'>): Promise<void> {
    const row: Record<string, string> = {
      notif_id:   randomUUID(),
      user_id:    notif.user_id,
      type:       notif.type,
      title:      notif.title,
      body:       notif.body,
      task_id:    notif.task_id,
      task_type:  notif.task_type,
      channel:    notif.channel,
      status:     'pending',
      metadata:   notif.metadata ?? '{}',
      created_at: new Date().toISOString(),
      sent_at:    '',
      read_at:    '',
    };
    await appendRow(SHEET_NAMES.NOTIFICATIONS, row);
    tmCache.invalidate(CK.unreadCount(notif.user_id));
  }

  // ─── NOTIFICATION EVENTS ─────────────────────────────

  async notifyTaskAssigned(task: TmTask, assignedBy: string): Promise<void> {
    await this.send({
      user_id:   task.owner_id,
      type:      'task_assigned',
      title:     `Bạn được giao task mới: ${task.task_code}`,
      body:      `"${task.title}" — Hạn: ${this.formatDate(task.due_date)}. Ưu tiên: ${this.priorityLabel(task.priority)}.`,
      task_id:   task.task_id,
      task_type: 'task',
      channel:   'inapp',
      metadata:  JSON.stringify({ assigned_by: assignedBy, priority: task.priority }),
    });
  }

  async notifyReviewRequired(task: TmTask, submittedBy: string): Promise<void> {
    // Notify reviewer based on approval_level
    // In production: resolve reviewer from role lookup
    await this.send({
      user_id:   task.owner_id, // placeholder — real: lookup approver by level
      type:      'review_required',
      title:     `Task ${task.task_code} cần được duyệt (Cấp ${task.approval_level})`,
      body:      `"${task.title}" — Đã hoàn thành 100%, chờ phê duyệt cấp ${task.approval_level}.`,
      task_id:   task.task_id,
      task_type: 'task',
      channel:   'inapp',
      metadata:  JSON.stringify({ approval_level: task.approval_level, submitted_by: submittedBy }),
    });
  }

  async notifyApproved(task: TmTask, approvedBy: string): Promise<void> {
    await this.send({
      user_id:   task.owner_id,
      type:      'task_approved',
      title:     `Task ${task.task_code} đã được phê duyệt ✓`,
      body:      `"${task.title}" đã được duyệt. Task chuyển sang trạng thái Hoàn thành.`,
      task_id:   task.task_id,
      task_type: 'task',
      channel:   'inapp',
      metadata:  JSON.stringify({ approved_by: approvedBy }),
    });
  }

  async notifyRejected(task: TmTask, rejectedBy: string, reason: string): Promise<void> {
    await this.send({
      user_id:   task.owner_id,
      type:      'task_rejected',
      title:     `Task ${task.task_code} bị từ chối`,
      body:      `"${task.title}" cần làm lại. Lý do: ${reason}`,
      task_id:   task.task_id,
      task_type: 'task',
      channel:   'inapp',
      metadata:  JSON.stringify({ rejected_by: rejectedBy, reason }),
    });
  }

  async notifyBlocked(task: TmTask, blockedByUserId: string): Promise<void> {
    await this.send({
      user_id:   blockedByUserId,
      type:      'task_blocked',
      title:     `Task ${task.task_code} đang chờ thông tin từ bạn`,
      body:      `"${task.title}" đang bị chặn. Vui lòng cung cấp thông tin để tiếp tục.`,
      task_id:   task.task_id,
      task_type: 'task',
      channel:   'inapp',
      metadata:  JSON.stringify({ task_owner: task.owner_id }),
    });
  }

  async notifyEscalated(task: TmTask, escalatedBy: string, newLevel: number): Promise<void> {
    await this.send({
      user_id:   task.owner_id,
      type:      'task_escalated',
      title:     `Task ${task.task_code} được leo thang lên Cấp ${newLevel}`,
      body:      `"${task.title}" được chuyển lên cấp phê duyệt ${newLevel} do quá SLA.`,
      task_id:   task.task_id,
      task_type: 'task',
      channel:   'inapp',
      metadata:  JSON.stringify({ escalated_by: escalatedBy, new_level: newLevel }),
    });
  }

  async notifyCollaboratorAdded(task: TmTask, userId: string): Promise<void> {
    await this.send({
      user_id:   userId,
      type:      'collaborator_added',
      title:     `Bạn được thêm vào task ${task.task_code}`,
      body:      `"${task.title}" — Hạn: ${this.formatDate(task.due_date)}.`,
      task_id:   task.task_id,
      task_type: 'task',
      channel:   'inapp',
      metadata:  '{}',
    });
  }

  // ── Overdue Alert (called by scheduled job) ──────────

  async sendOverdueAlerts(overdueTasks: TmTask[]): Promise<void> {
    for (const task of overdueTasks) {
      const today    = new Date();
      const dueDate  = new Date(task.due_date);
      const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);

      await this.send({
        user_id:   task.owner_id,
        type:      'task_overdue',
        title:     `⚠️ Task ${task.task_code} quá hạn ${diffDays} ngày`,
        body:      `"${task.title}" đã quá hạn ${diffDays} ngày. Vui lòng cập nhật ngay.`,
        task_id:   task.task_id,
        task_type: 'task',
        channel:   'inapp',
        metadata:  JSON.stringify({ overdue_days: diffDays }),
      });
    }
  }

  // ── Mark as read ─────────────────────────────────────

  async markRead(notifId: string, userId: string): Promise<void> {
    await updateRow(SHEET_NAMES.NOTIFICATIONS, 'notif_id', notifId, {
      status:  'read',
      read_at: new Date().toISOString(),
    });
    tmCache.invalidate(CK.unreadCount(userId));
  }

  // ── Helpers ──────────────────────────────────────────

  private formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private priorityLabel(p: string): string {
    return { critical: 'Khẩn cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp' }[p] ?? p;
  }
}
