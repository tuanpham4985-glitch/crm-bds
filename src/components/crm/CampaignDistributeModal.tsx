'use client';

// Campaign Foundation (M1A) — modal tối thiểu để Admin: chọn/tạo Campaign,
// phân tập customer đã chọn (từ bảng Khách hàng, tái dùng selectedIds có sẵn)
// cho Telesale. KHÔNG đụng CSKH interaction/qualification — chỉ tạo/phân
// CampaignMembership. Đóng scope M1B: không có work-queue, không ghi chăm sóc.
import { useEffect, useState } from 'react';
import { Layers, Loader2, Save, Users, X } from 'lucide-react';
import type { Campaign, NhanVien } from '@/lib/types';

function isTelesale(employee: NhanVien): boolean {
  return `${employee.employee_type || ''} ${employee.vai_tro || ''}`.toLowerCase().match(/telesale|cskh/) !== null;
}

type Mode = 'none' | 'round_robin' | 'quantity';

interface DistributeResult {
  requested: number;
  notFound: string[];
  alreadyMember: number;
  alreadyAssigned: number;
  created: number;
  newlyAssigned: number;
  stillUnassigned: number;
}

export function CampaignDistributeModal({ customerIds, employees, onClose, onDone }: {
  customerIds: string[];
  employees: NhanVien[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignId, setCampaignId] = useState<string>('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProject, setNewProject] = useState('');
  const [selectedTelesales, setSelectedTelesales] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('none');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DistributeResult | null>(null);

  const activeTelesales = employees.filter(item => item.trang_thai !== 'Nghỉ việc' && isTelesale(item));

  useEffect(() => {
    (async () => {
      setLoadingCampaigns(true);
      try {
        const res = await fetch('/api/campaigns');
        const data = await res.json();
        if (data.success) {
          setCampaigns(data.data);
          if (data.data.length === 0) setCreatingNew(true);
        }
      } catch { /* để trống, form vẫn dùng được cho tạo mới */ }
      finally { setLoadingCampaigns(false); }
    })();
  }, []);

  function toggleTelesale(name: string) {
    setSelectedTelesales(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
  }

  async function submit() {
    setError('');
    if (creatingNew && !newName.trim()) { setError('Nhập tên Campaign.'); return; }
    if (!creatingNew && !campaignId) { setError('Chọn một Campaign.'); return; }
    if ((mode === 'round_robin' || mode === 'quantity') && selectedTelesales.length === 0) {
      setError('Chọn ít nhất 1 Telesale để phân, hoặc chọn "Chưa phân (chỉ thêm vào Campaign)".');
      return;
    }
    setSubmitting(true);
    try {
      let targetId = campaignId;
      if (creatingNew) {
        const createRes = await fetch('/api/campaigns', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim(), ten_du_an: newProject.trim() || undefined }),
        });
        const created = await createRes.json();
        if (!created.success) throw new Error(created.error);
        targetId = created.data.id;
      }
      const distributeRes = await fetch(`/api/campaigns/${targetId}/distribute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ids: customerIds, telesale_names: selectedTelesales, mode, quantities }),
      });
      const distributed = await distributeRes.json();
      if (!distributed.success) throw new Error(distributed.error);
      setResult(distributed.data);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể phân data vào Campaign.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 620 }} onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title"><Layers size={18} /> Thêm vào Campaign &amp; phân Telesale</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {result ? (
            <div>
              <div style={{ padding: 12, background: '#ecfdf5', color: '#047857', borderRadius: 8, marginBottom: 12, fontWeight: 600 }}>
                Đã xử lý xong.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                <div>Đã chọn: <strong>{result.requested}</strong></div>
                <div>Đã có sẵn trong Campaign: <strong>{result.alreadyMember}</strong></div>
                <div>Vừa thêm mới: <strong>{result.created}</strong></div>
                <div>Đã phân từ trước: <strong>{result.alreadyAssigned}</strong></div>
                <div>Vừa phân Telesale: <strong>{result.newlyAssigned}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}>Còn chưa phân: <strong>{result.stillUnassigned}</strong></div>
                {result.notFound.length > 0 && <div style={{ color: '#b91c1c' }}>Không tìm thấy: <strong>{result.notFound.length}</strong></div>}
              </div>
            </div>
          ) : (
            <>
              {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 7, padding: 10, marginBottom: 12 }}>{error}</div>}
              <div style={{ padding: 10, background: '#f8fafc', borderRadius: 7, marginBottom: 14, fontSize: 13 }}>
                <Users size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                Đang thao tác trên <strong>{customerIds.length}</strong> khách hàng đã chọn.
              </div>

              <div className="form-group">
                <label className="form-label">Campaign</label>
                {loadingCampaigns ? <Loader2 size={16} className="spin" /> : (
                  <>
                    {!creatingNew && (
                      <select className="form-select" value={campaignId} onChange={event => setCampaignId(event.target.value)}>
                        <option value="">— Chọn Campaign —</option>
                        {campaigns.map(item => <option key={item.id} value={item.id}>{item.name}{item.ten_du_an ? ` · ${item.ten_du_an}` : ''}</option>)}
                      </select>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setCreatingNew(current => !current)}>
                      {creatingNew ? '← Chọn Campaign có sẵn' : '+ Tạo Campaign mới'}
                    </button>
                  </>
                )}
              </div>

              {creatingNew && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Tên Campaign *</label>
                    <input className="form-input" value={newName} onChange={event => setNewName(event.target.value)} placeholder="VD: Green Paradise - đợt 1" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Dự án (tuỳ chọn)</label>
                    <input className="form-input" value={newProject} onChange={event => setNewProject(event.target.value)} />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Cách phân Telesale</label>
                <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <input type="radio" checked={mode === 'none'} onChange={() => setMode('none')} /> Chưa phân (chỉ thêm vào Campaign)
                  </label>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <input type="radio" checked={mode === 'round_robin'} onChange={() => setMode('round_robin')} /> Chia đều (round-robin)
                  </label>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <input type="radio" checked={mode === 'quantity'} onChange={() => setMode('quantity')} /> Theo số lượng
                  </label>
                </div>
              </div>

              {mode !== 'none' && (
                <div className="form-group">
                  <label className="form-label">Chọn Telesale</label>
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    {activeTelesales.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>Không có Telesale/CSKH đang hoạt động.</div>}
                    {activeTelesales.map(item => (
                      <div key={item.id_nhan_vien} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                        <input type="checkbox" checked={selectedTelesales.includes(item.ho_ten)} onChange={() => toggleTelesale(item.ho_ten)} />
                        <span style={{ flex: 1, fontSize: 13 }}>{item.ho_ten}</span>
                        {mode === 'quantity' && selectedTelesales.includes(item.ho_ten) && (
                          <input
                            type="number" min={0} className="form-input" style={{ width: 72, fontSize: 12 }}
                            value={quantities[item.ho_ten] ?? ''}
                            onChange={event => setQuantities(current => ({ ...current, [item.ho_ten]: Number(event.target.value) || 0 }))}
                            placeholder="SL"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {mode === 'quantity' && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                      Phần dư sau khi chia đủ số lượng sẽ được thêm vào Campaign ở trạng thái Chưa phân.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          {result ? (
            <button className="btn btn-primary" onClick={onClose}>Đóng</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>Hủy</button>
              <button className="btn btn-primary" onClick={() => void submit()} disabled={submitting}>
                {submitting ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Xác nhận
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
