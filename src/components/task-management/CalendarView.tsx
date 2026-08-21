'use client';
// ============================================================
// CRM BĐS — Task Management: Calendar To Do List
// Xem kế hoạch cả tháng trực quan; tô màu theo trạng thái công việc.
// ============================================================
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from 'lucide-react';
import { useTasks, useTmUsers } from '@/hooks/tm/useTasks';
import { useTmStore } from '@/stores/tmStore';
import type { TmTask, TaskStatus } from '@/lib/task-management/types';

// Màu theo trạng thái — Hoàn thành = xanh, Đang làm = vàng, …
const STY: Record<TaskStatus, { bg: string; fg: string; bd: string; label: string }> = {
  completed:  { bg: '#dcfce7', fg: '#166534', bd: '#86efac', label: 'Hoàn thành' },
  closed:     { bg: '#d1fae5', fg: '#065f46', bd: '#6ee7b7', label: 'Đã đóng' },
  inprogress: { bg: '#fef9c3', fg: '#854d0e', bd: '#fde047', label: 'Đang xử lý' },
  todo:       { bg: '#f1f5f9', fg: '#475569', bd: '#cbd5e1', label: 'Chờ làm' },
  waiting:    { bg: '#ffedd5', fg: '#9a3412', bd: '#fdba74', label: 'Đang chờ' },
  review:     { bg: '#f3e8ff', fg: '#6b21a8', bd: '#d8b4fe', label: 'Chờ duyệt' },
};
const OVERDUE_STY = { bg: '#fee2e2', fg: '#991b1b', bd: '#ef4444', label: 'Quá hạn' };
const styOf = (s: TaskStatus) => STY[s] ?? STY.todo;

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const isDone = (s: TaskStatus) => s === 'completed' || s === 'closed';

function displayStatus(task: TmTask): TaskStatus {
  // Một số view danh sách có thể bị cache ngắn sau khi đóng task.
  // Nếu task đã có mốc hoàn tất/đóng thì ưu tiên dùng mốc này để tô màu đúng ngay trên lịch.
  if (task.status === 'closed' || task.closed_at) return 'closed';
  if (task.status === 'completed' || task.completed_at) return 'completed';
  return task.status;
}

