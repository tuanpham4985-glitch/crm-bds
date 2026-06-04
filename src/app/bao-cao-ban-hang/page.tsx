'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, TrendingUp, DollarSign, Building2 } from 'lucide-react';
import type { Pipeline, KhachHang } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

function sortThangDesc(a: string, b: string) {
  const [mA, yA] = a.split('-').map(Number);
  const [mB, yB] = b.split('-').map(Number);
  return yB !== yA ? yB - yA : mB - mA;
}

export default function BaoCaoBanHangPage() {
  const [deals, setDeals] = useState<Pipeline[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterYear, setFilterYear] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterSale, setFilterSale] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [plRes, khRes] = await Promise.all([
        fetch('/api/pipeline?' + new URLSearchParams({ giai_doan: 'Ký HĐ' })),
        fetch('/api/khach-hang?' + new URLSearchParams({ limit: '9999' })),
      ]);
      const [plData, khData] = await Promise.all([plRes.json(), khRes.json()]);
      if (plData.success) setDeals(plData.data);
      if (khData.success) setCustomers(khData.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getKhachName = (deal: Pipeline) => {
    if (deal.ho_ten_kh) return deal.ho_ten_kh;
    const kh = customers.find(k => k.id_khach_hang === deal.id_khach_hang);
    return kh?.ten_KH || '—';
  };

  // Lấy danh sách năm từ dữ liệu
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    deals.forEach(d => {
      const parts = (d.thang || '').split('-');
      if (parts.length === 2 && parts[1]) years.add(parts[1]);
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [deals]);

  // Set năm mặc định là năm hiện tại hoặc năm mới nhất trong data
  useEffect(() => {
    if (!filterYear) {
      const currentYear = String(new Date().getFullYear());
      setFilterYear(availableYears.includes(currentYear) ? currentYear : (availableYears[0] || ''));
    }
  }, [availableYears, filterYear]);

  const uniqueProjects = useMemo(() => {
    const map = new Map<string, string>();
    deals.forEach(d => { if (d.id_du_an && d.ten_du_an) map.set(d.id_du_an, d.ten_du_an); });
    return Array.from(map.entries());
  }, [deals]);

  const uniqueSales = useMemo(() =>
    Array.from(new Set(deals.map(d => d.sale_phu_trach).filter(Boolean))).sort()
  , [deals]);

  const filtered = useMemo(() => deals.filter(d => {
    if (filterYear) {
      const parts = (d.thang || '').split('-');
      if (parts[1] !== filterYear) return false;
    }
    if (filterProject && d.id_du_an !== filterProject) return false;
    if (filterSale && d.sale_phu_trach !== filterSale) return false;
    return true;
  }), [deals, filterYear, filterProject, filterSale]);

  const grouped = useMemo(() => {
    const map = new Map<string, Pipeline[]>();
    for (const d of filtered) {
      const key = d.thang || 'Không rõ';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries()).sort((a, b) => sortThangDesc(a[0], b[0]));
  }, [filtered]);

  const totals = useMemo(() => ({
    count: filtered.length,
    doanh_thu: filtered.reduce((s, d) => s + (d.gia_tri_thuc_te || 0), 0),
    hoa_hong: filtered.reduce((s, d) => s + (d.tien_hoa_hong || 0), 0),
  }), [filtered]);

  const hasFilter = filterProject || filterSale;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tổng hợp báo cáo bán hàng</h1>
          <p className="page-subtitle">Các căn đã ký hợp đồng — phân nhóm theo tháng</p>
        </div>
      </div>

      {/* Bộ lọc */}
      <div className="card" style={{ marginBottom: 16, padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 110 }}>
            <label className="form-label">Năm</label>
            <select className="form-input" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="">Tất cả</option>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label className="form-label">Dự án</label>
            <select className="form-input" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
              <option value="">Tất cả dự án</option>
              {uniqueProjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
            <label className="form-label">Sale phụ trách</label>
            <select className="form-input" value={filterSale} onChange={e => setFilterSale(e.target.value)}>
              <option value="">Tất cả</option>
              {uniqueSales.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {hasFilter && (
            <button
              className="btn btn-secondary"
              style={{ marginBottom: 0 }}
              onClick={() => { setFilterProject(''); setFilterSale(''); }}
            >
              Xoá bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* KPI tổng */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={22} style={{ color: '#2563eb' }} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-title)', lineHeight: 1.1 }}>{totals.count}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', fontWeight: 500, marginTop: 2 }}>Căn đã ký HĐ</div>
          </div>
        </div>
        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingUp size={22} style={{ color: '#059669' }} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-title)', lineHeight: 1.1 }}>{formatCurrency(totals.doanh_thu)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', fontWeight: 500, marginTop: 2 }}>Tổng doanh thu</div>
          </div>
        </div>
        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <DollarSign size={22} style={{ color: '#d97706' }} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-title)', lineHeight: 1.1 }}>{formatCurrency(totals.hoa_hong)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', fontWeight: 500, marginTop: 2 }}>Tổng hoa hồng</div>
          </div>
        </div>
      </div>

      {/* Bảng theo tháng */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Đang tải dữ liệu...</div>
      ) : grouped.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <BarChart3 size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p>Chưa có căn nào ký hợp đồng trong kỳ này</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(([thang, items]) => {
            const [m, y] = thang.split('-');
            const monthDT = items.reduce((s, d) => s + (d.gia_tri_thuc_te || 0), 0);
            const monthHH = items.reduce((s, d) => s + (d.tien_hoa_hong || 0), 0);

            return (
              <div key={thang} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Tiêu đề tháng */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 20px',
                  background: 'var(--bg-page)',
                  borderBottom: '1px solid var(--border-light)',
                  flexWrap: 'wrap', gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-title)', fontSize: '0.9375rem' }}>
                      Tháng {m}/{y}
                    </span>
                    <span style={{
                      background: 'var(--primary-light)', color: 'var(--primary-text)',
                      borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600,
                    }}>
                      {items.length} căn
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, fontSize: '0.8125rem', color: 'var(--text-body)' }}>
                    <span>
                      Doanh thu:&nbsp;
                      <strong style={{ color: 'var(--success-text)' }}>{formatCurrency(monthDT)}</strong>
                    </span>
                    <span>
                      Hoa hồng:&nbsp;
                      <strong style={{ color: '#d97706' }}>{formatCurrency(monthHH)}</strong>
                    </span>
                  </div>
                </div>

                {/* Bảng danh sách căn */}
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Mã căn</th>
                        <th>Dự án</th>
                        <th>Khách hàng</th>
                        <th>Loại căn</th>
                        <th style={{ textAlign: 'right' }}>Giá trị</th>
                        <th style={{ textAlign: 'right' }}>Tỷ lệ HH</th>
                        <th style={{ textAlign: 'right' }}>Tiền HH</th>
                        <th>Sale phụ trách</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(deal => (
                        <tr key={deal.id_pipeline}>
                          <td>
                            <span style={{ fontWeight: 600, color: 'var(--text-title)', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                              {deal.ma_can || '—'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-body)', fontSize: '0.8125rem' }}>
                            {deal.ten_du_an || '—'}
                          </td>
                          <td style={{ fontWeight: 500 }}>{getKhachName(deal)}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                            {deal.loai_can || '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success-text)' }}>
                            {formatCurrency(deal.gia_tri_thuc_te)}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--text-body)', fontSize: '0.8125rem' }}>
                            {deal.hoa_hong ? `${(deal.hoa_hong * 100).toFixed(2)}%` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#d97706' }}>
                            {deal.tien_hoa_hong ? formatCurrency(deal.tien_hoa_hong) : '—'}
                          </td>
                          <td style={{ fontSize: '0.8125rem' }}>{deal.sale_phu_trach || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Tổng tháng */}
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border-light)', background: 'var(--bg-page)' }}>
                        <td colSpan={4} style={{ fontWeight: 600, color: 'var(--text-title)', padding: '10px 16px', fontSize: '0.8125rem' }}>
                          Tổng tháng {m}/{y}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success-text)', padding: '10px 16px' }}>
                          {formatCurrency(monthDT)}
                        </td>
                        <td />
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#d97706', padding: '10px 16px' }}>
                          {formatCurrency(monthHH)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Grand total */}
          {grouped.length > 1 && (
            <div className="card" style={{
              padding: '14px 24px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'var(--primary-light)', border: '1.5px solid var(--primary)',
              flexWrap: 'wrap', gap: 8,
            }}>
              <span style={{ fontWeight: 700, color: 'var(--primary-text)', fontSize: '0.9375rem' }}>
                Tổng cộng — {totals.count} căn
              </span>
              <div style={{ display: 'flex', gap: 24 }}>
                <span style={{ fontSize: '0.875rem' }}>
                  Doanh thu:&nbsp;
                  <strong style={{ color: 'var(--primary)', fontSize: '1rem' }}>{formatCurrency(totals.doanh_thu)}</strong>
                </span>
                <span style={{ fontSize: '0.875rem' }}>
                  Hoa hồng:&nbsp;
                  <strong style={{ color: 'var(--primary)', fontSize: '1rem' }}>{formatCurrency(totals.hoa_hong)}</strong>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
