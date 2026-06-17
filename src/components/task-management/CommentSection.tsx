'use client';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Send, Loader2, Reply } from 'lucide-react';
import type { TmComment } from '@/lib/task-management/types';

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? []);

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

interface Props { taskId: string; }

export default function CommentSection({ taskId }: Props) {
  const { data: comments = [], isLoading } = useSWR<TmComment[]>(`/api/tm/tasks/${taskId}/comments`, fetcher);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Build thread structure: top-level + replies
  const topLevel = comments.filter(c => !c.parent_comment_id);
  const byParent  = comments.reduce((acc, c) => {
    if (c.parent_comment_id) {
      acc[c.parent_comment_id] = [...(acc[c.parent_comment_id] ?? []), c];
    }
    return acc;
  }, {} as Record<string, TmComment[]>);

  async function submit() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/tm/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), parent_comment_id: replyTo ?? undefined }),
      });
      await mutate(`/api/tm/tasks/${taskId}/comments`);
      setBody('');
      setReplyTo(null);
    } finally { setSending(false); }
  }

  function CommentBubble({ c, indent = 0 }: { c: TmComment; indent?: number }) {
    return (
      <div style={{ marginLeft: indent * 28, marginBottom: 10 }}>
        <div style={{
          background: indent ? '#f8fafc' : 'var(--bg-page)',
          border: '1px solid var(--border-lighter)',
          borderRadius: 10, padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-title)' }}>
              {c.user_id}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(c.created_at)}</span>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-body)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {c.body}
          </p>
          <button onClick={() => setReplyTo(replyTo === c.comment_id ? null : c.comment_id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: replyTo === c.comment_id ? 'var(--primary)' : 'var(--text-muted)',
            background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0,
          }}>
            <Reply size={11} /> Trả lời
          </button>
        </div>
        {(byParent[c.comment_id] ?? []).map(r => <CommentBubble key={r.comment_id} c={r} indent={1} />)}
        {replyTo === c.comment_id && (
          <div style={{ marginLeft: 28, marginTop: 6 }}>
            <CommentInput onSend={submit} body={body} setBody={setBody} sending={sending} placeholder="Viết phản hồi..." />
          </div>
        )}
      </div>
    );
  }

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
      <Loader2 size={14} className="tm-spin" /> Đang tải...
    </div>
  );

  return (
    <div>
      {topLevel.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Chưa có bình luận nào</p>
      )}
      {topLevel.map(c => <CommentBubble key={c.comment_id} c={c} />)}

      {/* New top-level comment */}
      {!replyTo && (
        <div style={{ marginTop: 8 }}>
          <CommentInput onSend={submit} body={body} setBody={setBody} sending={sending} placeholder="Viết bình luận..." />
        </div>
      )}
    </div>
  );
}

function CommentInput({ onSend, body, setBody, sending, placeholder }: {
  onSend: () => void; body: string; setBody: (v: string) => void; sending: boolean; placeholder: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSend(); }}
        placeholder={placeholder}
        rows={2}
        style={{
          flex: 1, padding: '8px 10px', borderRadius: 8,
          border: '1.5px solid var(--border-light)', fontSize: 13,
          resize: 'vertical', outline: 'none', minHeight: 58,
          fontFamily: 'inherit',
        }}
      />
      <button onClick={onSend} disabled={sending || !body.trim()} style={{
        padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
        background: 'var(--primary)', color: '#fff',
        opacity: sending || !body.trim() ? 0.5 : 1,
        display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, fontSize: 13,
      }}>
        {sending ? <Loader2 size={14} className="tm-spin" /> : <Send size={14} />}
        Gửi
      </button>
    </div>
  );
}
