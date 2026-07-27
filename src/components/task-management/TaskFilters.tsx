'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Filter, LayoutList, Columns, ChevronDown, UserCheck } from 'lucide-react';
import { useTmStore } from '@/stores/tmStore';
import { useCurrentTmUser, useTmDepartments, useTmProjects, useTmUsers } from '@/hooks/tm/useTasks';
import type { TaskStatus, TaskPriority } from '@/lib/task-management/types';

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo',       label: 'Chờ làm'    },
  { value: 'inprogress', label: 'Đang làm'   },
  { value: 'waiting',    label: 'Đang chờ'   },
  { value: 'review',     label: 'Chờ duyệt'  },
  { value: 'completed',  label: 'Hoàn thành' },
  { value: 'closed',     label: 'Đã đóng'    },
];

const OPEN_STATUSES: TaskStatus[] = ['todo', 'inprogress', 'waiting', 'review'];
const FEEDBACK_DESIGN_TAG = 'Feedback cho Design';

const PREDEFINED_TAGS = [
  'Gọi điện', 'Email', 'Họp', 'Báo cáo',
  'Tư vấn', 'Chăm sóc KH', 'Thu thập data',
  'Sự kiện', 'Đàm phán', 'Hợp đồng', FEEDBACK_DESIGN_TAG,
];

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: '🔴 Khẩn cấp' },
  { value: 'high',     label: '🟠 Cao'       },
  { value: 'medium',   label: '🔵 Trung bình' },
  { value: 'low',      label: '🟢 Thấp'       },
];

const SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  height: 34,
  padding: '0 10px',
  borderRadius: 8,
  border: '1.5px solid var(--border-light)',
  background: 'var(--bg-page)',
  color: 'var(--text-body)',
  fontSize: 13,
  outline: 'none',
};

function ymd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function firstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function lastDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function sameArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function activeChipStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 12px',
    border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border-light)'}`,
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    background: active ? 'var(--primary-light)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    whiteSpace: 'nowrap',
  };
}

