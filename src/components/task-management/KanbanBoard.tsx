'use client';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useTasks } from '@/hooks/tm/useTasks';
import { apiUpdateTaskStatus } from '@/hooks/tm/useTasks';
import { useTmStore } from '@/stores/tmStore';
import TaskCard from './TaskCard';
import { StatusBadge, statusLabel } from './StatusBadge';
import { Loader2 } from 'lucide-react';
import type { TaskStatus, TmTask } from '@/lib/task-management/types';

const COLUMNS: TaskStatus[] = ['todo', 'inprogress', 'waiting', 'review', 'completed'];

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

export default function KanbanBoard() {
  const { tasks, isLoading } = useTasks();
  const { setOptimisticStatus, clearOptimisticStatus, optimisticStatus } = useTmStore();

  const byStatus = COLUMNS.reduce((acc, s) => {
    acc[s] = tasks.filter(t => {
      const eff = optimisticStatus[t.task_id] ?? t.status;
      return eff === s;
    });
    return acc;
  }, {} as Record<TaskStatus, TmTask[]>);

  async function onDragEnd(result: DropResult) {
    const { draggableId, destination } = result;
    if (!destination) return;
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
    <DragDropContext onDragEnd={onDragEnd}>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12 }}>
        {COLUMNS.map(status => {
          const col = byStatus[status] ?? [];
          return (
            <div key={status} style={{ width: COL_WIDTHS[status], flexShrink: 0 }}>
              {/* Column header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: '8px 8px 0 0',
                background: COL_COLORS[status], border: '1px solid var(--border-light)',
                borderBottom: 'none', marginBottom: 0,
              }}>
                <StatusBadge status={status} size="sm" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{col.length}</span>
              </div>

              {/* Drop zone */}
              <Droppable droppableId={status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      minHeight: 120, padding: '6px 6px 6px',
                      background: snapshot.isDraggingOver ? '#e0e7ff' : COL_COLORS[status],
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
                            <TaskCard task={{ ...task, status: (optimisticStatus[task.task_id] ?? task.status) as TaskStatus }} compact />
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
  );
}
