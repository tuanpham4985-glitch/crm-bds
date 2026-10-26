'use client';

// Sổ tay nhân viên — mọi nhân viên đọc được; Admin và Phòng HCNS được sửa,
// thêm, xoá mục (quyền kiểm tra lại ở server, /api/so-tay-nhan-vien).
// Nội dung là văn bản thuần, hỗ trợ định dạng nhẹ:
//   "## Tiêu đề"  -> tiêu đề nhỏ
//   "- nội dung"  -> gạch đầu dòng
//   dòng trống     -> tách đoạn
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import {
  BookOpen, Building2, ScrollText, HeartHandshake, Workflow, Phone, FileText,
  Pencil, Plus, Trash2, X, ArrowLeft, Save,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { HANDBOOK_LIMITS, type HandbookSection } from '@/lib/employee-handbook';

const ICONS: Record<string, LucideIcon> = {
  'gioi-thieu': Building2,
  'noi-quy': ScrollText,
  'phuc-loi': HeartHandshake,
  'quy-trinh': Workflow,
  'lien-he': Phone,
};

interface HandbookResponse {
  success: boolean;
  error?: string;
  data?: { sections: HandbookSection[]; canEdit: boolean; degraded?: boolean };
}

const fetcher = (url: string) => fetch(url).then(res => res.json() as Promise<HandbookResponse>);

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Năm đủ 4 chữ số (dd/MM/yyyy HH:mm) — dateStyle 'short' của vi-VN ra năm 2
  // chữ số (26/10/26), dễ nhầm ngày với năm.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderContent(text: string): ReactNode {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let para: string[] = [];
  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(<ul key={`ul-${blocks.length}`} style={{ margin: '0 0 12px', paddingLeft: 22 }}>{bullets.map((b, i) => <li key={i} style={{ marginBottom: 4 }}>{b}</li>)}</ul>);
    bullets = [];
  };
  const flushPara = () => {
    if (!para.length) return;
    blocks.push(<p key={`p-${blocks.length}`} style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{para.join('\n')}</p>);
    para = [];
  };
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      flushBullets(); flushPara();
      blocks.push(<h4 key={`h-${blocks.length}`} style={{ margin: '16px 0 8px', color: 'var(--text-title)', fontSize: 16 }}>{trimmed.slice(3)}</h4>);
    } else if (/^[-*] /.test(trimmed)) {
      flushPara();
      bullets.push(trimmed.slice(2));
    } else if (!trimmed) {
      flushBullets(); flushPara();
    } else {
      flushBullets();
      para.push(line);
    }
  }
  flushBullets(); flushPara();
  return blocks;
}

type EditorState = { mode: 'edit' | 'create'; key?: string; title: string; description: string; content: string };

