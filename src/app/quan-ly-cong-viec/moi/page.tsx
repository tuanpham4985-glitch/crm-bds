'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import TaskForm from '@/components/task-management/TaskForm';

export default function NewTaskPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: '0 0 40px' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.back()} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
          border: '1.5px solid var(--border-light)', borderRadius: 8,
          cursor: 'pointer', background: 'transparent', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
        }}>
          <ArrowLeft size={14} /> Quay lại
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-title)' }}>Tạo công việc mới</h1>
      </div>

      {/* Render form in inline mode by wrapping in a card */}
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-light)', padding: 24 }}>
          <TaskFormInline onCreated={(id) => router.push(`/quan-ly-cong-viec/${id}`)} onCancel={() => router.back()} />
        </div>
      </div>

      <style>{`
        @keyframes tm-spin { to { transform: rotate(360deg); } }
        .tm-spin { animation: tm-spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}

// Inline form variant (no modal overlay)
import { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { apiCreateTask } from '@/hooks/tm/useTasks';
import type { TaskPriority, TaskStatus } from '@/lib/task-management/types';

function TaskFormInline({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: '', objective: '', description: '',
    priority: 'medium' as TaskPriority, status: 'todo' as TaskStatus,
    due_date: '', estimated_hours: '', tags: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Vui lòng nhập tiêu đề'); return; }
    setError(''); setLoading(true);
    try {
      const body: Record<string, unknown> = { title: form.title.trim(), priority: form.priority, status: form.status };
      if (form.objective)       body.objective = form.objective;
      if (form.description)     body.description = form.description;
      if (form.due_date)        body.due_date = form.due_date;
      if (form.estimated_hours) body.estimated_hours = Number(form.estimated_hours);
      if (form.tags)            body.tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
      const created = await apiCreateTask(body);
      onCreated(created.task_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Tạo task thất bại');
    } finally { setLoading(false); }
  }

  const F: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1.5px solid var(--border-light)', fontSize: 14, background: 'var(--bg-page)', outline: 'none', boxSizing: 'border-box' };
  const L: React.CSSProperties = { display: 'block', marginBottom: 5, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{error}</div>}
      <div><label style={L}>Tiêu đề *</label><input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Tiêu đề công việc..." style={F} /></div>
      <div><label style={L}>Mục tiêu</label><input value={form.objective} onChange={e => set('objective', e.target.value)} placeholder="Mục tiêu cần đạt..." style={F} /></div>
      <div><label style={L}>Mô tả</label><textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Chi tiết..." style={{ ...F, height: 'auto', padding: '8px 12px', resize: 'vertical' }} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={L}>Độ ưu tiên</label><select value={form.priority} onChange={e => set('priority', e.target.value)} style={F}><option value="critical">🔴 Khẩn cấp</option><option value="high">🟠 Cao</option><option value="medium">🔵 Trung bình</option><option value="low">🟢 Thấp</option></select></div>
        <div><label style={L}>Deadline</label><input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={F} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={L}>Số giờ ước tính</label><input type="number" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)} placeholder="8" min={0} style={F} /></div>
        <div><label style={L}>Tags (dấu phẩy)</label><input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="tag1, tag2..." style={F} /></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid var(--border-light)', cursor: 'pointer', background: 'transparent', fontSize: 14, fontWeight: 600 }}>Hủy</button>
        <button type="submit" disabled={loading} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.7 : 1 }}>
          {loading ? <Loader2 size={15} className="tm-spin" /> : <Save size={15} />} Tạo công việc
        </button>
      </div>
    </form>
  );
}
