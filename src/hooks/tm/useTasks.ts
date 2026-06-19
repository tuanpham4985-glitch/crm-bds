'use client';
import useSWR, { mutate } from 'swr';
import { useShallow } from 'zustand/react/shallow';
import { useTmStore, selectApiFilters } from '@/stores/tmStore';
import type { PaginatedResult, TmTask } from '@/lib/task-management/types';

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).then(d => {
    if (!d.success) throw new Error(d.error || 'Lỗi tải dữ liệu');
    return d.data;
  });

function buildUrl(params: Partial<Record<string, string>>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); });
  return `/api/tm/tasks?${sp.toString()}`;
}

export function useTasks() {
  // useShallow prevents infinite loop: selectApiFilters returns a new object every call,
  // which causes React 19's useSyncExternalStore commit-phase check to always see "changed".
  const filters = useTmStore(useShallow(selectApiFilters));
  const url = buildUrl(filters);

  const { data, error, isLoading } = useSWR<PaginatedResult<TmTask>>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval:  10_000,
  });

  return {
    tasks:    data?.data ?? [],
    total:    data?.total ?? 0,
    hasMore:  data?.has_more ?? false,
    page:     data?.page ?? 1,
    isLoading,
    error,
    revalidate: () => mutate(url),
  };
}

// ── Single task detail ────────────────────────────────────

export function useTaskDetail(taskId: string | null) {
  const { data, error, isLoading } = useSWR(
    taskId ? `/api/tm/tasks/${taskId}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 15_000 },
  );
  return {
    task:       data ?? null,
    isLoading,
    error,
    revalidate: () => mutate(`/api/tm/tasks/${taskId}`),
  };
}

// ── Overdue tasks ─────────────────────────────────────────

export function useOverdueTasks() {
  const url = '/api/tm/tasks?overdue_only=true&limit=999';
  const { data, isLoading } = useSWR<PaginatedResult<TmTask>>(url, fetcher, {
    refreshInterval: 60_000,
  });
  return { tasks: data?.data ?? [], isLoading };
}

// ── Pending approvals ─────────────────────────────────────

export function usePendingApprovals() {
  const url = '/api/tm/tasks?status=review&limit=999';
  const { data, isLoading } = useSWR<PaginatedResult<TmTask>>(url, fetcher, {
    refreshInterval: 30_000,
  });
  return { tasks: data?.data ?? [], isLoading };
}

// ── Mutation helpers ──────────────────────────────────────

export async function apiUpdateTaskStatus(taskId: string, status: string, reason?: string) {
  const res = await fetch(`/api/tm/tasks/${taskId}/status`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ status, reason }),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error);
  await mutate((key: string) => typeof key === 'string' && key.startsWith('/api/tm/tasks'), undefined, { revalidate: true });
  return d.data;
}

export async function apiApproveTask(taskId: string) {
  const res = await fetch(`/api/tm/tasks/${taskId}/approve`, { method: 'POST' });
  const d = await res.json();
  if (!d.success) throw new Error(d.error);
  await mutate((key: string) => typeof key === 'string' && key.startsWith('/api/tm/tasks'), undefined, { revalidate: true });
  return d.data;
}

export async function apiRejectTask(taskId: string, reason: string) {
  const res = await fetch(`/api/tm/tasks/${taskId}/reject`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ reason }),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error);
  await mutate((key: string) => typeof key === 'string' && key.startsWith('/api/tm/tasks'), undefined, { revalidate: true });
  return d.data;
}

export async function apiCreateTask(data: unknown) {
  const res = await fetch('/api/tm/tasks', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error);
  await mutate((key: string) => typeof key === 'string' && key.startsWith('/api/tm/tasks'), undefined, { revalidate: true });
  return d.data;
}

export async function apiUpdateTask(taskId: string, data: Record<string, unknown>) {
  const res = await fetch(`/api/tm/tasks/${taskId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error);
  await mutate((key: string) => typeof key === 'string' && key.startsWith('/api/tm/tasks'), undefined, { revalidate: true });
  return d.data;
}

export async function apiDeleteTask(taskId: string) {
  const res = await fetch(`/api/tm/tasks/${taskId}`, { method: 'DELETE' });
  const d = await res.json();
  if (!d.success) throw new Error(d.error);
  await mutate((key: string) => typeof key === 'string' && key.startsWith('/api/tm/tasks'), undefined, { revalidate: true });
  return d.data;
}

// ── Users list (for dropdowns / name resolution) ──────────

interface TmUserSummary {
  user_id: string;
  full_name: string;
  email: string;
  department_id: string;
  role: string;
  position: string;
}

export function useTmUsers() {
  const { data, isLoading } = useSWR<TmUserSummary[]>(
    '/api/tm/users',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );
  const users = data ?? [];
  const userMap: Record<string, string> = Object.fromEntries(
    users.map(u => [u.user_id, u.full_name]),
  );
  return { users, userMap, isLoading };
}

export function useCurrentTmUser() {
  const { data } = useSWR<{ user_id: string; full_name: string; email: string; role: string; department_id: string }>(
    '/api/tm/me',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 600_000 },
  );
  return data ?? null;
}

export function useTmDepartments() {
  const { data } = useSWR<{ dept_id: string; name: string; code: string }[]>(
    '/api/tm/departments',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );
  return data ?? [];
}

export function useTmProjects() {
  const { data } = useSWR<{ project_id: string; name: string; code: string }[]>(
    '/api/tm/projects',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );
  return data ?? [];
}

export async function apiToggleChecklist(checklistId: string, isDone: boolean) {
  const res = await fetch(`/api/tm/checklists/${checklistId}/toggle`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ is_done: isDone }),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error);
  return d.data;
}
