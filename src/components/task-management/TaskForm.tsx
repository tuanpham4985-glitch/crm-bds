'use client';
import { useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { apiCreateTask } from '@/hooks/tm/useTasks';
import type { TaskPriority, TaskStatus } from '@/lib/task-management/types';

interface Props {
  onClose: () => void;
  onCreated?: (taskId: string) => void;
  initialDepartmentId?: string;
  initialProjectId?: string;
}

const FIELD: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 12px', borderRadius: 8,
  border: '1.5px solid var(--border-light)', fontSize: 14,
  background: 'var(--bg-page)', outline: 'none', boxSizing: 'border-box',
};

const LABEL: React.CSSProperties = {
  display: 'block', marginBottom: 5, fontSize: 12, fontWeight: 700,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
};

const ROW: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
};

export default function TaskForm({ onClose, onCreated, initialDepartmentId, initialProjectId }: Props) {
  const [form, setForm] = useState({
    title:         '',
    objective:     '',
    description:   '',
    priority:      'medium' as TaskPriority,
    status:        'todo'   as TaskStatus,
    due_date:      '',
    estimated_hours: '',
    department_id: initialDepartmentId ?? '',
    project_id:    initialProjectId    ?? '',
    tags:          '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Vui lòng nhập tiêu đề công việc'); return; }
    setError('');
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        title:       form.title.trim(),
        priority:    form.priority,
        status:      form.status,
      };
      if (form.objective)       body.objective = form.objective;
      if (form.description)     body.description = form.description;
      if (form.due_date)        body.due_date = form.due_date;
      if (form.estimated_hours) body.estimated_hours = Number(form.estimated_hours);
      if (form.department_id)   body.department_id = form.department_id;
      if (form.project_id)      body.project_id = form.project_id;
      if (form.tags)            body.tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);

      const created = await apiCreateTask(body);
      onCreated?.(created.task_id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Tạo task thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 600,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-lighter)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-title)' }}>Tạo công việc mới</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} style={{ overflowY: 'auto', flex: 1, padding: '18px 20px' }}>
          {error && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={LABEL}>Tiêu đề <span style={{ color: '#dc2626' }}>*</span></label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Nhập tiêu đề công việc..." style={FIELD} />
          </div>

          {/* Objective */}
          <div style={{ marginBottom: 14 }}>
            <label style={LABEL}>Mục tiêu</label>
            <input value={form.objective} onChange={e => set('objective', e.target.value)} placeholder="Mục tiêu cần đạt được..." style={FIELD} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <label style={LABEL}>Mô tả</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Chi tiết công việc..."
              rows={3}
              style={{ ...FIELD, height: 'auto', padding: '8px 12px', resize: 'vertical' }}
            />
          </div>

          {/* Priority + Status */}
          <div style={{ ...ROW, marginBottom: 14 }}>
            <div>
              <label style={LABEL}>Độ ưu tiên</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={FIELD}>
                <option value="critical">🔴 Khẩn cấp</option>
                <option value="high">🟠 Cao</option>
                <option value="medium">🔵 Trung bình</option>
                <option value="low">🟢 Thấp</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Trạng thái</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={FIELD}>
                <option value="todo">Chờ làm</option>
                <option value="inprogress">Đang làm</option>
                <option value="waiting">Đang chờ</option>
                <option value="review">Chờ duyệt</option>
              </select>
            </div>
          </div>

          {/* Due date + Estimated hours */}
          <div style={{ ...ROW, marginBottom: 14 }}>
            <div>
              <label style={LABEL}>Deadline</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={FIELD} />
            </div>
            <div>
              <label style={LABEL}>Số giờ ước tính</label>
              <input type="number" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)} placeholder="8" min={0} style={FIELD} />
            </div>
          </div>

          {/* Tags */}
          <div style={{ marginBottom: 14 }}>
            <label style={LABEL}>Tags (phân cách bởi dấu phẩy)</label>
            <input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="marketing, bds, urgent..." style={FIELD} />
          </div>
        </form>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-lighter)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{
            padding: '8px 20px', borderRadius: 8, border: '1.5px solid var(--border-light)',
            cursor: 'pointer', background: 'transparent', fontSize: 14, fontWeight: 600, color: 'var(--text-body)',
          }}>
            Hủy
          </button>
          <button onClick={submit} disabled={loading} style={{
            padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? <Loader2 size={15} className="tm-spin" /> : <Save size={15} />}
            Tạo công việc
          </button>
        </div>
      </div>
    </div>
  );
}