export default function SoTayNhanVienPage() {
  const { data, isLoading, mutate } = useSWR('/api/so-tay-nhan-vien', fetcher, { revalidateOnFocus: false });
  const sections = data?.data?.sections ?? [];
  const canEdit = Boolean(data?.data?.canEdit);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = sections.find(s => s.key === selectedKey) ?? null;

  function openEdit(section: HandbookSection) {
    setError('');
    setEditor({ mode: 'edit', key: section.key, title: section.title, description: section.description, content: section.content });
  }
  function openCreate() {
    setError('');
    setEditor({ mode: 'create', title: '', description: '', content: '' });
  }

  async function save() {
    if (!editor) return;
    if (!editor.title.trim()) { setError('Vui lòng nhập tiêu đề'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/so-tay-nhan-vien', {
        method: editor.mode === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: editor.key, title: editor.title, description: editor.description, content: editor.content }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Không thể lưu'); return; }
      await mutate();
      if (editor.mode === 'create' && json.data?.key) setSelectedKey(json.data.key);
      setEditor(null);
    } catch {
      setError('Lỗi kết nối, vui lòng thử lại');
    } finally {
      setSaving(false);
    }
  }

  async function remove(section: HandbookSection) {
    if (!window.confirm(`Xoá mục "${section.title}"? Nội dung của mục sẽ bị xoá.`)) return;
    const res = await fetch(`/api/so-tay-nhan-vien?key=${encodeURIComponent(section.key)}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({ success: false }));
    if (!json.success) { window.alert(json.error || 'Không thể xoá mục'); return; }
    setSelectedKey(null);
    await mutate();
  }

  if (isLoading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={26} /> Sổ tay nhân viên
          </h1>
          <p>Thông tin, quy định và quy trình dành cho nhân viên Victory Holdings</p>
        </div>
        {canEdit && !selected && (
          <div>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Thêm mục</button>
          </div>
        )}
      </div>

      {data?.data?.degraded && (
        <div className="card" style={{ marginBottom: 16, background: 'var(--warning-bg)', color: 'var(--warning-text)', borderColor: 'var(--warning-border)' }}>
          Không tải được nội dung đã lưu, đang hiển thị khung mặc định. Vui lòng tải lại trang sau ít phút.
        </div>
      )}

      {selected ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedKey(null)}><ArrowLeft size={16} /> Tất cả mục</button>
            {canEdit && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(selected)}><Pencil size={14} /> Chỉnh sửa</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(selected)}><Trash2 size={14} /> Xoá</button>
              </div>
            )}
          </div>
          <h2 style={{ margin: '0 0 6px', color: 'var(--text-title)' }}>{selected.title}</h2>
          {selected.description && <p className="card-subtitle" style={{ marginTop: 0 }}>{selected.description}</p>}
          {selected.updated_at && (
            <p style={{ fontSize: 12, color: 'var(--text-label)', margin: '0 0 16px' }}>
              Cập nhật {formatDate(selected.updated_at)}{selected.updated_by ? ` · ${selected.updated_by}` : ''}
            </p>
          )}
          <div style={{ color: 'var(--text-body)', lineHeight: 1.65, fontSize: 15 }}>
            {selected.content.trim()
              ? renderContent(selected.content)
              : <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Nội dung đang được cập nhật.</p>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {sections.map(section => {
            const Icon = ICONS[section.key] ?? FileText;
            const hasContent = Boolean(section.content.trim());
            return (
              <div key={section.key} className="card card-interactive" style={{ cursor: 'pointer', position: 'relative' }}
                onClick={() => setSelectedKey(section.key)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, paddingRight: canEdit ? 32 : 0 }}>
                  <Icon size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <h3 className="card-title" style={{ margin: 0 }}>{section.title}</h3>
                </div>
                {canEdit && (
                  <button className="btn btn-ghost btn-icon" title="Chỉnh sửa" aria-label={`Chỉnh sửa ${section.title}`}
                    style={{ position: 'absolute', top: 14, right: 14 }}
                    onClick={(e) => { e.stopPropagation(); openEdit(section); }}>
                    <Pencil size={15} />
                  </button>
                )}
                <p className="card-subtitle" style={{ margin: 0 }}>{section.description}</p>
                <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: hasContent ? 'var(--primary-text)' : 'var(--text-muted)', fontStyle: hasContent ? 'normal' : 'italic' }}>
                  {hasContent ? 'Xem chi tiết →' : 'Nội dung đang được cập nhật.'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {editor && (
        <div className="modal-overlay" onClick={() => !saving && setEditor(null)}>
          <div className="modal-content" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editor.mode === 'edit' ? 'Chỉnh sửa mục' : 'Thêm mục mới'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditor(null)} disabled={saving}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tiêu đề *</label>
                <input className="form-input" value={editor.title} maxLength={HANDBOOK_LIMITS.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })} placeholder="VD: Nội quy & quy định" />
              </div>
              <div className="form-group">
                <label className="form-label">Mô tả ngắn (hiện trên thẻ)</label>
                <input className="form-input" value={editor.description} maxLength={HANDBOOK_LIMITS.description}
                  onChange={(e) => setEditor({ ...editor, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Nội dung</label>
                <textarea className="form-textarea" rows={16} value={editor.content} maxLength={HANDBOOK_LIMITS.content}
                  onChange={(e) => setEditor({ ...editor, content: e.target.value })}
                  style={{ fontFamily: 'inherit', lineHeight: 1.6, minHeight: 320 }}
                  placeholder={'## Giờ làm việc\n- Thứ 2 đến thứ 7: 8h30 - 17h30\n- Nghỉ trưa: 12h00 - 13h30\n\nĐoạn văn bình thường...'} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-label)', marginTop: 6, gap: 12 }}>
                  <span>Mẹo: dòng bắt đầu bằng &quot;## &quot; là tiêu đề nhỏ, &quot;- &quot; là gạch đầu dòng, dòng trống để tách đoạn.</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{editor.content.length.toLocaleString('vi-VN')}/{HANDBOOK_LIMITS.content.toLocaleString('vi-VN')}</span>
                </div>
              </div>
              {error && <p style={{ color: 'var(--danger-text)', margin: 0 }}>{error}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditor(null)} disabled={saving}>Huỷ</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}><Save size={16} /> {saving ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
