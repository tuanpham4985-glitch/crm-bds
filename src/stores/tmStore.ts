// ============================================================
// CRM BĐS — Task Management: Zustand Store
// ============================================================
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  TaskStatus, TaskPriority,
  TmNotification, CompanyKpiDashboard,
} from '@/lib/task-management/types';

// ─── FILTER STATE ─────────────────────────────────────────

export interface TaskFilterState {
  search:        string;
  status:        TaskStatus[];
  priority:      TaskPriority[];
  department_id: string;
  project_id:    string;
  owner_id:      string;
  overdue_only:  boolean;
  due_before:    string;
  due_after:     string;
  page:          number;
  limit:         number;
  view:          'list' | 'kanban';
}

const defaultFilters: TaskFilterState = {
  search:        '',
  status:        [],
  priority:      [],
  department_id: '',
  project_id:    '',
  owner_id:      '',
  overdue_only:  false,
  due_before:    '',
  due_after:     '',
  page:          1,
  limit:         50,
  view:          'list',
};

// ─── MAIN STORE ───────────────────────────────────────────

interface TmState {
  // Filters
  filters: TaskFilterState;
  setFilter: <K extends keyof TaskFilterState>(key: K, value: TaskFilterState[K]) => void;
  resetFilters: () => void;
  setView: (view: 'list' | 'kanban') => void;

  // Selected task
  selectedTaskId: string | null;
  setSelectedTask: (id: string | null) => void;

  // Task detail sidebar open
  sidebarOpen: boolean;
  openSidebar: (id: string) => void;
  closeSidebar: () => void;

  // Modal states
  createModalOpen: boolean;
  setCreateModal: (open: boolean) => void;

  rejectModalOpen: boolean;
  rejectTaskId:    string | null;
  openRejectModal: (taskId: string) => void;
  closeRejectModal: () => void;

  // Notifications
  unreadCount:    number;
  notifications:  TmNotification[];
  setNotifications: (notifs: TmNotification[]) => void;
  markRead:        (notifId: string) => void;
  markAllRead:     () => void;

  // Optimistic task updates (for kanban drag)
  optimisticStatus: Record<string, TaskStatus>; // taskId → overridden status
  setOptimisticStatus: (taskId: string, status: TaskStatus) => void;
  clearOptimisticStatus: (taskId: string) => void;

  // KPI cache
  kpiDashboard: CompanyKpiDashboard | null;
  setKpiDashboard: (d: CompanyKpiDashboard) => void;

  // Search debounce (raw input before debounce)
  searchInput: string;
  setSearchInput: (v: string) => void;
}

export const useTmStore = create<TmState>()(
  subscribeWithSelector((set, _get) => ({
    // Filters
    filters:       { ...defaultFilters },
    setFilter:     (key, value) =>
      set(s => ({ filters: { ...s.filters, [key]: value, page: key === 'page' ? value as number : 1 } })),
    resetFilters:  () => set({ filters: { ...defaultFilters } }),
    setView:       (view) => set(s => ({ filters: { ...s.filters, view } })),

    // Selected task
    selectedTaskId: null,
    setSelectedTask: (id) => set({ selectedTaskId: id }),

    // Sidebar
    sidebarOpen: false,
    openSidebar: (id) => set({ sidebarOpen: true, selectedTaskId: id }),
    closeSidebar: () => set({ sidebarOpen: false, selectedTaskId: null }),

    // Create modal
    createModalOpen: false,
    setCreateModal:  (open) => set({ createModalOpen: open }),

    // Reject modal
    rejectModalOpen: false,
    rejectTaskId:    null,
    openRejectModal: (taskId) => set({ rejectModalOpen: true, rejectTaskId: taskId }),
    closeRejectModal: () => set({ rejectModalOpen: false, rejectTaskId: null }),

    // Notifications
    unreadCount:    0,
    notifications:  [],
    setNotifications: (notifs) => set({
      notifications: notifs,
      unreadCount:   notifs.filter(n => n.status !== 'read').length,
    }),
    markRead: (notifId) => set(s => ({
      notifications: s.notifications.map(n =>
        n.notif_id === notifId ? { ...n, status: 'read' as const } : n,
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    })),
    markAllRead: () => set(s => ({
      notifications: s.notifications.map(n => ({ ...n, status: 'read' as const })),
      unreadCount: 0,
    })),

    // Optimistic status for kanban
    optimisticStatus: {},
    setOptimisticStatus: (taskId, status) =>
      set(s => ({ optimisticStatus: { ...s.optimisticStatus, [taskId]: status } })),
    clearOptimisticStatus: (taskId) =>
      set(s => {
        const next = { ...s.optimisticStatus };
        delete next[taskId];
        return { optimisticStatus: next };
      }),

    // KPI
    kpiDashboard: null,
    setKpiDashboard: (d) => set({ kpiDashboard: d }),

    // Search
    searchInput: '',
    setSearchInput: (v) => set({ searchInput: v }),
  })),
);

// ─── DERIVED SELECTORS ────────────────────────────────────

export const selectApiFilters = (state: TmState): Partial<Record<string, string>> => {
  const f = state.filters;
  const params: Record<string, string> = {};
  if (f.search)        params.search        = f.search;
  if (f.status.length) params.status        = f.status.join(',');
  if (f.priority.length) params.priority    = f.priority.join(',');
  if (f.department_id) params.department_id = f.department_id;
  if (f.project_id)    params.project_id    = f.project_id;
  if (f.owner_id)      params.owner_id      = f.owner_id;
  if (f.overdue_only)  params.overdue_only  = 'true';
  if (f.due_before)    params.due_before    = f.due_before;
  if (f.due_after)     params.due_after     = f.due_after;
  params.page  = String(f.page);
  params.limit = String(f.limit);
  return params;
};
