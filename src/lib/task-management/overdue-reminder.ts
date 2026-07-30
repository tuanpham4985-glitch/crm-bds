// ============================================================
// CRM BĐS — Task Management: Nhắc việc QUÁ HẠN (dùng chung)
// Dùng cho cả cron tự động lẫn nút "Gửi mail giục quá hạn" thủ công.
//
// Chống trùng theo ngày: mỗi việc có dấu `overdue_reminded_on = YYYY-MM-DD`.
// Một người chỉ nhận TỐI ĐA 1 email nhắc quá hạn/ngày — dù cron hay bấm tay,
// bấm bao nhiêu lần. Hôm sau dấu ngày khác → tự nhắc tiếp.
// ============================================================
import nodemailer from 'nodemailer';
import { loadRows, ensureColumns, batchUpdateRows, type RawRow } from './sheets/client';
import { SHEET_NAMES, type UserRole } from './types';

/**
 * Phạm vi được phép giục của người bấm nút.
 * - director: toàn công ty.
 * - manager / team_leader: nhân viên trong phòng mình HOẶC việc do mình giao.
 * - (cron tự động: không truyền scope → coi như toàn công ty).
 */
export interface NudgeScope { role: UserRole; userIds: string[]; departmentId: string; }

const DEDUPE_COL = 'overdue_reminded_on';

export function isSmtpConfigured(): boolean {
  const host = process.env.REMINDER_SMTP_HOST || process.env.SMTP_HOST;
  const user = process.env.REMINDER_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.REMINDER_SMTP_PASS || process.env.SMTP_PASS;
  return Boolean(host && user && pass);
}

function getTransporter() {
  const host = process.env.REMINDER_SMTP_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.REMINDER_SMTP_PORT || process.env.SMTP_PORT) || 465;
  const user = process.env.REMINDER_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.REMINDER_SMTP_PASS || process.env.SMTP_PASS;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

interface OverdueItem { task_code: string; title: string; due_date: string; days: number; }

function daysOverdue(due: string, todayStr: string): number {
  const toUTC = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((toUTC(todayStr) - toUTC(due)) / 86400000));
}

