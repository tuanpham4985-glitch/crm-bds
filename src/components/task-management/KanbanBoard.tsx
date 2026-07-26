'use client';
import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useTasks } from '@/hooks/tm/useTasks';
import { apiUpdateTaskStatus } from '@/hooks/tm/useTasks';
import { useTmStore } from '@/stores/tmStore';
import TaskCard from './TaskCard';
import { StatusBadge } from './StatusBadge';
import { Loader2 } from 'lucide-react';
import type { TaskStatus, TmTask } from '@/lib/task-management/types';

const COLUMNS: TaskStatus[] = ['todo', 'inprogress', 'waiting', 'review', 'completed', 'closed'];
const ARCHIVE_COL_COLOR = '#ecfdf5';

const COL_WIDTHS: Record<TaskStatus, string> = {
  todo:        '220px',
  inprogress:  '220px',
  waiting:     '220px',
  review:      '220px',
  completed:   '220px',
  closed:      '220px',
};

const COL_COLORS: Record<TaskStatus, string> = {
  todo:        '#f1f5f9',
  inprogress:  '#eff6ff',
  waiting:     '#fef3c7',
  review:      '#faf5ff',
  completed:   '#f0fdf4',
  closed:      '#f8fafc',
};

const COLUMN_TASKS_MAX_HEIGHT = 'calc(100vh - 300px)';

type KanbanColumn =
  | { kind: 'status'; id: TaskStatus; status: TaskStatus; tasks: TmTask[]; title?: never }
  | { kind: 'archive'; id: string; title: string; tasks: TmTask[]; status?: never };

function monthKey(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthKey(): string {
  return monthKey(new Date().toISOString());
}

function addMonths(key: string, amount: number): string {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `Task T${Number(month)}/${year}`;
}

function followMonthLabel(key: string, currentKey: string): string {
  const [year, month] = key.split('-');
  return `T${Number(month)}/${year}${key === currentKey ? ' (hiện tại)' : ''}`;
}

function completedMonthKey(task: TmTask): string {
  return monthKey(task.completed_at || task.closed_at || task.updated_at) || currentMonthKey();
}

export default function KanbanBoard() {
  const { tasks, isLoading } = useTasks();
  const { setOptimisticStatus, clearOptimisticStatus, optimisticStatus } = useTmStore();
  const thisMonth = currentMonthKey();
  const [followMonth, setFollowMonth] = useState(thisMonth);

  function effectiveStatus(task: TmTask): TaskStatus {
    return (optimisticStatus[task.task_id] ?? task.status) as TaskStatus;
  }

  const followMonthOptions = Array.from(new Set([
    thisMonth,
    addMonths(thisMonth, 1),
    ...tasks
      .filter(t => t.status === 'completed')
      .map(t => completedMonthKey(t)),
  ])).sort((a, b) => b.localeCompare(a));

  const byStatus = COLUMNS.reduce((acc, s) => {
    acc[s] = tasks.filter(t => {
      const eff = effectiveStatus(t);
      if (s === 'completed' && eff === 'completed') {
        return Boolean(optimisticStatus[t.task_id]) || completedMonthKey(t) === followMonth;
      }
      return eff === s;
    });
    return acc;
  }, {} as Record<TaskStatus, TmTask[]>);

  const archivedCompleted = tasks
    .filter(t => effectiveStatus(t) === 'completed')
    .filter(t => !optimisticStatus[t.task_id] && completedMonthKey(t) < followMonth);

  const archivedByMonth = archivedCompleted.reduce((acc, task) => {
    const key = completedMonthKey(task);
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {} as Record<string, TmTask[]>);

  const archivedColumns: KanbanColumn[] = Object.keys(archivedByMonth)
    .sort((a, b) => b.localeCompare(a))
    .map(key => ({
      kind: 'archive',
      id: `completed-${key}`,
      title: monthLabel(key),
      tasks: archivedByMonth[key],
    }));

  const columns: KanbanColumn[] = [
    ...COLUMNS.flatMap((status): KanbanColumn[] => {
      const col: KanbanColumn = { kind: 'status', id: status, status, tasks: byStatus[status] ?? [] };
      return status === 'closed' ? [col] : [col, ...(status === 'completed' ? archivedColumns : [])];
    }),
  ];

  async function onDragEnd(result: DropResult) {
    const { draggableId, destination } = result;
    if (!destination) return;
    if (!COLUMNS.includes(destination.droppableId as TaskStatus)) return;
    const newStatus = destination.droppableId as TaskStatus;
    const task = tasks.find(t => t.task_id === draggableId);
    if (!task || task.status === newStatus) return;

    setOptimisticStatus(draggableId, newStatus);
    try {
      await apiUpdateTaskStatus(draggableId, newStatus);
    } catch {
      clearOptimisticStatus(draggableId);
    }
  }

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80, gap: 12, color: 'var(--text-muted)' }}>
      <Loader2 size={22} className="tm-spin" /> Đang tải Kanban...
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
          Tháng follow
          <select
            value={followMonth}
            onChange={e => setFollowMonth(e.target.value)}
            style={{
              height: 32,
              borderRadius: 8,
              border: '1.5px solid var(--border-light)',
              background: 'var(--bg-card)',
              color: 'var(--text-body)',
              padding: '0 10px',
              fontSize: 13,
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {followMonthOptions.map(key => (
              <option key={key} value={key}>{followMonthLabel(key, thisMonth)}</option>
            ))}
          </select>
        </label>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 12, alignItems: 'flex-start' }}>
        {columns.map(column => {
          const col = column.tasks;
          const status = column.kind === 'status' ? column.status : undefined;
          const color = status ? COL_COLORS[status] : ARCHIVE_COL_COLOR;
          return (
            <div key={column.id} style={{ width: status ? COL_WIDTHS[status] : '240px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Column header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: '8px 8px 0 0',
                background: color, border: '1px solid var(--border-light)',
                borderBottom: 'none', marginBottom: 0,
              }}>
                {status ? (
                  <StatusBadge status={status} size="sm" />
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>{column.title}</span>
                )}
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{col.length}</span>
              </div>

              {/* Drop zone */}
              <Droppable droppableId={column.id} isDropDisabled={column.kind === 'archive'}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      minHeight: 120,
                      maxHeight: COLUMN_TASKS_MAX_HEIGHT,
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      overscrollBehavior: 'contain',
                      scrollbarGutter: 'stable',
                      scrollbarWidth: 'thin',
                      padding: '6px 6px 10px',
                      background: snapshot.isDraggingOver ? '#e0e7ff' : color,
                      border: '1px solid var(--border-light)',
                      borderTop: 'none', borderRadius: '0 0 8px 8px',
                      transition: 'background 0.15s',
                    }}
                  >
                    {col.map((task, idx) => (
                      <Draggable key={task.task_id} draggableId={task.task_id} index={idx}>
                        {(prov, snap) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            style={{
                              ...prov.draggableProps.style,
                              opacity: snap.isDragging ? 0.85 : 1,
                            }}
                          >
                            <TaskCard task={{ ...task, status: effectiveStatus(task) }} compact />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {col.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '20px 10px', fontSize: 12, color: '#94a3b8' }}>
                        Kéo task vào đây
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
        </div>
      </DragDropContext>
    </>
  );
}
