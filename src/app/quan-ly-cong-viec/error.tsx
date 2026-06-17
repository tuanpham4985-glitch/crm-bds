'use client';

import { useEffect } from 'react';

export default function TaskMgmtError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[TaskManagement]', error);
  }, [error]);

  return (
    <div style={{
      padding: 40, margin: 24, borderRadius: 12,
      background: 'var(--bg-card)', border: '1px solid var(--border-light)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <h2 style={{ color: 'var(--text-title)', marginBottom: 8, fontSize: 18 }}>
        Không thể tải trang Quản lý công việc
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 12 }}>
        Nguyên nhân thường gặp: chưa khởi tạo Google Sheets (TM_Tasks, TM_Users...)
        hoặc thiếu biến môi trường <code>TM_GOOGLE_SHEET_ID</code>.
      </p>
      <code style={{
        display: 'block', background: 'var(--bg-page)', padding: '8px 12px',
        borderRadius: 6, fontSize: 12, color: 'var(--text-muted)',
        marginBottom: 20, wordBreak: 'break-all',
      }}>
        {error.message}
      </code>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={reset}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
          }}
        >
          Thử lại
        </button>
        <a
          href="/api/tm/init"
          target="_blank"
          rel="noreferrer"
          style={{
            padding: '8px 20px', borderRadius: 8, display: 'inline-block',
            border: '1.5px solid var(--border-light)', cursor: 'pointer',
            color: 'var(--text-body)', fontWeight: 600, fontSize: 14, textDecoration: 'none',
          }}
        >
          Khởi tạo Sheets
        </a>
      </div>
    </div>
  );
}
