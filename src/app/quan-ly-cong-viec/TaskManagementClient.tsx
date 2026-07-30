'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, BarChart2, Loader2, Send } from 'lucide-react';
import { useTmStore } from '@/stores/tmStore';
import { useCurrentTmUser } from '@/hooks/tm/useTasks';
import TaskFilters from '@/components/task-management/TaskFilters';
import TaskList from '@/components/task-management/TaskList';
import TaskDetail from '@/components/task-management/TaskDetail';
import TaskForm from '@/components/task-management/TaskForm';
import NotificationCenter from '@/components/task-management/NotificationCenter';

const KanbanBoard = dynamic(
  () => import('@/components/task-management/KanbanBoard'),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--text-muted)', gap: 10 }}>
        <Loader2 size={20} className="tm-spin" /> Đang tải Kanban...
      </div>
    ),
  },
);

const KpiDashboard = dynamic(
  () => import('@/components/task-management/KpiDashboard'),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 10 }}>
        <Loader2 size={18} className="tm-spin" /> Đang tải KPI...
      </div>
    ),
  },
);

const CalendarView = dynamic(
  () => import('@/components/task-management/CalendarView'),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--text-muted)', gap: 10 }}>
        <Loader2 size={20} className="tm-spin" /> Đang tải lịch...
      </div>
    ),
  },
);

export default function TaskManagementClient() {
  // Đồng bộ nhân sự nay nằm gọn ở nút "Đồng bộ nhân sự" trang Nhân viên —
  // nút đó chạy cả HR → NHAN_VIEN → PostgreSQL → TM_Users trong một lượt.
  const { filters, createModalOpen, setCreateModal } = useTmStore();
  const [showKpi, setShowKpi] = useState(false);
  const currentUser = useCurrentTmUser();
  // Ban GĐ (toàn công ty) + Trưởng phòng / Nhóm trưởng (phòng mình / việc mình giao)
  const canNudgeOverdue = ['director', 'manager', 'team_leader'].includes(currentUser?.role ?? '');
  const [overdueSending, setOverdueSending] = useState(false);

  // Gửi email giục các việc quá hạn (chỉ Admin/Ban GĐ). Xem trước số liệu → xác nhận → gửi.
  const handleOverdueMail = async () => {
    setOverdueSending(true);
    try {
      const pre = await fetch('/api/tm/overdue-reminders').then(r => r.json());
      if (!pre.success) { alert(pre.error || 'Không lấy được danh sách quá hạn'); return; }
      const p = pre.data;
      if (p.to_notify === 0) {
        alert(p.overdue_tasks === 0
          ? 'Hiện không có công việc nào quá hạn.'
          : `Tất cả ${p.owners_overdue} người có việc quá hạn đều đã được giục hôm nay. Không gửi lại.`);
        return;
      }
      const ok = window.confirm(
        `Trong phạm vi bạn quản lý: ${p.overdue_tasks} công việc quá hạn của ${p.owners_overdue} người.\n\n` +
        `Gửi email giục tới ${p.to_notify} người chưa được nhắc hôm nay?`,
      );
      if (!ok) return;
      const res = await fetch('/api/tm/overdue-reminders', { method: 'POST' }).then(r => r.json());
      if (!res.success) { alert(res.error || 'Gửi thất bại'); return; }
      const d = res.data;
      alert(
        `Đã gửi ${d.sent} email giục.` +
        (d.failed ? ` ${d.failed} lỗi.` : '') +
        (d.skipped_no_email ? ` ${d.skipped_no_email} người thiếu email.` : '') +
        (d.already_reminded_today ? ` ${d.already_reminded_today} người đã được nhắc trước đó hôm nay.` : ''),
      );
    } catch {
      alert('Lỗi kết nối máy chủ');
    } finally {
      setOverdueSending(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: '0 0 40px' }}>
      {/* Page header */}
      <div style={{
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)',
        padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        position: 'sticky', top: 0, zIndex: 200,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-title)' }}>
            Quản lý Công việc
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            VICTORY HOLDINGS — Task Management System
          </p>
        </div>

        <div style={{ flex: 1 }} />

        {/* KPI toggle */}
        <button onClick={() => setShowKpi(s => !s)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          border: `1.5px solid ${showKpi ? 'var(--primary)' : 'var(--border-light)'}`,
          borderRadius: 8, cursor: 'pointer',
          background: showKpi ? 'var(--primary-light)' : 'transparent',
          color: showKpi ? 'var(--primary)' : 'var(--text-muted)',
          fontSize: 13, fontWeight: 600,
        }}>
          <BarChart2 size={15} /> KPI Dashboard
        </button>

        {/* Gửi mail giục quá hạn — Ban GĐ / Trưởng phòng / Nhóm trưởng */}
        {canNudgeOverdue && (
          <button onClick={handleOverdueMail} disabled={overdueSending} title="Gửi email nhắc nhân viên đang có việc quá hạn trong phạm vi bạn quản lý" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            border: '1.5px solid #fca5a5', borderRadius: 8,
            cursor: overdueSending ? 'wait' : 'pointer',
            background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 600,
          }}>
            {overdueSending
              ? <Loader2 size={15} className="tm-spin" />
              : <Send size={15} />}
            Gửi mail giục quá hạn
          </button>
        )}

        {/* Notifications */}
        <NotificationCenter />

        {/* Create task */}
        <button
          onClick={() => setCreateModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
            borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--primary)', color: '#fff',
            fontSize: 13, fontWeight: 700, boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
          }}
        >
          <Plus size={16} /> Tạo Task
        </button>
      </div>

      <div style={{ padding: '0 24px' }}>
        {/* KPI Dashboard (collapsible) */}
        {showKpi && (
          <div style={{ marginBottom: 20 }}>
            <KpiDashboard />
          </div>
        )}

        {/* Filters */}
        <TaskFilters />

        {/* Content — List, Kanban hoặc Calendar */}
        {filters.view === 'list' ? <TaskList />
          : filters.view === 'kanban' ? <KanbanBoard />
          : <CalendarView />}
      </div>

      {/* Task detail slide-over */}
      <TaskDetail />

      {/* Create task modal */}
      {createModalOpen && (
        <TaskForm onClose={() => setCreateModal(false)} />
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes tm-spin { to { transform: rotate(360deg); } }
        .tm-spin { animation: tm-spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
