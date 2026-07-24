'use client';
import { useEffect, useRef, useState } from 'react';
import { Search, X, Filter, LayoutList, Columns, ChevronDown, UserCheck } from 'lucide-react';
import { useTmStore } from '@/stores/tmStore';
import { useCurrentTmUser, useTmUsers } from '@/hooks/tm/useTasks';
import type { TaskStatus, TaskPriority } from '@/lib/task-management/types';

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo',       label: 'Chờ làm'    },
  { value: 'inprogress', label: 'Đang làm'   },
  { value: 'waiting',    label: 'Đang chờ'   },
  { value: 'review',     label: 'Chờ duyệt'  },
  { value: 'completed',  label: 'Hoàn thành' },
  { value: 'closed',     label: 'Đã đóng'    },
];

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: '🔴 Khẩn cấp' },
  { value: 'high',     label: '🟠 Cao'       },
  { value: 'medium',   label: '🔵 Trung bình' },
  { value: 'low',      label: '🟢 Thấp'       },
];

export default function TaskFilters() {
  const { filters, setFilter, resetFilters, setView } = useTmStore();
  const currentUser = useCurrentTmUser();
  const { users } = useTmUsers();
  const [searchInput, setSearchInput] = useState(filters.search);
  const [showMore, setShowMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMyTasks = Boolean(currentUser?.user_id && filters.participant_id === currentUser.user_id);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilter('search', searchInput), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput, setFilter]);

  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  const activeCount = [
    filters.status.length, filters.priority.length, filters.owner_id, filters.participant_id,
    filters.overdue_only, filters.department_id, filters.project_id,
  ].filter(Boolean).length;

  function toggleStatus(v: TaskStatus) {
    setFilter('status', filters.status.includes(v) ? filters.status.filter(s => s !== v) : [...filters.status, v]);
  }

  function togglePriority(v: TaskPriority) {
    setFilter('priority', filters.priority.includes(v) ? filters.priority.filter(p => p !== v) : [...filters.priority, v]);
  }

  function toggleMyTasks() {
    if (!currentUser?.user_id) return;
    if (isMyTasks) {
      setFilter('participant_id', '');
      return;
    }
    setFilter('owner_id', '');
    setFilter('participant_id', currentUser.user_id);
  }

  function changeOwnerFilter(ownerId: string) {
    if (filters.participant_id) setFilter('participant_id', '');
    setFilter('owner_id', ownerId);
  }

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border-light)', marginBottom: 16 }}>
      {/* Row 1: Search + View toggle */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Tìm theo tiêu đề, mã task, mục tiêu..."
            style={{
              width: '100%', paddingLeft: 32, paddingRight: searchInput ? 32 : 12,
              height: 36, borderRadius: 8, border: '1.5px solid var(--border-light)',
              fontSize: 13, background: 'var(--bg-page)', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', border: '1.5px solid var(--border-light)', borderRadius: 8, overflow: 'hidden' }}>
          {(['list', 'kanban'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 600,
              background: filters.view === v ? 'var(--primary)' : 'transparent',
              color: filters.view === v ? '#fff' : 'var(--text-muted)',
            }}>
              {v === 'list' ? <LayoutList size={14} /> : <Columns size={14} />}
              {v === 'list' ? 'Danh sách' : 'Kanban'}
            </button>
          ))}
        </div>

        {/* My tasks quick filter */}
        <button
          onClick={toggleMyTasks}
          disabled={!currentUser?.user_id}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
            border: `1.5px solid ${isMyTasks ? 'var(--primary)' : 'var(--border-light)'}`,
            borderRadius: 8, cursor: currentUser?.user_id ? 'pointer' : 'not-allowed',
            fontSize: 12, fontWeight: 600,
            background: isMyTasks ? 'var(--primary-light)' : 'transparent',
            color: isMyTasks ? 'var(--primary)' : 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          <UserCheck size={14} />
          Của tôi
        </button>

        {/* More filters toggle */}
        <button onClick={() => setShowMore(s => !s)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
          border: `1.5px solid ${activeCount ? 'var(--primary)' : 'var(--border-light)'}`,
          borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          background: activeCount ? 'var(--primary-light)' : 'transparent',
          color: activeCount ? 'var(--primary)' : 'var(--text-muted)',
        }}>
          <Filter size={14} />
          Bộ lọc {activeCount > 0 && `(${activeCount})`}
          <ChevronDown size={12} style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
        </button>

        {activeCount > 0 && (
          <button onClick={resetFilters} style={{
            padding: '6px 10px', border: '1.5px solid #fca5a5', borderRadius: 8,
            cursor: 'pointer', fontSize: 12, background: '#fef2f2', color: '#dc2626', fontWeight: 600,
          }}>
            <X size={13} /> Xóa lọc
          </button>
        )}
      </div>

      {/* Row 2: Quick filter chips */}
      {showMore && (
        <div style={{ paddingTop: 10, borderTop: '1px solid var(--border-lighter)' }}>
          {/* Status */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Trạng thái</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUSES.map(s => (
                <button key={s.value} onClick={() => toggleStatus(s.value)} style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1.5px solid ${filters.status.includes(s.value) ? 'var(--primary)' : 'var(--border-light)'}`,
                  background: filters.status.includes(s.value) ? 'var(--primary-light)' : 'transparent',
                  color: filters.status.includes(s.value) ? 'var(--primary)' : 'var(--text-body)',
                }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {/* Priority */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Độ ưu tiên</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRIORITIES.map(p => (
                <button key={p.value} onClick={() => togglePriority(p.value)} style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1.5px solid ${filters.priority.includes(p.value) ? 'var(--primary)' : 'var(--border-light)'}`,
                  background: filters.priority.includes(p.value) ? 'var(--primary-light)' : 'transparent',
                  color: filters.priority.includes(p.value) ? 'var(--primary)' : 'var(--text-body)',
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {/* Owner */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Người thực hiện</div>
            <select
              value={filters.owner_id}
              onChange={e => changeOwnerFilter(e.target.value)}
              style={{
                width: '100%',
                maxWidth: 360,
                height: 34,
                padding: '0 10px',
                borderRadius: 8,
                border: '1.5px solid var(--border-light)',
                background: 'var(--bg-page)',
                color: 'var(--text-body)',
                fontSize: 13,
                outline: 'none',
              }}
            >
              <option value="">Tất cả người thực hiện</option>
              {currentUser && (
                <option value={currentUser.user_id}>Của tôi — {currentUser.full_name}</option>
              )}
              {users
                .filter(u => u.user_id !== currentUser?.user_id)
                .map(u => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.full_name}{u.position ? ` (${u.position})` : ''}
                  </option>
                ))}
            </select>
          </div>
          {/* Overdue */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={filters.overdue_only} onChange={e => setFilter('overdue_only', e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer' }} />
            <span style={{ fontWeight: 600, color: '#dc2626' }}>⚠ Chỉ hiện task quá hạn</span>
          </label>
        </div>
      )}
    </div>
  );
}
