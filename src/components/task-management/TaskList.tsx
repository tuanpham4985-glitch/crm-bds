'use client';
import { useTasks } from '@/hooks/tm/useTasks';
import { useTmStore } from '@/stores/tmStore';
import TaskCard from './TaskCard';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, ClipboardList } from 'lucide-react';

export default function TaskList() {
  const { tasks, total, hasMore, page, isLoading, error } = useTasks();
  const { filters, setFilter } = useTmStore();
  const limit = filters.limit;

  const totalPages = Math.ceil(total / limit);

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80, gap: 12, color: 'var(--text-muted)' }}>
      <Loader2 size={22} className="tm-spin" />
      <span style={{ fontSize: 14 }}>Đang tải danh sách công việc...</span>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 10, color: '#dc2626' }}>
      <AlertCircle size={32} />
      <span style={{ fontSize: 14 }}>Không thể tải dữ liệu. Vui lòng thử lại.</span>
    </div>
  );

  if (!tasks.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 12, color: 'var(--text-muted)' }}>
      <ClipboardList size={40} strokeWidth={1.2} />
      <span style={{ fontSize: 14, fontWeight: 600 }}>Không có công việc nào</span>
      <span style={{ fontSize: 13 }}>Thử thay đổi bộ lọc hoặc tạo công việc mới</span>
    </div>
  );

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 2px' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Hiển thị <strong>{tasks.length}</strong> / <strong>{total}</strong> công việc
        </span>
        {totalPages > 1 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Trang {page}/{totalPages}</span>
        )}
      </div>

      {/* Task cards */}
      <div>
        {tasks.map(task => (
          <TaskCard key={task.task_id} task={task} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-lighter)' }}>
          <button
            onClick={() => setFilter('page', page - 1)}
            disabled={page <= 1}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
              border: '1.5px solid var(--border-light)', borderRadius: 8,
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              opacity: page <= 1 ? 0.4 : 1,
              fontSize: 13, fontWeight: 600,
              background: 'var(--bg-card)', color: 'var(--text-body)',
            }}
          >
            <ChevronLeft size={14} /> Trước
          </button>

          {/* Page numbers */}
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = totalPages <= 7 ? i + 1 : Math.max(1, Math.min(page - 3, totalPages - 6)) + i;
            return (
              <button key={p} onClick={() => setFilter('page', p)} style={{
                width: 34, height: 34, border: '1.5px solid var(--border-light)', borderRadius: 8,
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: p === page ? 'var(--primary)' : 'var(--bg-card)',
                color: p === page ? '#fff' : 'var(--text-body)',
              }}>
                {p}
              </button>
            );
          })}

          <button
            onClick={() => setFilter('page', page + 1)}
            disabled={!hasMore}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
              border: '1.5px solid var(--border-light)', borderRadius: 8,
              cursor: !hasMore ? 'not-allowed' : 'pointer',
              opacity: !hasMore ? 0.4 : 1,
              fontSize: 13, fontWeight: 600,
              background: 'var(--bg-card)', color: 'var(--text-body)',
            }}
          >
            Sau <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
