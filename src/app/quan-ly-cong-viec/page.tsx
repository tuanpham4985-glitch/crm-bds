import { Suspense } from 'react';
import type { Metadata } from 'next';
import TaskManagementClient from './TaskManagementClient';

export const metadata: Metadata = {
  title: 'Quản lý Công việc | VICTORY HOLDINGS CRM',
};

export default function TaskManagementPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Đang tải...
      </div>
    }>
      <TaskManagementClient />
    </Suspense>
  );
}
