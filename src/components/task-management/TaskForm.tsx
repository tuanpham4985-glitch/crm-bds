'use client';
import { useState, useEffect } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { apiCreateTask, useTmUsers, useTmDepartments, useTmProjects, useCurrentTmUser } from '@/hooks/tm/useTasks';
import type { TaskPriority, TaskStatus } from '@/lib/task-management/types';

interface Props {
  onClose: () => void;
  onCreated?: (taskId: string) => void;
  initialDepartmentId?: string;
  initialProjectId?: string;
  /**
   * 'modal'  — lớp phủ toàn màn hình (mặc định, dùng cho nút "Tạo Task").
   * 'inline' — nhúng thẳng vào trang, không lớp phủ và không thanh tiêu đề riêng
   *            (dùng cho trang /quan-ly-cong-viec/moi).
   */
  variant?: 'modal' | 'inline';
}

const PREDEFINED_TAGS = [
  'Gọi điện', 'Email', 'Họp', 'Báo cáo',
  'Tư vấn', 'Chăm sóc KH', 'Thu thập data',
  'Sự kiện', 'Đàm phán', 'Hợp đồng',
];

const FIELD: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 12px', borderRadius: 8,
  border: '1.5px solid var(--border-light)', fontSize: 13,
  background: 'var(--bg-page)', outline: 'none', boxSizing: 'border-box',
  color: 'var(--text-body)',
};

const LABEL: React.CSSProperties = {
  display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
};

const ROW2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

