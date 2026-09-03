'use client';

// "Nhóm riêng" — mô hình Sale tự khai thác data (locked business decision).
// KHÔNG phải Dataset/Campaign/DuAn.ds_sale — xem prisma/schema.prisma cho lý
// do đầy đủ. UI đơn giản: list nhóm (đã lọc theo quyền bởi server) → tạo nhóm
// (Admin) → chi tiết 1 nhóm (member + customer, đã lọc theo quyền bởi server).
// Server luôn là authority — UI CHỈ ẩn/hiện control cho gọn, không tự quyết
// định ai thấy gì (mọi API đều tự check lại quyền, xem private-group-auth.ts).
import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Users, X } from 'lucide-react';
import type { NhanVien, PrivateGroup, PrivateGroupMember, PrivateGroupCustomer, DuAn } from '@/lib/types';
import { NGUON } from '@/lib/constants';

export function PrivateGroupPanel({ employees, currentUser, isAdmin, duAnList = [], onClose }: {
  employees: NhanVien[];
  currentUser: NhanVien | null;
  isAdmin: boolean;
  /** Optional — chỉ cần cho "+ Thêm khách hàng" trong group detail (chọn Dự
   * án). Không truyền vẫn hoạt động (dropdown Dự án rỗng, KHÔNG chặn tạo). */
  duAnList?: DuAn[];
  onClose: () => void;
}) {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [groups, setGroups] = useState<PrivateGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Success message sau khi xóa nhóm (từ PrivateGroupDetail) — hiện ở đúng
  // view LIST vì xóa xong quay lại đó (onDeleted đóng detail + fetchGroups()).
  const [notice, setNotice] = useState('');

  const salesForSelect = employees.filter(e => e.trang_thai !== 'Nghỉ việc');

  const fetchGroups = () => {
    setLoadingGroups(true);
    fetch('/api/private-groups').then(r => r.json()).then(d => {
      if (d.success) setGroups(d.data);
      else setError(d.error || 'Không thể tải danh sách Nhóm riêng');
    }).catch(() => setError('Lỗi kết nối server')).finally(() => setLoadingGroups(false));
  };

  useEffect(() => { fetchGroups(); }, []);

  if (selectedGroupId) {
    const group = groups.find(g => g.id === selectedGroupId);
    return (
      <PrivateGroupDetail
        groupId={selectedGroupId}
        groupFallback={group}
        employees={salesForSelect}
        currentUser={currentUser}
        isAdmin={isAdmin}
        duAnList={duAnList}
        onBack={() => { setSelectedGroupId(null); fetchGroups(); }}
        onDeleted={(groupName) => { setSelectedGroupId(null); fetchGroups(); setNotice(`Đã xóa nhóm "${groupName}".`); }}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title"><Users size={18} /> Nhóm riêng</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 7, padding: 10, marginBottom: 12 }}>{error}</div>}
          {notice && <div style={{ background: '#ecfdf5', color: '#047857', borderRadius: 7, padding: 10, marginBottom: 12 }}>{notice}</div>}

          {view === 'create' ? (
            <CreateGroupForm
              employees={salesForSelect}
              onCancel={() => setView('list')}
              onCreated={() => { setView('list'); fetchGroups(); }}
            />
          ) : (
            <>
              {isAdmin && (
                <button className="btn btn-primary btn-sm" style={{ marginBottom: 14 }} onClick={() => setView('create')}>
                  <Plus size={15} /> Tạo nhóm mới
                </button>
              )}
              {loadingGroups ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                  <Loader2 size={16} className="spin" /> Đang tải...
                </div>
              ) : groups.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {isAdmin ? 'Chưa có Nhóm riêng nào — bấm "Tạo nhóm mới" để bắt đầu.' : 'Bạn chưa thuộc Nhóm riêng nào.'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {groups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                        padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          Leader: {g.leader_name} · {g.memberCount ?? 0} Sale thành viên
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateGroupForm({ employees, onCancel, onCreated }: {
  employees: NhanVien[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleMember = (id: string) => {
    setMemberIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const handleCreate = async () => {
    if (!name.trim() || !leaderId) return;
    setSaving(true);
    setError('');
    try {
      const leader = employees.find(e => e.id_nhan_vien === leaderId);
      const res = await fetch('/api/private-groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), leader_id: leaderId, leader_name: leader?.ho_ten || '' }),
      });
      const result = await res.json();
      if (!result.success) { setError(result.error || 'Không thể tạo nhóm'); return; }
      const groupId: string = result.data.id;
      // Thêm Sale members (tuần tự — số lượng nhỏ, không cần Promise.all phức tạp
      // cho v1; lỗi 1 member không chặn các member còn lại).
      for (const employeeId of memberIds.filter(id => id !== leaderId)) {
        const member = employees.find(e => e.id_nhan_vien === employeeId);
        await fetch(`/api/private-groups/${groupId}/members`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: employeeId, employee_name: member?.ho_ten || '' }),
        });
      }
      onCreated();
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 7, padding: 10, marginBottom: 12 }}>{error}</div>}
      <div className="form-group">
        <label className="form-label">Tên nhóm *</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="VD: Nhóm Sale khai thác Landing Page" />
      </div>
      <div className="form-group">
        <label className="form-label">Leader (đúng 1 người) *</label>
        <select className="form-select" value={leaderId} onChange={e => setLeaderId(e.target.value)}>
          <option value="">— Chọn Leader —</option>
          {employees.map(e => <option key={e.id_nhan_vien} value={e.id_nhan_vien}>{e.ho_ten}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Sale thành viên</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto', padding: 4, border: '1px solid var(--border)', borderRadius: 8 }}>
          {employees.filter(e => e.id_nhan_vien !== leaderId).map(e => (
            <label key={e.id_nhan_vien} style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '3px 8px', borderRadius: 5,
              border: '1px solid var(--border)', cursor: 'pointer',
              background: memberIds.includes(e.id_nhan_vien) ? 'var(--primary-light, #eff6ff)' : 'transparent',
            }}>
              <input type="checkbox" checked={memberIds.includes(e.id_nhan_vien)} onChange={() => toggleMember(e.id_nhan_vien)} style={{ margin: 0 }} />
              {e.ho_ten}
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary" disabled={!name.trim() || !leaderId || saving} onClick={handleCreate}>
          {saving ? <Loader2 size={14} className="spin" /> : 'Tạo nhóm'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Hủy</button>
      </div>
    </div>
  );
}

function PrivateGroupDetail({ groupId, groupFallback, employees, currentUser, isAdmin, duAnList, onBack, onDeleted, onClose }: {
  groupId: string;
  groupFallback?: PrivateGroup;
  employees: NhanVien[];
  currentUser: NhanVien | null;
  isAdmin: boolean;
  duAnList: DuAn[];
  onBack: () => void;
  /** Xóa nhóm thành công — parent đóng detail, refresh danh sách, hiện thông
   * báo (xem PrivateGroupPanel). groupName truyền lên để hiện đúng tên nhóm
   * vừa xóa trong thông báo dù state cục bộ ở đây đã unmount. */
  onDeleted: (groupName: string) => void;
  onClose: () => void;
}) {
  const [group, setGroup] = useState<PrivateGroup | null>(groupFallback ?? null);
  const [members, setMembers] = useState<PrivateGroupMember[]>([]);
  const [customers, setCustomers] = useState<PrivateGroupCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addMemberId, setAddMemberId] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isLeader = Boolean(currentUser && group && group.leader_id === currentUser.id_nhan_vien);
  const canManage = isAdmin || isLeader;

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/private-groups/${groupId}`).then(r => r.json()),
      fetch(`/api/private-groups/${groupId}/customers`).then(r => r.json()),
    ]).then(([detail, custs]) => {
      if (detail.success) { setGroup(detail.data.group); setMembers(detail.data.members); }
      else setError(detail.error || 'Không thể tải chi tiết nhóm');
      if (custs.success) setCustomers(custs.data);
    }).catch(() => setError('Lỗi kết nối server')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [groupId]);

  const handleAddMember = async () => {
    if (!addMemberId) return;
    const emp = employees.find(e => e.id_nhan_vien === addMemberId);
    const res = await fetch(`/api/private-groups/${groupId}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: addMemberId, employee_name: emp?.ho_ten || '' }),
    });
    const result = await res.json();
    if (result.success) { setAddMemberId(''); load(); } else setError(result.error || 'Không thể thêm thành viên');
  };

  const handleRemoveMember = async (employeeId: string) => {
    const res = await fetch(`/api/private-groups/${groupId}/members?employee_id=${encodeURIComponent(employeeId)}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) load(); else setError(result.error || 'Không thể gỡ thành viên');
  };

  // Xóa nhóm — CHỈ Admin (nút chỉ render khi isAdmin, server tự re-check
  // canDeletePrivateGroup, xem DELETE /api/private-groups/[id] — UI ẩn/hiện
  // KHÔNG phải security boundary). Xóa PrivateGroupMember + PrivateGroupCustomer
  // (bao gồm CSKH state riêng nhóm) + PrivateGroup, atomic — KHÔNG đụng
  // KhachHang/Campaign/CampaignMembership/CrmHandoff/Pipeline.
  const handleDeleteGroup = async () => {
    if (!group) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/private-groups/${groupId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) { onDeleted(group.name); return; }
      setError(result.error || 'Không thể xóa nhóm');
      setShowDeleteConfirm(false);
    } catch {
      setError('Lỗi kết nối server');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleReassign = async (relationId: string, newAssigneeId: string) => {
    const person = [...(group ? [{ id_nhan_vien: group.leader_id, ho_ten: group.leader_name }] : []), ...employees]
      .find(e => e.id_nhan_vien === newAssigneeId);
    const res = await fetch(`/api/private-groups/${groupId}/customers/${relationId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to_id: newAssigneeId, assigned_to_name: person?.ho_ten || '' }),
    });
    const result = await res.json();
    if (result.success) load(); else setError(result.error || 'Không thể giao lại khách hàng');
  };

  const eligibleAssignees = group ? [{ id_nhan_vien: group.leader_id, ho_ten: group.leader_name }, ...members.map(m => ({ id_nhan_vien: m.employee_id, ho_ten: m.employee_name }))] : [];

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginRight: 6 }}>←</button>
            <Users size={18} /> {group?.name || 'Nhóm riêng'}
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 7, padding: 10, marginBottom: 12 }}>{error}</div>}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
              <Loader2 size={16} className="spin" /> Đang tải...
            </div>
          ) : !group ? null : (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Leader: <strong style={{ color: 'var(--text-primary)' }}>{group.leader_name}</strong>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>Sale thành viên ({members.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: canManage ? 10 : 0 }}>
                  {members.map(m => (
                    <span key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)' }}>
                      {m.employee_name}
                      {canManage && (
                        <button onClick={() => handleRemoveMember(m.employee_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#b91c1c' }}>
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                  {members.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Chưa có Sale thành viên</span>}
                </div>
                {canManage && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className="form-select" style={{ maxWidth: 240 }} value={addMemberId} onChange={e => setAddMemberId(e.target.value)}>
                      <option value="">— Thêm Sale vào nhóm —</option>
                      {employees.filter(e => e.id_nhan_vien !== group.leader_id && !members.some(m => m.employee_id === e.id_nhan_vien)).map(e => (
                        <option key={e.id_nhan_vien} value={e.id_nhan_vien}>{e.ho_ten}</option>
                      ))}
                    </select>
                    <button className="btn btn-secondary btn-sm" disabled={!addMemberId} onClick={handleAddMember}>Thêm</button>
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    Khách hàng của nhóm ({customers.length}){!canManage && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> — chỉ khách bạn nhập/được giao</span>}
                  </div>
                  {/* "+ Thêm khách hàng" từ group detail — group ĐÃ xác định
                      sẵn (groupId), không bắt user chọn lại (xem section 5).
                      Hiển thị cho mọi người xem được group detail này (đã qua
                      gate canViewPrivateGroup ở trang cha) — cùng nguyên tắc
                      "Thêm khách hàng" mở cho mọi user CRM hợp lệ ở /khach-hang. */}
                  {!showAddCustomer && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCustomer(true)}>
                      <Plus size={14} /> Thêm khách hàng
                    </button>
                  )}
                </div>
                {showAddCustomer && group && (
                  <AddCustomerToGroupForm
                    groupId={group.id}
                    groupName={group.name}
                    isAdmin={isAdmin}
                    employees={employees}
                    duAnList={duAnList}
                    onCancel={() => setShowAddCustomer(false)}
                    onCreated={() => { setShowAddCustomer(false); load(); }}
                  />
                )}
                {customers.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Chưa có khách hàng nào.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '6px 8px' }}>Tên KH</th>
                          <th style={{ padding: '6px 8px' }}>SĐT</th>
                          <th style={{ padding: '6px 8px' }}>Người nhập</th>
                          <th style={{ padding: '6px 8px' }}>Đang giao cho</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.map(c => (
                          <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px' }}>{c.customer?.ten_KH || '(không tìm thấy)'}</td>
                            <td style={{ padding: '6px 8px' }}>{c.customer?.so_dien_thoai || ''}</td>
                            <td style={{ padding: '6px 8px' }}>{c.entered_by_name}</td>
                            <td style={{ padding: '6px 8px' }}>
                              {canManage ? (
                                <select className="form-select" style={{ fontSize: 12, padding: '2px 6px' }} value={c.assigned_to_id} onChange={e => handleReassign(c.id, e.target.value)}>
                                  {eligibleAssignees.map(p => <option key={p.id_nhan_vien} value={p.id_nhan_vien}>{p.ho_ten}</option>)}
                                </select>
                              ) : c.assigned_to_name}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* "Xóa nhóm" — CHỈ Admin thấy (server tự re-check
                  canDeletePrivateGroup). Tách hẳn khỏi các action thường
                  (border-top + margin lớn + để cuối modal) để không lỡ tay
                  bấm nhầm khi đang thao tác Sale thành viên/Customer phía
                  trên. */}
              {isAdmin && (
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteConfirm(true)}>
                    <Trash2 size={14} /> Xóa nhóm
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    {showDeleteConfirm && group && (
      <div className="confirm-overlay" onClick={() => !deleting && setShowDeleteConfirm(false)}>
        <div className="confirm-box" onClick={e => e.stopPropagation()}>
          <h3>Xác nhận xóa nhóm</h3>
          <p>
            Bạn có chắc muốn xóa nhóm &quot;{group.name}&quot;? Xóa nhóm sẽ xóa liên kết Nhóm riêng và toàn bộ lịch sử/trạng thái CSKH thuộc riêng nhóm này. Khách hàng gốc vẫn được giữ lại.
          </p>
          {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 7, padding: 10, marginBottom: 12 }}>{error}</div>}
          <div className="confirm-actions">
            <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Hủy</button>
            <button className="btn btn-danger" onClick={handleDeleteGroup} disabled={deleting}>
              {deleting ? <Loader2 size={14} className="spin" /> : 'Xóa nhóm'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

/** "+ Thêm khách hàng" từ group detail (section 5) — group ĐÃ xác định sẵn
 * (groupId cố định, không cho chọn lại). POST thẳng tới /api/khach-hang
 * (CÙNG engine với trang /khach-hang, xem createManualCustomerWithGroupLink)
 * — chỉ là 1 form UI gọn hơn, KHÔNG phải customer-create engine thứ 2. Server
 * tự validate lại actor thực sự thuộc groupId này (resolveManualCustomerGroup)
 * — form này KHÔNG PHẢI security boundary, chỉ tiện dụng cho UI. */
function AddCustomerToGroupForm({ groupId, groupName, isAdmin, employees, duAnList, onCancel, onCreated }: {
  groupId: string;
  groupName: string;
  isAdmin: boolean;
  employees: NhanVien[];
  duAnList: DuAn[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [ten_KH, setTenKH] = useState('');
  const [so_dien_thoai, setSdt] = useState('');
  const [email, setEmail] = useState('');
  const [du_an, setDuAn] = useState('');
  const [nguon, setNguon] = useState('');
  const [nhu_cau, setNhuCau] = useState('');
  const [salePhuTrach, setSalePhuTrach] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!ten_KH.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/khach-hang', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ten_KH: ten_KH.trim(), so_dien_thoai, email, du_an, nguon, nhu_cau,
          ...(isAdmin && salePhuTrach ? { sale_phu_trach: salePhuTrach } : {}),
          groupId,
        }),
      });
      const result = await res.json();
      if (!result.success) { setError(result.error || 'Không thể thêm khách hàng'); return; }
      onCreated();
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 14, background: 'var(--bg-card)' }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Khách hàng mới sẽ vào Nhóm riêng <strong style={{ color: 'var(--text-primary)' }}>{groupName}</strong>
      </div>
      {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 7, padding: 10, marginBottom: 10, fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input className="form-input" value={ten_KH} onChange={e => setTenKH(e.target.value)} placeholder="Tên khách hàng *" />
        <input className="form-input" value={so_dien_thoai} onChange={e => setSdt(e.target.value)} placeholder="Số điện thoại" />
        <input className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
        <select className="form-select" value={du_an} onChange={e => setDuAn(e.target.value)}>
          <option value="">Chọn dự án</option>
          {duAnList.filter(d => d.hien_thi !== 0).map(d => <option key={d.id_du_an} value={d.ten_du_an}>{d.ten_du_an}</option>)}
        </select>
        <select className="form-select" value={nguon} onChange={e => setNguon(e.target.value)}>
          <option value="">Chọn nguồn</option>
          {NGUON.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {/* Sale phụ trách CHỈ Admin chọn được — cùng rule với POST /api/khach-hang
            (non-admin luôn tự gán chính mình, server không tin field này). */}
        {isAdmin && (
          <select className="form-select" value={salePhuTrach} onChange={e => setSalePhuTrach(e.target.value)}>
            <option value="">Sale phụ trách (tự động nếu để trống)</option>
            {employees.map(e => <option key={e.id_nhan_vien} value={e.ho_ten}>{e.ho_ten}</option>)}
          </select>
        )}
      </div>
      <textarea className="form-textarea" value={nhu_cau} onChange={e => setNhuCau(e.target.value)} placeholder="Nhu cầu" style={{ marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={!ten_KH.trim() || saving} onClick={handleCreate}>
          {saving ? <Loader2 size={14} className="spin" /> : 'Thêm khách hàng'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Hủy</button>
      </div>
    </div>
  );
}
