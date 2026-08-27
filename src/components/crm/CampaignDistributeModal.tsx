'use client';

// Campaign Foundation (M1A) + Sale CSKH model — modal để: (a) Admin chọn/tạo
// Campaign + chọn Leader phụ trách + phân tập customer đã chọn (từ bảng
// Khách hàng) cho Sale, HOẶC (b) Leader phân đúng CÁC MEMBERSHIP CHƯA PHÂN
// của Campaign họ phụ trách (fixedCampaign — tái dùng từ CampaignCskhWorkQueue,
// bỏ qua bước chọn/tạo Campaign). KHÔNG đụng CSKH interaction/qualification —
// chỉ tạo/phân CampaignMembership. Không có role "Telesale" riêng — người
// được phân là nhân viên vai_tro 'Sale' (eligibleCampaignSales).
import { useEffect, useState } from 'react';
import { Layers, Loader2, Save, Users, X } from 'lucide-react';
import type { Campaign, DuAn, NhanVien } from '@/lib/types';
import { eligibleCampaignSales } from '@/lib/campaign-sale-eligibility';

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

export function CampaignDistributeModal({ customerIds, employees, projects, isAdmin, fixedCampaign, onClose, onDone }: {
  customerIds: string[];
  employees: NhanVien[];
  projects: DuAn[];
  isAdmin: boolean;
  /** Khi có giá trị (Leader phân data cho Campaign của chính họ): bỏ qua bước chọn/tạo Campaign. */
  fixedCampaign?: { id: string; name: string; id_du_an?: string | null };
  onClose: () => void;
  onDone: () => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(!fixedCampaign);
  const [campaignId, setCampaignId] = useState<string>('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newLeaderName, setNewLeaderName] = useState('');
  const [selectedSales, setSelectedSales] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('none');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DistributeResult | null>(null);

  const activeCampaign = fixedCampaign || campaigns.find(item => item.id === campaignId);
  // Chưa chọn/tạo Campaign nào (bước tạo mới của Admin — POST /api/campaigns
  // chỉ Admin gọi được) -> chưa có gì để thu hẹp, coi như không giới hạn.
  // Khi ĐÃ có activeCampaign: dùng đúng eligibleCampaignSales — nếu Leader
  // không có roster đáng tin cậy, kết quả blocked:true và KHÔNG được rơi về
  // toàn bộ Sale công ty (đúng kiến trúc đã duyệt).
  const eligibility = activeCampaign
    ? eligibleCampaignSales(isAdmin, activeCampaign, projects, employees)
    : { blocked: false as const, scoped: false, sales: employees.filter(item => item.trang_thai !== 'Nghỉ việc' && item.vai_tro === 'Sale') };
  const eligibleSales = eligibility.blocked ? [] : eligibility.sales;

  useEffect(() => {
    if (eligibility.blocked && mode !== 'none') setMode('none');
  }, [eligibility.blocked, mode]);

  useEffect(() => {
    if (fixedCampaign) return;
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
  }, [fixedCampaign]);

  function toggleSale(name: string) {
    setSelectedSales(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
  }

  async function submit() {
    setError('');
    if (!fixedCampaign) {
      if (creatingNew && !newName.trim()) { setError('Nhập tên Campaign.'); return; }
      if (!creatingNew && !campaignId) { setError('Chọn một Campaign.'); return; }
    }
    if ((mode === 'round_robin' || mode === 'quantity') && eligibility.blocked) {
      setError(eligibility.reason);
      return;
    }
    if ((mode === 'round_robin' || mode === 'quantity') && selectedSales.length === 0) {
      setError('Chọn ít nhất 1 Sale để phân, hoặc chọn "Chưa phân (chỉ thêm vào Campaign)".');
      return;
    }
    setSubmitting(true);
    try {
      let targetId = fixedCampaign?.id || campaignId;
      if (!fixedCampaign && creatingNew) {
        const project = projects.find(item => item.id_du_an === newProjectId);
        const leader = employees.find(item => item.ho_ten === newLeaderName);
        const createRes = await fetch('/api/campaigns', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newName.trim(),
            id_du_an: project?.id_du_an || undefined,
            ten_du_an: project?.ten_du_an || undefined,
            owner_id: leader?.id_nhan_vien || undefined,
            owner_name: leader?.ho_ten || undefined,
          }),
        });
        const created = await createRes.json();
        if (!created.success) throw new Error(created.error);
        targetId = created.data.id;
      }
      const distributeRes = await fetch(`/api/campaigns/${targetId}/distribute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ids: customerIds, telesale_names: selectedSales, mode, quantities }),
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
          <h3 className="modal-title"><Layers size={18} /> {fixedCampaign ? `Phân Sale — ${fixedCampaign.name}` : 'Thêm vào Campaign & phân Sale'}</h3>
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
                <div>Vừa phân Sale: <strong>{result.newlyAssigned}</strong></div>
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

              {fixedCampaign ? (
                <div className="form-group">
                  <label className="form-label">Campaign</label>
                  <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 7, fontSize: 13, fontWeight: 600 }}>{fixedCampaign.name}</div>
                </div>
              ) : (
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
              )}

              {!fixedCampaign && creatingNew && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Tên Campaign *</label>
                    <input className="form-input" value={newName} onChange={event => setNewName(event.target.value)} placeholder="VD: Green Paradise - đợt 1" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Dự án (tuỳ chọn)</label>
                    <select className="form-select" value={newProjectId} onChange={event => setNewProjectId(event.target.value)}>
                      <option value="">— Không gắn Dự án —</option>
                      {projects.filter(item => item.hien_thi !== 0).map(item => <option key={item.id_du_an} value={item.id_du_an}>{item.ten_du_an}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Leader phụ trách</label>
                    <select className="form-select" value={newLeaderName} onChange={event => setNewLeaderName(event.target.value)}>
                      <option value="">— Chưa cấu hình —</option>
                      {employees.filter(item => item.trang_thai !== 'Nghỉ việc').map(item => <option key={item.id_nhan_vien} value={item.ho_ten}>{item.ho_ten} · {item.employee_type}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {eligibility.blocked && (
                <div style={{ padding: 12, background: '#fff7ed', color: '#9a3412', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
                  {eligibility.reason}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Cách phân Sale</label>
                <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <input type="radio" checked={mode === 'none'} onChange={() => setMode('none')} /> Chưa phân (chỉ thêm vào Campaign)
                  </label>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center', opacity: eligibility.blocked ? 0.5 : 1 }}>
                    <input type="radio" checked={mode === 'round_robin'} disabled={eligibility.blocked} onChange={() => setMode('round_robin')} /> Chia đều (round-robin)
                  </label>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center', opacity: eligibility.blocked ? 0.5 : 1 }}>
                    <input type="radio" checked={mode === 'quantity'} disabled={eligibility.blocked} onChange={() => setMode('quantity')} /> Theo số lượng
                  </label>
                </div>
              </div>

              {!eligibility.blocked && mode !== 'none' && (
                <div className="form-group">
                  <label className="form-label">Chọn Sale</label>
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    {eligibleSales.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>Không có Sale nào đang hoạt động trong phạm vi Campaign này.</div>}
                    {eligibleSales.map(item => (
                      <div key={item.id_nhan_vien} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                        <input type="checkbox" checked={selectedSales.includes(item.ho_ten)} onChange={() => toggleSale(item.ho_ten)} />
                        <span style={{ flex: 1, fontSize: 13 }}>{item.ho_ten}</span>
                        {mode === 'quantity' && selectedSales.includes(item.ho_ten) && (
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