function CustomTagInput({ onAdd }: { onAdd: (tag: string) => void }) {
  const [value, setValue] = useState('');
  function add() {
    const tag = value.trim();
    if (!tag) return;
    onAdd(tag);
    setValue('');
  }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        placeholder="Nhập tag tùy chỉnh..."
        style={{
          flex: 1, height: 32, padding: '0 10px', borderRadius: 8, fontSize: 12,
          border: '1.5px solid var(--border-light)', background: 'var(--bg-page)',
          color: 'var(--text-body)', outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={add}
        style={{
          padding: '0 14px', height: 32, borderRadius: 8, fontSize: 12, fontWeight: 700,
          border: '1.5px solid var(--primary)', background: 'transparent',
          color: 'var(--primary)', cursor: 'pointer',
        }}
      >+ Thêm</button>
    </div>
  );
}

export default function TaskForm({ onClose, onCreated, initialDepartmentId, initialProjectId, variant = 'modal' }: Props) {
  const inline = variant === 'inline';
  const [form, setForm] = useState({
    title:                   '',
    objective:               '',
    description:             '',
    priority:                'medium'  as TaskPriority,
    status:                  'todo'    as TaskStatus,
    due_date:                '',
    department_id:           initialDepartmentId ?? '',
    requester_department_id: '',
    project_id:              initialProjectId    ?? '',
    approval_level:          '0',
    email_reminder:          false,
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // Người thực hiện — nhiều người. Phần tử [0] là người CHỊU TRÁCH NHIỆM CHÍNH (owner_id),
  // các phần tử còn lại được lưu thành collaborators.
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const { users }    = useTmUsers();
  const departments  = useTmDepartments();
  const projects     = useTmProjects();
  const currentUser  = useCurrentTmUser();
  const userRole     = currentUser?.role ?? 'staff';

  // Pre-fill department từ người tạo khi currentUser load xong
  useEffect(() => {
    if (!currentUser?.department_id) return;
    setForm(f => f.department_id ? f : { ...f, department_id: currentUser.department_id });
  }, [currentUser?.department_id]);

  // Approval levels a user can set = levels they themselves can approve
  const approvalOptions = [
    { value: '0', label: 'Không cần phê duyệt' },
    { value: '1', label: 'TP / Team Lead duyệt' },
    { value: '2', label: 'GĐ bộ phận duyệt' },
    { value: '3', label: 'Ban giám đốc / CEO duyệt' },
  ].filter(opt => {
    if (opt.value === '0') return true;
    if (opt.value === '1') return ['team_leader', 'manager', 'director'].includes(userRole);
    if (opt.value === '2') return ['manager', 'director'].includes(userRole);
    if (opt.value === '3') return userRole === 'director';
    return false;
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function toggleAssignee(userId: string) {
    setAssigneeIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId],
    );
  }

  /** Đưa một người đã chọn lên làm người chịu trách nhiệm chính */
  function makeMainAssignee(userId: string) {
    setAssigneeIds(prev => [userId, ...prev.filter(id => id !== userId)]);
  }

  const deptUsers = users.filter(u => !form.department_id || u.department_id === form.department_id);
  const userById  = new Map(users.map(u => [u.user_id, u]));

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Vui lòng nhập tiêu đề công việc'); return; }
    setError('');
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        title:    form.title.trim(),
        priority: form.priority,
        status:   form.status,
      };
      if (form.objective)                body.objective                = form.objective;
      if (form.description)              body.description              = form.description;
      if (form.due_date)                 body.due_date                 = form.due_date;
      // Người đầu tiên chịu trách nhiệm chính, những người còn lại là cùng thực hiện
      if (assigneeIds.length) {
        body.owner_id = assigneeIds[0];
        if (assigneeIds.length > 1) {
          body.collaborators = assigneeIds.slice(1).map(id => ({ user_id: id, role: 'contributor' }));
        }
      }
      if (form.department_id)            body.department_id            = form.department_id;
      if (form.requester_department_id)  body.requester_department_id  = form.requester_department_id;
      if (form.project_id)               body.project_id               = form.project_id;
      if (selectedTags.length) body.tags           = selectedTags;
      if (form.email_reminder) body.email_reminder = true;
      const lvl = Number(form.approval_level);
      body.approval_level  = lvl;
      body.approval_status = lvl > 0 ? 'pending' : 'not_required';

      const created = await apiCreateTask(body);
      onCreated?.(created.task_id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Tạo task thất bại');
    } finally {
      setLoading(false);
    }
  }

  const body = (
    <>
        {/* Header — trang /moi đã có tiêu đề riêng nên bỏ qua ở chế độ inline */}
        {!inline && (
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-lighter)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-title)' }}>Tạo công việc mới</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
          </div>
        )}

        {/* Form — scrollable */}
        <form onSubmit={submit} style={inline ? { padding: 0 } : { overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
          {error && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Tiêu đề */}
          <div style={{ marginBottom: 12 }}>
            <label style={LABEL}>Tiêu đề <span style={{ color: '#dc2626' }}>*</span></label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Nhập tiêu đề công việc..." style={FIELD} autoFocus />
          </div>

          {/* Mục tiêu */}
          <div style={{ marginBottom: 12 }}>
            <label style={LABEL}>Mục tiêu</label>
            <input value={form.objective} onChange={e => set('objective', e.target.value)} placeholder="Kết quả đo được, vd: Chốt 2 hợp đồng" style={FIELD} />
          </div>

          {/* Mô tả */}
          <div style={{ marginBottom: 12 }}>
            <label style={LABEL}>Mô tả</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Chi tiết, hướng dẫn, link tài liệu..."
              rows={2}
              style={{ ...FIELD, height: 'auto', padding: '8px 12px', resize: 'vertical' }}
            />
          </div>

          {/* Row: Độ ưu tiên + Trạng thái */}
          <div style={{ ...ROW2, marginBottom: 12 }}>
            <div>
              <label style={LABEL}>Độ ưu tiên</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={FIELD}>
                <option value="critical">🔴 Khẩn cấp</option>
                <option value="high">🟠 Cao</option>
                <option value="medium">🔵 Trung bình</option>
                <option value="low">🟢 Thấp</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Trạng thái ban đầu</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={FIELD}>
                <option value="todo">📝 Chờ làm</option>
                <option value="inprogress">⚡ Đang làm</option>
              </select>
            </div>
          </div>

          {/* Row: Deadline + Phê duyệt */}
          <div style={{ ...ROW2, marginBottom: 12 }}>
            <div>
              <label style={LABEL}>Deadline</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={FIELD} />
            </div>
            <div>
              <label style={LABEL}>Yêu cầu phê duyệt</label>
              <select value={form.approval_level} onChange={e => set('approval_level', e.target.value)} style={FIELD}>
                {approvalOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row: Phòng ban thực hiện + Phòng ban yêu cầu */}
          <div style={{ ...ROW2, marginBottom: 12 }}>
            <div>
              <label style={LABEL}>Phòng ban thực hiện <span style={{ color: '#dc2626' }}>*</span></label>
              <select
                value={form.department_id}
                onChange={e => { set('department_id', e.target.value); setAssigneeIds([]); }}
                style={FIELD}
              >
                <option value="">— Chọn phòng ban —</option>
                {departments.map(d => (
                  <option key={d.dept_id} value={d.dept_id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL}>Phòng ban yêu cầu</label>
              <select
                value={form.requester_department_id}
                onChange={e => set('requester_department_id', e.target.value)}
                style={FIELD}
              >
                <option value="">— Không có / Cùng phòng —</option>
                {departments.map(d => (
                  <option key={d.dept_id} value={d.dept_id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Người thực hiện — chọn nhiều người, lọc theo phòng ban đã chọn */}
          <div style={{ marginBottom: 12 }}>
            <label style={LABEL}>
              Người thực hiện
              {assigneeIds.length > 0 && (
                <span style={{ marginLeft: 6, color: 'var(--primary)', textTransform: 'none', letterSpacing: 0 }}>
                  — đã chọn {assigneeIds.length} người
                </span>
              )}
            </label>

            {/* Danh sách đã chọn — người đầu tiên chịu trách nhiệm chính */}
            {assigneeIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {assigneeIds.map((id, i) => {
                  const u = userById.get(id);
                  const isMain = i === 0;
                  return (
                    <span key={id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px 4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${isMain ? 'var(--primary)' : 'var(--border-light)'}`,
                      background: isMain ? 'var(--primary)' : 'transparent',
                      color: isMain ? '#fff' : 'var(--text-body)',
                    }}>
                      {isMain && <span title="Chịu trách nhiệm chính">★</span>}
                      {u?.full_name ?? id}
                      {!isMain && (
                        <button
                          type="button"
                          onClick={() => makeMainAssignee(id)}
                          title="Đặt làm người chịu trách nhiệm chính"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 13, lineHeight: 1 }}
                        >☆</button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleAssignee(id)}
                        title="Bỏ chọn"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: isMain ? '#fff' : 'var(--text-muted)', padding: 0, fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                      >×</button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Danh sách nhân sự của phòng ban */}
            {!form.department_id ? (
              <div style={{ ...FIELD, display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                — Chọn phòng ban trước —
              </div>
            ) : (
              <div style={{
                border: '1.5px solid var(--border-light)', borderRadius: 8,
                background: 'var(--bg-page)', maxHeight: 168, overflowY: 'auto', padding: 4,
              }}>
                {deptUsers.length === 0 && (
                  <div style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-muted)' }}>
                    Phòng ban này chưa có nhân sự
                  </div>
                )}
                {deptUsers.map(u => {
                  const checked = assigneeIds.includes(u.user_id);
                  return (
                    <label
                      key={u.user_id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                        padding: '6px 8px', borderRadius: 6, fontSize: 13,
                        color: 'var(--text-body)',
                        background: checked ? 'var(--primary-light)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAssignee(u.user_id)}
                        style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span>
                        {u.full_name}
                        {u.position && <span style={{ color: 'var(--text-muted)' }}> ({u.position})</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {assigneeIds.length > 1 && (
              <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
                ★ {userById.get(assigneeIds[0])?.full_name ?? assigneeIds[0]} chịu trách nhiệm chính,
                {' '}{assigneeIds.length - 1} người còn lại cùng thực hiện. Bấm ☆ để đổi người chịu trách nhiệm chính.
              </p>
            )}
          </div>

          {/* Dự án */}
          <div style={{ marginBottom: 12 }}>
            <label style={LABEL}>Dự án</label>
            <select value={form.project_id} onChange={e => set('project_id', e.target.value)} style={FIELD}>
              <option value="">— Chọn dự án —</option>
              {projects.map(p => (
                <option key={p.project_id} value={p.project_id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Email Reminder — chỉ hiện khi có deadline */}
          {form.due_date && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-body)' }}>
                <input
                  type="checkbox"
                  checked={form.email_reminder}
                  onChange={e => setForm(f => ({ ...f, email_reminder: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
                <span>
                  <span style={{ fontWeight: 600 }}>Nhắc qua email trước 1 ngày</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>
                    — gửi email lúc 8:00 sáng ngày {new Date(new Date(form.due_date).getTime() - 86400000).toLocaleDateString('vi-VN')}
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* Tags */}
          <div style={{ marginBottom: 4 }}>
            <label style={LABEL}>Tags — loại công việc</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {PREDEFINED_TAGS.map(tag => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    style={{
                      padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.15s',
                      border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border-light)'}`,
                      background: active ? 'var(--primary)' : 'transparent',
                      color: active ? '#fff' : 'var(--text-body)',
                    }}
                  >
                    {active ? '✓ ' : ''}{tag}
                  </button>
                );
              })}
            </div>
            {/* Custom tags */}
            {selectedTags.filter(t => !PREDEFINED_TAGS.includes(t)).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {selectedTags.filter(t => !PREDEFINED_TAGS.includes(t)).map(tag => (
                  <span key={tag} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: 'var(--primary)', color: '#fff',
                    border: '1.5px solid var(--primary)',
                  }}>
                    {tag}
                    <button
                      type="button"
                      onClick={() => toggleTag(tag)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0, lineHeight: 1, fontSize: 14, display: 'flex', alignItems: 'center' }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}
            <CustomTagInput onAdd={(tag) => { if (!selectedTags.includes(tag)) setSelectedTags(p => [...p, tag]); }} />
          </div>
        </form>

        {/* Footer */}
        <div style={inline
          ? { paddingTop: 16, marginTop: 4, display: 'flex', justifyContent: 'flex-end', gap: 10 }
          : { padding: '12px 20px', borderTop: '1px solid var(--border-lighter)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{
            padding: '8px 20px', borderRadius: 8, border: '1.5px solid var(--border-light)',
            cursor: 'pointer', background: 'transparent', fontSize: 14, fontWeight: 600, color: 'var(--text-body)',
          }}>
            Hủy
          </button>
          <button onClick={submit} disabled={loading} style={{
            padding: '8px 24px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.7 : 1,
          }}>
            {loading ? <Loader2 size={15} className="tm-spin" /> : <Save size={15} />}
            Tạo công việc
          </button>
        </div>
    </>
  );

  if (inline) return body;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 640,
        maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {body}
      </div>
    </div>
  );
}