export default function TaskFilters() {
  const { filters, setFilter, setFilters, resetFilters, setView } = useTmStore();
  const currentUser = useCurrentTmUser();
  const { users } = useTmUsers();
  const departments = useTmDepartments();
  const projects = useTmProjects();
  const [searchInput, setSearchInput] = useState(filters.search);
  const [showMore, setShowMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayKey = ymd(today);
  const weekEndKey = ymd(addDays(today, 7));
  const monthStartKey = ymd(firstDayOfMonth(today));
  const monthEndKey = ymd(lastDayOfMonth(today));

  const isMyTasks = Boolean(currentUser?.user_id && filters.participant_id === currentUser.user_id);
  const isMyDept = Boolean(currentUser?.department_id && filters.department_id === currentUser.department_id);
  const isFeedbackDesign = filters.tags.includes(FEEDBACK_DESIGN_TAG);
  const isOpenOnly = sameArray(filters.status, OPEN_STATUSES);
  const isThisWeek = filters.due_after === todayKey && filters.due_before === weekEndKey && !filters.overdue_only;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilter('search', searchInput), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput, setFilter]);

  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  const activeCount = [
    filters.search,
    filters.status.length ? 'status' : '',
    filters.priority.length ? 'priority' : '',
    filters.owner_id,
    filters.participant_id,
    filters.department_id,
    filters.requester_department_id,
    filters.project_id,
    filters.tags.length ? 'tags' : '',
    filters.overdue_only ? 'overdue' : '',
    filters.due_before || filters.due_after ? 'deadline' : '',
  ].filter(Boolean).length;

  const selectedDepartmentName = departments.find(d => d.dept_id === filters.department_id)?.name;
  const selectedOwnerName = users.find(u => u.user_id === filters.owner_id)?.full_name;
  const selectedProjectName = projects.find(p => p.project_id === filters.project_id)?.name;

  function toggleStatus(v: TaskStatus) {
    setFilter('status', filters.status.includes(v) ? filters.status.filter(s => s !== v) : [...filters.status, v]);
  }

  function togglePriority(v: TaskPriority) {
    setFilter('priority', filters.priority.includes(v) ? filters.priority.filter(p => p !== v) : [...filters.priority, v]);
  }

  function toggleTag(tag: string) {
    setFilter('tags', filters.tags.includes(tag) ? filters.tags.filter(t => t !== tag) : [...filters.tags, tag]);
  }

  function toggleMyTasks() {
    if (!currentUser?.user_id) return;
    setFilters({
      owner_id: '',
      participant_id: isMyTasks ? '' : currentUser.user_id,
    });
  }

  function toggleMyDepartment() {
    if (!currentUser?.department_id) return;
    setFilters({
      department_id: isMyDept ? '' : currentUser.department_id,
      owner_id: '',
      participant_id: '',
    });
  }

  function toggleOpenOnly() {
    setFilters({
      status: isOpenOnly ? [] : OPEN_STATUSES,
    });
  }

  function toggleOverdue() {
    setFilters({
      overdue_only: !filters.overdue_only,
      due_after: '',
      due_before: '',
    });
  }

  function toggleThisWeek() {
    setFilters({
      overdue_only: false,
      due_after: isThisWeek ? '' : todayKey,
      due_before: isThisWeek ? '' : weekEndKey,
    });
  }

  function toggleFeedbackDesign() {
    const nextTags = isFeedbackDesign
      ? filters.tags.filter(t => t !== FEEDBACK_DESIGN_TAG)
      : [...filters.tags, FEEDBACK_DESIGN_TAG];
    setFilters({ tags: nextTags });
  }

  function changeOwnerFilter(ownerId: string) {
    setFilters({
      owner_id: ownerId,
      participant_id: '',
    });
  }

  function applyDeadlinePreset(value: string) {
    if (value === 'overdue') {
      setFilters({ overdue_only: true, due_after: '', due_before: '' });
      return;
    }
    if (value === 'today') {
      setFilters({ overdue_only: false, due_after: todayKey, due_before: todayKey });
      return;
    }
    if (value === 'week') {
      setFilters({ overdue_only: false, due_after: todayKey, due_before: weekEndKey });
      return;
    }
    if (value === 'month') {
      setFilters({ overdue_only: false, due_after: monthStartKey, due_before: monthEndKey });
      return;
    }
    if (value === 'custom') {
      setFilters({ overdue_only: false });
      return;
    }
    setFilters({ overdue_only: false, due_after: '', due_before: '' });
  }

  function deadlinePreset() {
    if (filters.overdue_only) return 'overdue';
    if (filters.due_after === todayKey && filters.due_before === todayKey) return 'today';
    if (filters.due_after === todayKey && filters.due_before === weekEndKey) return 'week';
    if (filters.due_after === monthStartKey && filters.due_before === monthEndKey) return 'month';
    if (filters.due_after || filters.due_before) return 'custom';
    return '';
  }

  const quickSummary = [
    selectedDepartmentName ? `Phòng: ${selectedDepartmentName}` : '',
    selectedOwnerName ? `Người thực hiện: ${selectedOwnerName}` : '',
    selectedProjectName ? `Dự án: ${selectedProjectName}` : '',
    filters.requester_department_id ? `Phòng yêu cầu: ${departments.find(d => d.dept_id === filters.requester_department_id)?.name ?? filters.requester_department_id}` : '',
    filters.tags.length ? `Tag: ${filters.tags.join(', ')}` : '',
  ].filter(Boolean);

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border-light)', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ position: 'relative', flex: '1 1 300px', minWidth: 240 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Tìm theo tiêu đề, mã task, mục tiêu, dự án MKT, nhận xét..."
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

        <button
          onClick={() => setShowMore(s => !s)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
            border: `1.5px solid ${activeCount ? 'var(--primary)' : 'var(--border-light)'}`,
            borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
            background: activeCount ? 'var(--primary-light)' : 'transparent',
            color: activeCount ? 'var(--primary)' : 'var(--text-muted)',
          }}
        >
          <Filter size={14} />
          Bộ lọc {activeCount > 0 && `(${activeCount})`}
          <ChevronDown size={12} style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
        </button>

        {activeCount > 0 && (
          <button
            onClick={resetFilters}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 10px', border: '1.5px solid #fca5a5', borderRadius: 8,
              cursor: 'pointer', fontSize: 12, background: '#fef2f2', color: '#dc2626', fontWeight: 700,
            }}
          >
            <X size={13} /> Xóa lọc
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={toggleMyTasks} disabled={!currentUser?.user_id} style={{ ...activeChipStyle(isMyTasks), cursor: currentUser?.user_id ? 'pointer' : 'not-allowed', opacity: currentUser?.user_id ? 1 : 0.55 }}>
          <UserCheck size={14} /> Của tôi
        </button>
        <button onClick={toggleMyDepartment} disabled={!currentUser?.department_id} style={{ ...activeChipStyle(isMyDept), cursor: currentUser?.department_id ? 'pointer' : 'not-allowed', opacity: currentUser?.department_id ? 1 : 0.55 }}>
          Phòng tôi
        </button>
        <button onClick={toggleOpenOnly} style={activeChipStyle(isOpenOnly)}>
          Đang mở
        </button>
        <button onClick={toggleOverdue} style={{ ...activeChipStyle(filters.overdue_only), color: filters.overdue_only ? '#dc2626' : 'var(--text-muted)', borderColor: filters.overdue_only ? '#fca5a5' : 'var(--border-light)', background: filters.overdue_only ? '#fef2f2' : 'transparent' }}>
          ⚠ Quá hạn
        </button>
        <button onClick={toggleThisWeek} style={activeChipStyle(isThisWeek)}>
          Tuần này
        </button>
        <button onClick={toggleFeedbackDesign} style={activeChipStyle(isFeedbackDesign)}>
          Feedback Design
        </button>
      </div>

      {quickSummary.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {quickSummary.map(item => (
            <span key={item} style={{
              padding: '3px 9px',
              borderRadius: 999,
              background: '#f8fafc',
              border: '1px solid var(--border-light)',
              color: 'var(--text-muted)',
              fontSize: 11.5,
              fontWeight: 600,
            }}>
              {item}
            </span>
          ))}
        </div>
      )}

      {showMore && (
        <div style={{ paddingTop: 14, marginTop: 14, borderTop: '1px solid var(--border-lighter)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
            <FilterSelect
              label="Phòng ban thực hiện"
              value={filters.department_id}
              onChange={value => setFilter('department_id', value)}
              options={departments.map(d => ({ value: d.dept_id, label: d.name }))}
              placeholder="Tất cả phòng ban"
            />
            <FilterSelect
              label="Phòng ban yêu cầu"
              value={filters.requester_department_id}
              onChange={value => setFilter('requester_department_id', value)}
              options={departments.map(d => ({ value: d.dept_id, label: d.name }))}
              placeholder="Tất cả phòng yêu cầu"
            />
            <FilterSelect
              label="Người thực hiện"
              value={filters.owner_id}
              onChange={changeOwnerFilter}
              options={[
                ...(currentUser ? [{ value: currentUser.user_id, label: `Của tôi — ${currentUser.full_name}` }] : []),
                ...users
                  .filter(u => u.user_id !== currentUser?.user_id)
                  .map(u => ({ value: u.user_id, label: `${u.full_name}${u.position ? ` (${u.position})` : ''}` })),
              ]}
              placeholder="Tất cả người thực hiện"
            />
            <FilterSelect
              label="Dự án"
              value={filters.project_id}
              onChange={value => setFilter('project_id', value)}
              options={projects.map(p => ({ value: p.project_id, label: p.name }))}
              placeholder="Tất cả dự án"
            />
            <div>
              <FilterLabel>Deadline</FilterLabel>
              <select value={deadlinePreset()} onChange={e => applyDeadlinePreset(e.target.value)} style={SELECT_STYLE}>
                <option value="">Tất cả deadline</option>
                <option value="overdue">Quá hạn</option>
                <option value="today">Hôm nay</option>
                <option value="week">7 ngày tới</option>
                <option value="month">Tháng này</option>
                <option value="custom">Tùy chỉnh</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <FilterLabel>Từ ngày</FilterLabel>
                <input type="date" value={filters.due_after} onChange={e => setFilters({ overdue_only: false, due_after: e.target.value })} style={SELECT_STYLE} />
              </div>
              <div>
                <FilterLabel>Đến ngày</FilterLabel>
                <input type="date" value={filters.due_before} onChange={e => setFilters({ overdue_only: false, due_before: e.target.value })} style={SELECT_STYLE} />
              </div>
            </div>
          </div>

          <FilterGroup title="Trạng thái">
            {STATUSES.map(s => (
              <button key={s.value} onClick={() => toggleStatus(s.value)} style={activeChipStyle(filters.status.includes(s.value))}>
                {s.label}
              </button>
            ))}
          </FilterGroup>

          <FilterGroup title="Độ ưu tiên">
            {PRIORITIES.map(p => (
              <button key={p.value} onClick={() => togglePriority(p.value)} style={activeChipStyle(filters.priority.includes(p.value))}>
                {p.label}
              </button>
            ))}
          </FilterGroup>

          <FilterGroup title="Tags — loại công việc">
            {PREDEFINED_TAGS.map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)} style={activeChipStyle(filters.tags.includes(tag))}>
                {tag}
              </button>
            ))}
          </FilterGroup>
        </div>
      )}
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {children}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <FilterLabel>{title}</FilterLabel>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div>
      <FilterLabel>{label}</FilterLabel>
      <select value={value} onChange={e => onChange(e.target.value)} style={SELECT_STYLE}>
        <option value="">{placeholder}</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}
