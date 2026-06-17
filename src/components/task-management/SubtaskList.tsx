'use client';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Plus, Check, Loader2 } from 'lucide-react';
import type { TmSubtask } from '@/lib/task-management/types';
import { StatusBadge } from './StatusBadge';

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? []);

interface Props { taskId: string; readOnly?: boolean; }

export default function SubtaskList({ taskId, readOnly = false }: Props) {
  const { data: subtasks = [], isLoading } = useSWR<TmSubtask[]>(`/api/tm/tasks/${taskId}/subtasks`, fetcher);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  async function addSubtask() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/tm/tasks/${taskId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      await mutate(`/api/tm/tasks/${taskId}/subtasks`);
      setNewTitle('');
      setAdding(false);
    } finally { setSaving(false); }
  }

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
      <Loader2 size={14} className="tm-spin" /> Đang tải...
    </div>
  );

  return (
    <div>
      {subtasks.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Chưa có công việc con</p>
      )}

      {subtasks.map(sub => (
        <div key={sub.subtask_id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 8, marginBottom: 4,
          background: 'var(--bg-page)', border: '1px solid var(--border-lighter)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-title)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sub.title}
            </p>
            {sub.owner_id && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Giao cho: {sub.owner_id}</span>
            )}
          </div>
          <StatusBadge status={sub.status as any} size="sm" />
          {sub.progress_pct > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{sub.progress_pct}%</span>
          )}
        </div>
      ))}

      {!readOnly && (
        <div style={{ marginTop: 8 }}>
          {adding ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSubtask(); if (e.key === 'Escape') { setAdding(false); setNewTitle(''); } }}
                placeholder="Tên công việc con..."
                style={{ flex: 1, height: 34, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--primary)', fontSize: 13, outline: 'none' }}
              />
              <button onClick={addSubtask} disabled={saving || !newTitle.trim()} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600,
                opacity: saving || !newTitle.trim() ? 0.6 : 1,
              }}>
                {saving ? <Loader2 size={13} className="tm-spin" /> : <Check size={13} />}
              </button>
              <button onClick={() => { setAdding(false); setNewTitle(''); }} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border-light)', cursor: 'pointer', background: 'transparent', fontSize: 13 }}>
                Hủy
              </button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              border: '1.5px dashed var(--border-light)', borderRadius: 8,
              cursor: 'pointer', background: 'transparent',
              fontSize: 13, color: 'var(--text-muted)', width: '100%',
            }}>
              <Plus size={14} /> Thêm công việc con
            </button>
          )}
        </div>
      )}
    </div>
  );
}
