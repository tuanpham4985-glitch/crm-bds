'use client';

import { Component, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

const TaskManagementClient = dynamic(() => import('./TaskManagementClient'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
      Đang tải module quản lý công việc...
    </div>
  ),
});

class TaskMgmtErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40, margin: 24, borderRadius: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border-light)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ color: 'var(--text-title)', marginBottom: 8 }}>Không thể tải trang Quản lý công việc</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
            Nguyên nhân thường gặp: chưa khởi tạo Google Sheets (TM_Tasks, TM_Users...) hoặc thiếu biến môi trường.
          </p>
          <code style={{
            display: 'block', background: 'var(--bg-page)', padding: '8px 12px',
            borderRadius: 6, fontSize: 12, color: 'var(--text-muted)',
            marginBottom: 20, wordBreak: 'break-all',
          }}>
            {this.state.error}
          </code>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
              }}
            >
              Tải lại trang
            </button>
            <a
              href="/api/tm/init"
              style={{
                padding: '8px 20px', borderRadius: 8,
                border: '1.5px solid var(--border-light)', cursor: 'pointer',
                color: 'var(--text-body)', fontWeight: 600, fontSize: 14,
                textDecoration: 'none', display: 'inline-block',
              }}
            >
              Khởi tạo Sheets
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function TaskManagementPage() {
  return (
    <TaskMgmtErrorBoundary>
      <TaskManagementClient />
    </TaskMgmtErrorBoundary>
  );
}
