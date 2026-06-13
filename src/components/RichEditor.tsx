'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Bold, Italic, Underline, Type, Smile, RotateCcw, List, Paperclip
} from 'lucide-react';

const COLORS = [
  { label: 'Đen',         value: '#1f2937' },
  { label: 'Đỏ',          value: '#dc2626' },
  { label: 'Cam',          value: '#ea580c' },
  { label: 'Vàng đậm',   value: '#b45309' },
  { label: 'Xanh lá',    value: '#15803d' },
  { label: 'Xanh dương', value: '#1d4ed8' },
  { label: 'Tím',         value: '#7c3aed' },
  { label: 'Xám',         value: '#6b7280' },
];

const EMOJIS = ['⚡', '✅', '❗', '📌', '🔔', '⚠️', '📢', '🎯', '💼', '🏆', '👉', '🔥'];

const SIZES = [
  { label: 'Nhỏ',      value: '2' },   // execCommand fontSize uses 1-7
  { label: 'Thường',   value: '3' },
  { label: 'Lớn',      value: '5' },
  { label: 'Tiêu đề',  value: '6' },
];

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

interface Props {
  value: string;
  onChange: (html: string) => void;
  onFileDrop?: (files: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
}

export default function RichEditor({
  value,
  onChange,
  onFileDrop,
  disabled = false,
  placeholder = 'Nhập nội dung...',
  minHeight = 200,
}: Props) {
  const editorRef     = useRef<HTMLDivElement>(null);
  const onChangeRef   = useRef(onChange);
  const onDropRef     = useRef(onFileDrop);
  const initialized   = useRef(false);
  const dragCounter   = useRef(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [dragging, setDragging]   = useState(false);

  onChangeRef.current = onChange;
  onDropRef.current   = onFileDrop;

  // Set initial HTML only once on first mount
  useEffect(() => {
    if (!initialized.current && editorRef.current) {
      editorRef.current.innerHTML = value || '';
      initialized.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When disabled state changes, sync readonly value
  useEffect(() => {
    if (disabled && editorRef.current) {
      editorRef.current.innerHTML = value || '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const notify = useCallback(() => {
    onChangeRef.current(editorRef.current?.innerHTML ?? '');
  }, []);

  // ── Drag & drop handlers ──
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled || !onDropRef.current) return;
    dragCounter.current += 1;
    if ([...e.dataTransfer.items].some(i => ALLOWED_TYPES.includes(i.type))) {
      setDragging(true);
    }
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    if (disabled || !onDropRef.current) return;
    const files = [...e.dataTransfer.files].filter(f => ALLOWED_TYPES.includes(f.type));
    if (files.length > 0) onDropRef.current(files);
  };

  // ── execCommand helpers (use onMouseDown + preventDefault to keep focus) ──
  const cmd = (command: string, val?: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    editorRef.current?.focus();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand(command, false, val ?? undefined);
    notify();
  };

  const insertEmoji = (emoji: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    editorRef.current?.focus();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand('insertText', false, emoji);
    notify();
    setShowEmoji(false);
  };

  const applySize = (val: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand('fontSize', false, val);
    notify();
  };

  // ── Shared styles ──
  const iconBtn = (active = false): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    border: 'none',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: active ? '#e0e7ff' : 'transparent',
    color: active ? '#4f46e5' : 'var(--text-body, #374151)',
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0,
    transition: 'background 0.12s',
  });

  const sep: React.CSSProperties = {
    width: 1, height: 18, background: 'var(--border-light, #e2e8f0)',
    margin: '0 4px', flexShrink: 0, alignSelf: 'center',
  };

  return (
    <div style={{ position: 'relative', fontSize: 0 }}>

      {/* ── Toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          padding: '6px 10px',
          background: '#f8fafc',
          border: '1px solid var(--border-light, #e2e8f0)',
          borderBottom: 'none',
          borderRadius: '8px 8px 0 0',
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
      >
        {/* Format */}
        <button style={iconBtn()} title="Bold"       onMouseDown={cmd('bold')}>      <Bold      size={13} /></button>
        <button style={iconBtn()} title="Italic"     onMouseDown={cmd('italic')}>    <Italic    size={13} /></button>
        <button style={iconBtn()} title="Gạch chân"  onMouseDown={cmd('underline')}> <Underline size={13} /></button>

        <div style={sep} />

        {/* Bullet list */}
        <button style={iconBtn()} title="Danh sách" onMouseDown={cmd('insertUnorderedList')}>
          <List size={13} />
        </button>

        <div style={sep} />

        {/* Color palette */}
        {COLORS.map(c => (
          <button
            key={c.value}
            title={c.label}
            onMouseDown={cmd('foreColor', c.value)}
            style={{
              width: 20, height: 20, borderRadius: 4, padding: 0, border: '2px solid rgba(0,0,0,0.1)',
              background: c.value, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
            }}
          />
        ))}

        <div style={sep} />

        {/* Font size */}
        <Type size={13} style={{ color: 'var(--text-muted, #64748b)', marginRight: 2, flexShrink: 0 }} />
        <select
          title="Cỡ chữ"
          disabled={disabled}
          defaultValue=""
          onMouseDown={e => e.stopPropagation()}
          onChange={e => { if (e.target.value) { applySize(e.target.value); e.target.value = ''; } }}
          style={{
            fontSize: 12, border: '1px solid var(--border-light, #e2e8f0)',
            borderRadius: 4, padding: '2px 4px', background: '#fff',
            cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--text-body, #374151)',
          }}
        >
          <option value="" disabled>Cỡ chữ</option>
          {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <div style={sep} />

        {/* Emoji toggle */}
        <button
          style={iconBtn(showEmoji)}
          title="Chèn emoji"
          onMouseDown={e => { e.preventDefault(); setShowEmoji(v => !v); }}
        >
          <Smile size={13} />
        </button>

        {/* Clear format */}
        <button
          style={{ ...iconBtn(), marginLeft: 'auto' }}
          title="Xóa định dạng"
          onMouseDown={cmd('removeFormat')}
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* ── Editor ── */}
      <div style={{ position: 'relative' }}>
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck={false}
          data-ph={!disabled ? placeholder : undefined}
          onInput={notify}
          onBlur={notify}
          onDragEnter={onFileDrop ? onDragEnter : undefined}
          onDragOver={onFileDrop ? onDragOver : undefined}
          onDragLeave={onFileDrop ? onDragLeave : undefined}
          onDrop={onFileDrop ? onDrop : undefined}
          style={{
            minHeight,
            padding: '14px 16px',
            border: `1px solid ${dragging ? '#6366f1' : 'var(--border-light, #e2e8f0)'}`,
            borderRadius: '0 0 8px 8px',
            outline: 'none',
            fontSize: 15,
            lineHeight: 1.75,
            color: '#1f2937',
            background: disabled ? '#f9fafb' : '#fff',
            cursor: disabled ? 'default' : 'text',
            overflowY: 'auto',
            wordBreak: 'break-word',
            userSelect: disabled ? 'none' : 'text',
            WebkitUserSelect: disabled ? 'none' : 'text',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
        />

        {/* Drop overlay */}
        {dragging && (
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: '0 0 8px 8px',
            background: 'rgba(99,102,241,0.08)',
            border: '2px dashed #6366f1',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 8, pointerEvents: 'none',
          }}>
            <Paperclip size={28} color="#6366f1" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#4f46e5' }}>
              Thả file để đính kèm
            </span>
            <span style={{ fontSize: 12, color: '#818cf8' }}>
              Hỗ trợ: ảnh (JPG, PNG, GIF) và PDF
            </span>
          </div>
        )}
      </div>

      {/* ── Emoji picker (outside toolbar to avoid covering editor) ── */}
      {showEmoji && (
        <>
          {/* Backdrop to close picker on outside click */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 199 }}
            onMouseDown={e => { e.preventDefault(); setShowEmoji(false); }}
          />
          <div
            style={{
              position: 'absolute',
              top: 40,           // below toolbar
              right: 0,
              zIndex: 200,
              background: '#fff',
              border: '1px solid var(--border-light, #e2e8f0)',
              borderRadius: 10,
              padding: 10,
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 4,
              boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            }}
          >
            {EMOJIS.map(em => (
              <button
                key={em}
                onMouseDown={insertEmoji(em)}
                style={{
                  fontSize: 20, width: 36, height: 36, border: 'none',
                  borderRadius: 7, cursor: 'pointer', background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {em}
              </button>
            ))}
          </div>
        </>
      )}

      <style>{`
        [data-ph]:empty::before {
          content: attr(data-ph);
          color: #9ca3af;
          pointer-events: none;
        }
        [contenteditable] ul { padding-left: 1.5em; margin: 4px 0; }
        [contenteditable] li { list-style: disc; margin: 2px 0; cursor: text; user-select: text; }
      `}</style>
    </div>
  );
}
