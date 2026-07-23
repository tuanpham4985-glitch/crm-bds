'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { mutate } from 'swr';
import { Plus, BarChart2, Loader2, RefreshCw } from 'lucide-react';
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

export default function TaskManagementClient() {
  const { filters, createModalOpen, setCreateModal } = useTmStore();
  const [showKpi, setShowKpi] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const currentUser = useCurrentTmUser();
  const canSync = currentUser?.role === 'director' || currentUser?.role === 'manager';

  async function handleSyncUsers() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res  = await fetch('/api/tm/sync-users', { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Đồng bộ thất bại');
      await mutate('/api/tm/users', undefined, { revalidate: true });
      await mutate('/api/tm/departments', undefined, { revalidate: true });
      alert(json.data.message);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Lỗi đồng bộ nhân viên');
    } finally {
      setSyncing(false);
    }
  }

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

        {/* Đồng bộ nhân viên NHAN_VIEN → TM_Users (Admin / Trưởng phòng) */}
        {canSync && (
          <button
            onClick={handleSyncUsers}
            disabled={syncing}
            title="Đồng bộ nhân viên mới từ sheet NHAN_VIEN sang TM_Users"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              border: '1.5px solid var(--border-light)', borderRadius: 8,
              cursor: syncing ? 'default' : 'pointer', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
              opacity: syncing ? 0.6 : 1,
            }}
          >
            <RefreshCw size={15} className={syncing ? 'tm-spin' : undefined} />
            {syncing ? 'Đang đồng bộ...' : 'Đồng bộ NV'}
          </button>
        )}

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

        {/* Content — List or Kanban */}
        {filters.view === 'list' ? <TaskList /> : <KanbanBoard />}
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
