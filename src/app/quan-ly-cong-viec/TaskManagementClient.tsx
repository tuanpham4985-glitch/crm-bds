'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, BarChart2, Loader2 } from 'lucide-react';
import { useTmStore } from '@/stores/tmStore';
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