export default function CalendarView() {
  const { tasks, isLoading } = useTasks();
  const { userMap } = useTmUsers();
  const openSidebar = useTmStore(s => s.openSidebar);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based

  // Gom task theo ngày trong tháng đang xem (dựa vào due_date)
  const byDay = useMemo(() => {
    const map = new Map<number, TmTask[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const [y, m, d] = t.due_date.split('-').map(Number);
      if (y !== year || m !== month + 1 || !d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(t);
    }
    // Sắp xếp trong ngày: chưa xong lên trước, rồi theo tên
    for (const list of map.values()) {
      list.sort((a, b) => Number(isDone(displayStatus(a))) - Number(isDone(displayStatus(b))) || a.title.localeCompare(b.title));
    }
    return map;
  }, [tasks, year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=CN
  const todayStr = todayISO();

  // Ô lịch: chèn ô trống đầu tháng cho khớp thứ
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };
  const goToday = () => { setMonth(now.getMonth()); setYear(now.getFullYear()); };

  // Đếm nhanh trong tháng
  const monthTasks = [...byDay.values()].flat();
  const doneCnt = monthTasks.filter(t => isDone(displayStatus(t))).length;
  const progCnt = monthTasks.filter(t => displayStatus(t) === 'inprogress').length;
  const overdueCnt = monthTasks.filter(t => !isDone(displayStatus(t)) && t.due_date < todayStr).length;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 16, marginTop: 4 }}>
      {/* Header điều hướng tháng */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 16, color: 'var(--text-title)' }}>
          <CalendarDays size={18} style={{ color: 'var(--primary)' }} /> Calendar To Do List
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <button onClick={() => shiftMonth(-1)} style={navBtn} title="Tháng trước"><ChevronLeft size={16} /></button>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selStyle}>
            {MONTHS.map(m => <option key={m} value={m - 1}>Tháng {m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={selStyle}>
            {[year - 1, year, year + 1, year + 2].filter((v, i, a) => a.indexOf(v) === i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => shiftMonth(1)} style={navBtn} title="Tháng sau"><ChevronRight size={16} /></button>
          <button onClick={goToday} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontWeight: 700, fontSize: 12.5 }}>Hôm nay</button>
        </div>
      </div>

      {/* Chú thích màu + tổng hợp nhanh */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: OVERDUE_STY.bg, border: `1.5px solid ${OVERDUE_STY.bd}` }} />
          {OVERDUE_STY.label}
        </span>
        {(['inprogress', 'completed', 'closed', 'todo', 'waiting', 'review'] as TaskStatus[]).map(s => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: styOf(s).bg, border: `1.5px solid ${styOf(s).bd}` }} />
            {styOf(s).label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontWeight: 600 }}>
          Tháng {month + 1}: <b style={{ color: '#991b1b' }}>{overdueCnt}</b> quá hạn · <b style={{ color: '#166534' }}>{doneCnt}</b> hoàn thành · <b style={{ color: '#854d0e' }}>{progCnt}</b> đang xử lý · {monthTasks.length} việc
        </span>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 50, gap: 10, color: 'var(--text-muted)' }}>
          <Loader2 size={18} className="tm-spin" /> Đang tải lịch...
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
            {/* Thanh thứ trong tuần — 1 màu, chữ đen đậm */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginBottom: 6 }}>
              {WEEKDAYS.map(w => (
                <div key={w} style={{
                  textAlign: 'center', fontSize: 15, fontWeight: 800, padding: '10px 0',
                  letterSpacing: 0.4, borderRadius: 6, color: '#111827',
                  background: '#e8ecf1', border: '1px solid var(--border-light, #e2e8f0)',
                }}>
                  {w}
                </div>
              ))}
            </div>

            {/* Lưới ngày */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
              {cells.map((day, idx) => {
                if (day === null) return <div key={`b${idx}`} style={{ minHeight: 104, borderRadius: 8, background: 'var(--bg-page)' }} />;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isToday = dateStr === todayStr;
                const isSunday = idx % 7 === 0;
                const list = byDay.get(day) ?? [];
                const shown = list.slice(0, 4);
                const extra = list.length - shown.length;
                return (
                  <div key={dateStr} style={{
                    minHeight: 104, borderRadius: 8, padding: 6,
                    border: isToday ? '2px solid var(--primary)' : '1px solid var(--border-light)',
                    background: isToday ? 'var(--primary-light, #eef2ff)' : 'var(--bg-card)',
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isSunday ? '#dc2626' : 'var(--text-title)', marginBottom: 1 }}>
                      {day}
                    </div>
                    {shown.map(t => {
                      const status = displayStatus(t);
                      const st = styOf(status);
                      const overdue = !isDone(status) && t.due_date < todayStr;
                      const visual = overdue ? OVERDUE_STY : st;
                      return (
                        <button key={t.task_id} onClick={() => openSidebar(t.task_id)} title={`${t.title} — ${overdue ? OVERDUE_STY.label : st.label}${t.owner_id ? ' · ' + (userMap[t.owner_id] || '') : ''}`}
                          style={{
                            textAlign: 'left', border: `1px solid ${visual.bd}`, borderLeft: `3px solid ${visual.bd}`,
                            background: visual.bg, color: visual.fg, borderRadius: 5, padding: '2px 5px', cursor: 'pointer',
                            fontSize: 11, lineHeight: 1.25, width: '100%', overflow: 'hidden',
                          }}>
                          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                          {t.owner_id && userMap[t.owner_id] && (
                            <div style={{ fontSize: 10, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userMap[t.owner_id]}</div>
                          )}
                        </button>
                      );
                    })}
                    {extra > 0 && (
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, paddingLeft: 2 }}>+{extra} việc khác</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 32, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1.5px solid var(--border-light)', borderRadius: 8, background: 'transparent',
  cursor: 'pointer', color: 'var(--text-muted)',
};
const selStyle: React.CSSProperties = {
  height: 30, padding: '0 8px', border: '1.5px solid var(--border-light)', borderRadius: 8,
  background: 'var(--bg-card)', color: 'var(--text-title)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};