async function sendOverdueEmail(to: string, ownerName: string, items: OverdueItem[]): Promise<boolean> {
  try {
    const fromName  = process.env.REMINDER_SMTP_FROM || process.env.SMTP_FROM || 'Victory Holdings CRM';
    const fromEmail = process.env.REMINDER_SMTP_USER || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const from = `"${fromName}" <${fromEmail}>`;

    const rows = items.map(it => {
      const dueFmt = new Date(it.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#6b7280">${it.task_code}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#111827;font-weight:600">${it.title}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#374151;white-space:nowrap">${dueFmt}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#dc2626;font-weight:700;white-space:nowrap;text-align:center">${it.days} ngày</td>
        </tr>`;
    }).join('');

    await getTransporter().sendMail({
      from,
      to,
      subject: `🚨 Bạn có ${items.length} công việc ĐÃ QUÁ HẠN cần xử lý`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
          <div style="background:#dc2626;padding:20px 24px">
            <h2 style="color:#fff;margin:0;font-size:18px">🚨 Nhắc việc quá hạn</h2>
          </div>
          <div style="padding:24px">
            <p style="margin:0 0 8px;color:#374151">Xin chào <strong>${ownerName}</strong>,</p>
            <p style="margin:0 0 18px;color:#374151">Bạn đang có <strong style="color:#dc2626">${items.length} công việc quá hạn</strong> chưa hoàn thành. Vui lòng xử lý hoặc cập nhật tiến độ sớm:</p>
            <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
              <thead>
                <tr style="background:#f9fafb">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280">Mã việc</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280">Tên công việc</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280">Hạn chót</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280">Quá hạn</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="margin:18px 0 0;color:#6b7280;font-size:13px">Vui lòng đăng nhập CRM để cập nhật tiến độ hoặc trình duyệt.</p>
          </div>
          <div style="background:#f9fafb;padding:12px 24px;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af">Victory Holdings Việt Nam — Hệ thống CRM nội bộ</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('[OverdueReminder] sendMail failed:', err);
    return false;
  }
}

export interface OverdueRunResult {
  date: string;
  overdue_tasks: number;          // tổng việc quá hạn chưa xong
  owners_overdue: number;         // số người có việc quá hạn
  to_notify: number;              // số người CHƯA được nhắc hôm nay (sẽ/đã gửi)
  sent: number;
  failed: number;
  skipped_no_email: number;
  already_reminded_today: number; // số người đã được nhắc trong hôm nay → bỏ qua
}

/**
 * Quét việc quá hạn → gom theo người phụ trách → gửi 1 email tổng hợp/người.
 * @param opts.dryRun chỉ tính toán, KHÔNG gửi và KHÔNG đánh dấu (để xem trước).
 * @throws Error('SMTP_NOT_CONFIGURED') nếu chưa cấu hình SMTP.
 */
export async function runOverdueReminders(opts: { dryRun?: boolean; scope?: NudgeScope } = {}): Promise<OverdueRunResult> {
  const dryRun = opts.dryRun ?? false;
  const scope = opts.scope;
  if (!isSmtpConfigured()) throw new Error('SMTP_NOT_CONFIGURED');

  // Người này có được giục owner (dựa trên các việc quá hạn của owner) không?
  const ownerInScope = (items: RawRow[]): boolean => {
    if (!scope || scope.role === 'director') return true;
    return items.some(t =>
      (t.created_by && scope.userIds.includes(t.created_by)) ||                       // người giao việc
      ((scope.role === 'manager' || scope.role === 'team_leader') &&                  // quản lý trực tiếp
        t.department_id && t.department_id === scope.departmentId),
    );
  };

  if (!dryRun) await ensureColumns(SHEET_NAMES.TASKS, [DEDUPE_COL]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [taskRows, userRows] = await Promise.all([
    loadRows(SHEET_NAMES.TASKS),
    loadRows(SHEET_NAMES.USERS),
  ]);

  const userMap = new Map<string, { email: string; full_name: string }>();
  for (const u of userRows) {
    if (u.user_id) userMap.set(u.user_id, { email: u.email || '', full_name: u.full_name || '' });
  }

  const overdue = taskRows.filter(t =>
    t.due_date &&
    t.due_date < todayStr &&
    !t.deleted_at &&
    !['completed', 'closed'].includes(t.status),
  );

  const byOwner = new Map<string, RawRow[]>();
  for (const t of overdue) {
    if (!t.owner_id) continue;
    const arr = byOwner.get(t.owner_id);
    if (arr) arr.push(t); else byOwner.set(t.owner_id, [t]);
  }

  let sent = 0, failed = 0, skippedNoEmail = 0, alreadyToday = 0, toNotify = 0;
  let ownersInScope = 0, tasksInScope = 0;
  const toMark: { keyValue: string; data: Partial<RawRow> }[] = [];

  for (const [ownerId, items] of byOwner) {
    if (!ownerInScope(items)) continue; // ngoài phạm vi của người bấm → bỏ qua
    ownersInScope++;
    tasksInScope += items.length;

    // Chống trùng: nếu MỌI việc quá hạn của người này đã được nhắc hôm nay → bỏ qua
    if (items.every(t => t[DEDUPE_COL] === todayStr)) { alreadyToday++; continue; }
    toNotify++;

    const owner = userMap.get(ownerId);
    if (!owner?.email) {
      console.warn(`[OverdueReminder] Không có email cho owner ${ownerId} (${items.length} việc quá hạn)`);
      skippedNoEmail++;
      continue;
    }
    if (dryRun) continue;

    // Email liệt kê TOÀN BỘ việc quá hạn của owner (không cắt theo scope) và
    // đánh dấu TẤT CẢ → dù ai giục, owner cũng chỉ nhận 1 email/ngày.
    const list: OverdueItem[] = items
      .map(t => ({ task_code: t.task_code, title: t.title, due_date: t.due_date, days: daysOverdue(t.due_date, todayStr) }))
      .sort((a, b) => b.days - a.days);

    const ok = await sendOverdueEmail(owner.email, owner.full_name, list);
    if (ok) {
      sent++;
      for (const t of items) toMark.push({ keyValue: t.task_id, data: { [DEDUPE_COL]: todayStr } });
    } else {
      failed++;
    }
  }

  if (!dryRun && toMark.length) {
    await batchUpdateRows(SHEET_NAMES.TASKS, 'task_id', toMark);
  }

  return {
    date: todayStr,
    overdue_tasks: tasksInScope,
    owners_overdue: ownersInScope,
    to_notify: toNotify,
    sent, failed,
    skipped_no_email: skippedNoEmail,
    already_reminded_today: alreadyToday,
  };
}
