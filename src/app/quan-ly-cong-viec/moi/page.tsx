'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import TaskForm from '@/components/task-management/TaskForm';

export default function NewTaskPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: '0 0 40px' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.back()} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
          border: '1.5px solid var(--border-light)', borderRadius: 8,
          cursor: 'pointer', background: 'transparent', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
        }}>
          <ArrowLeft size={14} /> Quay lại
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-title)' }}>Tạo công việc mới</h1>
      </div>

      {/*
        Dùng CHUNG TaskForm với nút "Tạo Task" ở trang danh sách.
        Trước đây trang này có một bản sao rút gọn riêng, thiếu người thực hiện /
        phòng ban / dự án / phê duyệt và mỗi lần nâng cấp form là lại lệch nhau.
      */}
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-light)', padding: 24 }}>
          <TaskForm
            variant="inline"
            onCreated={(id) => router.push(`/quan-ly-cong-viec/${id}`)}
            onClose={() => router.back()}
          />
        </div>
      </div>

      <style>{`
        @keyframes tm-spin { to { transform: rotate(360deg); } }
        .tm-spin { animation: tm-spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
