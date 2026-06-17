import type { Metadata } from 'next';
import TaskDetailPage from './TaskDetailPage';

export const metadata: Metadata = {
  title: 'Chi tiết Công việc | VICTORY HOLDINGS CRM',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskDetailPage taskId={id} />;
}
