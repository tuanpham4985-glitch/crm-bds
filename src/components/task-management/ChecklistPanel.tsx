'use client';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Plus, Check, Loader2, GripVertical } from 'lucide-react';
import { apiToggleChecklist } from '@/hooks/tm/useTasks';
import type { TmChecklist } from '@/lib/task-management/types';

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? []);

interface Props { taskId: string; readOnly?: boolean; }

export default function ChecklistPanel({ taskId, readOnly = false }: Props) {
  const { data: items = [], isLoading } = useSWR<TmChecklist[]>(`/api/tm/tasks/${taskId}/checklists`, fetcher);
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);

  const done = items.filter(i => i.is_done).length;
  const pct  = items.length ? Math.round((done / items.length) * 100) : 0;

  async function handleToggle(item: TmChecklist) {
    if (readOnly || pendingToggles.has(item.checklist_id)) return;
    setPendingToggles(s => new Set(s).add(item.checklist_id));
    try {
      await apiToggleChecklist(item.checklist_id, !item.is_done);
      await mutate(`/api/tm/tasks/${taskId}/checklists`);
    } finally {
      setPendingToggles(s => { const n = new Set(s); n.delete(item.checklist_id); return n; });
    }
  }

  async function addItem() {
    if (!newItem.trim()) return;
    setSaving(true);
    try {
      const existing = items.length;
      await fetch(`/api/tm/tasks/${taskId}/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ title: newItem.trim(), sort_order: existing + 1 }] }),
      });
      await mutate(`/api/tm/tasks/${taskId}/checklists`);
      setNewItem('');
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
      {/* Progress */}
      {items.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{done}/{items.length} hoàn thành</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? '#16a34a' : 'var(--text-muted)' }}>{pct}%</span>
          </div>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16a34a' : 'var(--primary)', borderRadius: 10, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* Items */}
      {items.map(item => (
        <div
          key={item.checklist_id}
          onClick={() => handleToggle(item)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 8px', borderRadius: 8, marginBottom: 3,
            cursor: readOnly ? 'default' : 'pointer',
            background: item.is_done ? '#f0fdf4' : 'transparent',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (!readOnly) (e.currentTarget as HTMLDivElement).style.background = item.is_done ? '#dcfce7' : 'var(--bg-page)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = item.is_done ? '#f0fdf4' : 'transparent'; }}
        >
          {!readOnly && <GripVertical size={12} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />}
          {/* Checkbox */}
          <div style={{
            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
            border: `2px solid ${item.is_done ? '#16a34a' : 'var(--border-light)'}`,
            background: item.is_done ? '#16a34a' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}>
            {pendingToggles.has(item.checklist_id) ? (
              <Loader2 size={10} className="tm-spin" style={{ color: '#fff' }} />
            ) : item.is_done ? (
              <Check size={11} color="#fff" />
            ) : null}
          </div>
          <span style={{
            flex: 1, fontSize: 13, color: item.is_done ? '#64748b' : 'var(--text-body)',
            textDecoration: item.is_done ? 'line-through' : 'none',
          }}>
            {item.title}
          </span>
        </div>
      ))}

      {/* Add item */}
      {!readOnly && (
        <div style={{ marginTop: 8 }}>
          {adding ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addItem(); if (e.key === 'Escape') { setAdding(false); setNewItem(''); } }}
                placeholder="Thêm mục checklist..."
                style={{ flex: 1, height: 34, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--primary)', fontSize: 13, outline: 'none' }}
              />
              <button onClick={addItem} disabled={saving || !newItem.trim()} style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'var(--primary)', color: '#fff', fontSize: 13,
                opacity: saving || !newItem.trim() ? 0.6 : 1,
              }}>
                {saving ? <Loader2 size={13} className="tm-spin" /> : <Check size={13} />}
              </button>
              <button onClick={() => { setAdding(false); setNewItem(''); }} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border-light)', cursor: 'pointer', background: 'transparent', fontSize: 13 }}>
                Hủy
              </button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              border: '1.5px dashed var(--border-light)', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', fontSize: 13, color: 'var(--text-muted)', width: '100%',
            }}>
              <Plus size={14} /> Thêm mục
            </button>
          )}
        </div>
      )}
    </div>
  );
}
