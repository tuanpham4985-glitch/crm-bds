'use client';

import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Type, Smile, RotateCcw } from 'lucide-react';

const COLORS = [
  { label: 'Đen',        value: '#1f2937' },
  { label: 'Đỏ',         value: '#dc2626' },
  { label: 'Cam',        value: '#ea580c' },
  { label: 'Vàng đậm',  value: '#b45309' },
  { label: 'Xanh lá',   value: '#15803d' },
  { label: 'Xanh dương', value: '#1d4ed8' },
  { label: 'Tím',        value: '#7c3aed' },
  { label: 'Xám',        value: '#6b7280' },
];

const EMOJIS = ['⚡', '✅', '❗', '📌', '🔔', '⚠️', '📢', '🎯', '💼', '🏆', '👉', '🔥'];

const SIZES = [
  { label: 'Nhỏ',    value: '13px' },
  { label: 'Thường', value: '15px' },
  { label: 'Lớn',   value: '18px' },
  { label: 'Tiêu đề', value: '22px' },
];

interface Props {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
}

export default function RichEditor({
  value,
  onChange,
  disabled = false,
  placeholder = 'Nhập nội dung...',
  minHeight = 200,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [showEmoji, setShowEmoji] = useState(false);

  // Set initial HTML once on mount
  useEffect(() => {
    if (!mounted.current && editorRef.current) {
      editorRef.current.innerHTML = value || '';
      mounted.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string, val?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand(cmd, false, val ?? undefined);
    onChange(editorRef.current?.innerHTML ?? '');
  };

  const insertEmoji = (emoji: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand('insertText', false, emoji);
    onChange(editorRef.current?.innerHTML ?? '');
    setShowEmoji(false);
  };

  const applyFontSize = (size: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement('span');
    span.style.fontSize = size;
    range.surroundContents(span);
    sel.removeAllRanges();
    onChange(editorRef.current?.innerHTML ?? '');
  };

  const btnStyle = (active = false): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: active ? 'var(--primary-light, #e0e7ff)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-body)',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 0.15s',
  });

  const sepStyle: React.CSSProperties = {
    width: 1,
    height: 20,
    background: 'var(--border-light)',
    margin: '0 4px',
    flexShrink: 0,
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
        padding: '6px 10px',
        background: '#f8fafc',
        border: '1px solid var(--border-light)',
        borderBottom: 'none',
        borderRadius: '8px 8px 0 0',
        userSelect: 'none',
      }}>
        {/* Format */}
        <button style={btnStyle()} title="Bold (Ctrl+B)" onMouseDown={e => { e.preventDefault(); exec('bold'); }}>
          <Bold size={13} />
        </button>
        <button style={btnStyle()} title="Italic (Ctrl+I)" onMouseDown={e => { e.preventDefault(); exec('italic'); }}>
          <Italic size={13} />
        </button>
        <button style={btnStyle()} title="Gạch chân (Ctrl+U)" onMouseDown={e => { e.preventDefault(); exec('underline'); }}>
          <Underline size={13} />
        </button>

        <div style={sepStyle} />

        {/* Colors */}
        {COLORS.map(c => (
          <button
            key={c.value}
            title={c.label}
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              border: '2px solid rgba(0,0,0,0.1)',
              background: c.value,
              cursor: disabled ? 'not-allowed' : 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
            onMouseDown={e => { e.preventDefault(); exec('foreColor', c.value); }}
          />
        ))}

        <div style={sepStyle} />

        {/* Font size */}
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <Type size={13} style={{ color: 'var(--text-muted)', marginRight: 2 }} />
          <select
            title="Cỡ chữ"
            disabled={disabled}
            style={{
              fontSize: 12,
              border: '1px solid var(--border-light)',
              borderRadius: 4,
              padding: '1px 4px',
              background: '#fff',
              cursor: disabled ? 'not-allowed' : 'pointer',
              color: 'var(--text-body)',
            }}
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                applyFontSize(e.target.value);
                e.target.value = '';
              }
            }}
          >
            <option value="" disabled>Cỡ chữ</option>
            {SIZES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div style={sepStyle} />

        {/* Emoji */}
        <div style={{ position: 'relative' }}>
          <button
            style={btnStyle(showEmoji)}
            title="Chèn emoji"
            onMouseDown={e => { e.preventDefault(); setShowEmoji(v => !v); }}
          >
            <Smile size={13} />
          </button>
          {showEmoji && (
            <div style={{
              position: 'absolute',
              top: '110%',
              left: 0,
              zIndex: 100,
              background: '#fff',
              border: '1px solid var(--border-light)',
              borderRadius: 8,
              padding: '8px',
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}>
              {EMOJIS.map(em => (
                <button
                  key={em}
                  onMouseDown={e => { e.preventDefault(); insertEmoji(em); }}
                  style={{
                    fontSize: 20,
                    width: 34,
                    height: 34,
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear formatting */}
        <button
          style={{ ...btnStyle(), marginLeft: 'auto' }}
          title="Xóa định dạng"
          onMouseDown={e => { e.preventDefault(); exec('removeFormat'); }}
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* ── Editable area ── */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => onChange(editorRef.current?.innerHTML ?? '')}
        onBlur={() => onChange(editorRef.current?.innerHTML ?? '')}
        style={{
          minHeight,
          padding: '14px 16px',
          border: '1px solid var(--border-light)',
          borderRadius: '0 0 8px 8px',
          outline: 'none',
          fontSize: 15,
          lineHeight: 1.75,
          color: 'var(--text-body)',
          background: disabled ? '#f9fafb' : '#fff',
          cursor: disabled ? 'not-allowed' : 'text',
          overflowY: 'auto',
          wordBreak: 'break-word',
        }}
      />

      {/* Placeholder via CSS — only when empty */}
      <style>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
