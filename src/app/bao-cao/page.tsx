'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, ArrowLeft, FileText } from 'lucide-react';
import type { DashboardData } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

// Định dạng số tiền đầy đủ (VND) — dùng cho báo cáo in
function fmtVND(value: number): string {
  const n = Number(value) || 0;
  return n.toLocaleString('vi-VN') + ' đ';
}

// Định dạng rút gọn (tỷ / triệu) cho tiêu đề KPI
function fmtShort(value: number): string {
  const n = Number(value) || 0;
  if (n >= 1_000_000_000) {
    const ty = n / 1_000_000_000;
    return `${ty % 1 === 0 ? ty.toFixed(0) : ty.toFixed(1)} tỷ`;
  }
  if (n >= 1_000_000) {
    const tr = n / 1_000_000;
    return `${tr % 1 === 0 ? tr.toFixed(0) : tr.toFixed(1)} triệu`;
  }
  return n.toLocaleString('vi-VN');
}

const MONTH_LABELS: Record<string, string> = {};

// Chuẩn hoá key tháng (MM-YYYY, YYYY-MM, M-YYYY...) -> "Tháng M/YYYY"
function thangLabel(key: string): string {
  if (MONTH_LABELS[key]) return MONTH_LABELS[key];
  const m = key.match(/^(\d{1,4})[-/](\d{1,4})$/);
  if (!m) return key;
  let month: number, year: number;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
  if (a > 12) { year = a; month = b; } else { month = a; year = b; }
  const label = `Tháng ${month}/${year}`;
  MONTH_LABELS[key] = label;
  return label;
}

type Ky = 'h1' | 'h2' | 'full';

const KY_CONFIG: Record<Ky, { label: string; tieu_de: string; range: (y: number) => { from: string; to: string } }> = {
  h1: {
    label: '6 tháng đầu năm',
    tieu_de: 'BÁO CÁO TỔNG KẾT 6 THÁNG ĐẦU NĂM',
    range: (y) => ({ from: `${y}-01-01`, to: `${y}-06-30` }),
  },
  h2: {
    label: '6 tháng cuối năm',
    tieu_de: 'BÁO CÁO TỔNG KẾT 6 THÁNG CUỐI NĂM',
    range: (y) => ({ from: `${y}-07-01`, to: `${y}-12-31` }),
  },
  full: {
    label: 'Cả năm',
    tieu_de: 'BÁO CÁO TỔNG KẾT CẢ NĂM',
    range: (y) => ({ from: `${y}-01-01`, to: `${y}-12-31` }),
  },
};

export default function BaoCaoPage() {
  const router = useRouter();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [ky, setKy] = useState<Ky>('h1');

  const cfg = KY_CONFIG[ky];
  const { from, to } = cfg.range(year);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period: 'custom', from, to });
      const res = await fetch(`/api/dashboard?${params}`);
      const result = await res.json();
      if (result.success) setData(result.data);
    } catch (err) {
      console.error('Báo cáo fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmtDate = (s: string) => {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  };

  const ngayXuat = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (authLoading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="empty-state" style={{ marginTop: 80 }}>
        <h3>Không có quyền truy cập</h3>
        <p>Báo cáo tổng kết chỉ dành cho quản trị viên.</p>
      </div>
    );
  }

  const th = data?.tonghop;
  const tongDoanhSo = th?.tong_doanh_so ?? data?.kpi.doanh_thu ?? 0;
  const tongSoCan = th?.tong_so_can ?? data?.kpi.da_ky ?? 0;
  const giaTriTB = th?.gia_tri_tb_can ?? (tongSoCan > 0 ? Math.round(tongDoanhSo / tongSoCan) : 0);

  // Doanh thu theo tháng — sắp xếp tăng dần theo thời gian
  const theoThang = [...(data?.doanh_thu_theo_thang ?? [])].sort((a, b) => {
    const pa = a.thang.match(/^(\d{1,4})[-/](\d{1,4})$/);
    const pb = b.thang.match(/^(\d{1,4})[-/](\d{1,4})$/);
    const norm = (m: RegExpMatchArray | null) => {
      if (!m) return 0;
      const x = parseInt(m[1], 10), z = parseInt(m[2], 10);
      const yr = x > 12 ? x : z, mo = x > 12 ? z : x;
      return yr * 100 + mo;
    };
    return norm(pa) - norm(pb);
  });
  const maxThang = Math.max(...theoThang.map(t => t.doanh_thu), 1);

  return (
    <div className="bao-cao-wrap">
      <style>{printStyles}</style>

      {/* Thanh công cụ — ẩn khi in */}
      <div className="bc-toolbar no-print">
        <button className="btn btn-secondary btn-sm" onClick={() => router.push('/')}>
          <ArrowLeft size={16} /> Quay lại Dashboard
        </button>
        <div className="bc-toolbar-right">
          <div className="toggle-group">
            {(Object.keys(KY_CONFIG) as Ky[]).map(k => (
              <button
                key={k}
                className={`toggle-btn ${ky === k ? 'active' : ''}`}
                onClick={() => setKy(k)}
              >{KY_CONFIG[k].label}</button>
            ))}
          </div>
          <select
            className="bc-year-select"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {[year + 1, new Date().getFullYear(), 2025, 2024].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => b - a).map(y => (
              <option key={y} value={y}>Năm {y}</option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()} disabled={loading || !data}>
            <Printer size={16} /> In / Lưu PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : !data ? (
        <div className="empty-state"><h3>Không tải được dữ liệu</h3></div>
      ) : (
        <div className="bc-page">
          {/* ── Tiêu đề báo cáo ── */}
          <div className="bc-header">
            <div className="bc-company">VICTORY HOLDINGS</div>
            <h1 className="bc-title">{cfg.tieu_de} {year}</h1>
            <div className="bc-period">
              Kỳ báo cáo: {fmtDate(from)} – {fmtDate(to)} &nbsp;·&nbsp; Doanh số ghi nhận theo ngày cọc
            </div>
            <div className="bc-export-date">Ngày xuất báo cáo: {ngayXuat}</div>
          </div>

          {/* ── Chỉ số tổng quan ── */}
          <h2 className="bc-section-title">I. Tổng quan kết quả kinh doanh</h2>
          <div className="bc-kpi-grid">
            <div className="bc-kpi">
              <div className="bc-kpi-label">Tổng doanh số</div>
              <div className="bc-kpi-value" style={{ color: '#1d4ed8' }}>{fmtShort(tongDoanhSo)}</div>
              <div className="bc-kpi-sub">{fmtVND(tongDoanhSo)}</div>
            </div>
            <div className="bc-kpi">
              <div className="bc-kpi-label">Tổng số căn</div>
              <div className="bc-kpi-value" style={{ color: '#d97706' }}>{tongSoCan.toLocaleString('vi-VN')} <span style={{ fontSize: '0.9rem' }}>căn</span></div>
              <div className="bc-kpi-sub">Số giao dịch đã cọc</div>
            </div>
            <div className="bc-kpi">
              <div className="bc-kpi-label">Giá trị TB / căn</div>
              <div className="bc-kpi-value" style={{ color: '#059669' }}>{fmtShort(giaTriTB)}</div>
              <div className="bc-kpi-sub">{fmtVND(giaTriTB)}</div>
            </div>
          </div>

          {/* ── Doanh số theo tháng ── */}
          {theoThang.length > 0 && (
            <>
              <h2 className="bc-section-title">II. Doanh số theo tháng</h2>
              <table className="bc-table">
                <thead>
                  <tr>
                    <th style={{ width: '32%' }}>Tháng</th>
                    <th style={{ width: '38%' }}>Biểu đồ</th>
                    <th style={{ width: '30%', textAlign: 'right' }}>Doanh số</th>
                  </tr>
                </thead>
                <tbody>
                  {theoThang.map(t => (
                    <tr key={t.thang}>
                      <td>{thangLabel(t.thang)}</td>
                      <td>
                        <div className="bc-bar-track">
                          <div className="bc-bar-fill" style={{ width: `${Math.round((t.doanh_thu / maxThang) * 100)}%` }} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtVND(t.doanh_thu)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 700 }}>Tổng cộng</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>
                      {fmtVND(theoThang.reduce((s, t) => s + t.doanh_thu, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}

          {/* ── Bảng xếp hạng sale ── */}
          {data.doanh_thu_theo_sale.length > 0 && (
            <>
              <h2 className="bc-section-title">III. Bảng xếp hạng nhân viên kinh doanh</h2>
              <table className="bc-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Nhân viên</th>
                    <th style={{ textAlign: 'center', width: 90 }}>Số deal</th>
                    <th style={{ textAlign: 'right', width: 160 }}>Doanh số</th>
                  </tr>
                </thead>
                <tbody>
                  {data.doanh_thu_theo_sale.map((s, i) => (
                    <tr key={s.nhan_vien}>
                      <td>
                        <span className={`bc-rank ${i < 3 ? `bc-rank-${i + 1}` : ''}`}>{i + 1}</span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{s.nhan_vien}</td>
                      <td style={{ textAlign: 'center' }}>{s.so_deal}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtVND(s.doanh_thu)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Khu vực ── */}
          {th?.khu_vuc && th.khu_vuc.length > 0 && (
            <>
              <h2 className="bc-section-title">IV. Doanh số theo khu vực</h2>
              <table className="bc-table">
                <thead>
                  <tr>
                    <th>Khu vực</th>
                    <th style={{ textAlign: 'center', width: 90 }}>Số căn</th>
                    <th style={{ textAlign: 'right', width: 160 }}>Doanh số</th>
                  </tr>
                </thead>
                <tbody>
                  {th.khu_vuc.map(k => (
                    <tr key={k.loai}>
                      <td style={{ fontWeight: 500 }}>{k.loai}</td>
                      <td style={{ textAlign: 'center' }}>{k.so_can}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtVND(k.doanh_so)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Top phòng KD ── */}
          {th?.top_phong_kd && th.top_phong_kd.length > 0 && (
            <>
              <h2 className="bc-section-title">V. Top phòng kinh doanh</h2>
              <table className="bc-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Phòng kinh doanh</th>
                    <th style={{ textAlign: 'center', width: 90 }}>Số căn</th>
                    <th style={{ textAlign: 'right', width: 160 }}>Doanh số</th>
                  </tr>
                </thead>
                <tbody>
                  {th.top_phong_kd.map((p, i) => (
                    <tr key={p.ten}>
                      <td><span className={`bc-rank ${i < 3 ? `bc-rank-${i + 1}` : ''}`}>{i + 1}</span></td>
                      <td style={{ fontWeight: 500 }}>{p.ten}</td>
                      <td style={{ textAlign: 'center' }}>{p.so_can}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtVND(p.doanh_so)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Top dự án ── */}
          {th?.top_du_an && th.top_du_an.length > 0 && (
            <>
              <h2 className="bc-section-title">VI. Top dự án theo doanh số</h2>
              <table className="bc-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Dự án</th>
                    <th style={{ textAlign: 'center', width: 90 }}>Số căn</th>
                    <th style={{ textAlign: 'right', width: 160 }}>Doanh số</th>
                  </tr>
                </thead>
                <tbody>
                  {th.top_du_an.map((p, i) => (
                    <tr key={p.ten}>
                      <td><span className={`bc-rank ${i < 3 ? `bc-rank-${i + 1}` : ''}`}>{i + 1}</span></td>
                      <td style={{ fontWeight: 500 }}>{p.ten}</td>
                      <td style={{ textAlign: 'center' }}>{p.so_can}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtVND(p.doanh_so)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Footer ── */}
          <div className="bc-footer">
            <div>
              <FileText size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Báo cáo được tạo tự động từ hệ thống CRM VICTORY HOLDINGS
            </div>
            <div>Doanh số được ghi nhận theo Ngày cọc · Đơn vị: VNĐ</div>
          </div>
        </div>
      )}
    </div>
  );
}

const printStyles = `
.bao-cao-wrap { max-width: 920px; margin: 0 auto; }

.bc-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 12px; margin-bottom: 20px;
}
.bc-toolbar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.bc-year-select {
  padding: 7px 12px; border-radius: var(--radius-md); border: 1px solid var(--border);
  background: var(--bg-surface); color: var(--text-body); font-size: 13px; font-weight: 600;
  cursor: pointer;
}

.bc-page {
  background: #fff; color: #1a1a1a;
  padding: 40px 44px; border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 8px 30px rgba(0,0,0,0.06);
  border: 1px solid var(--border-light);
}

.bc-header { text-align: center; border-bottom: 3px solid #1d4ed8; padding-bottom: 18px; margin-bottom: 8px; }
.bc-company { font-size: 0.82rem; font-weight: 800; letter-spacing: 2px; color: #1d4ed8; }
.bc-title { font-size: 1.5rem; font-weight: 800; color: #111827; margin: 8px 0 6px; line-height: 1.25; }
.bc-period { font-size: 0.82rem; color: #4b5563; }
.bc-export-date { font-size: 0.74rem; color: #9ca3af; margin-top: 4px; }

.bc-section-title {
  font-size: 1.0rem; font-weight: 700; color: #1d4ed8;
  margin: 26px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;
}

.bc-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.bc-kpi {
  border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px;
  background: #f9fafb;
}
.bc-kpi-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
.bc-kpi-value { font-size: 1.5rem; font-weight: 800; margin: 6px 0 2px; }
.bc-kpi-sub { font-size: 0.72rem; color: #9ca3af; }

.bc-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
.bc-table th {
  text-align: left; padding: 9px 12px; background: #f3f4f6;
  font-weight: 700; color: #374151; font-size: 0.76rem;
  text-transform: uppercase; letter-spacing: 0.3px;
  border-bottom: 2px solid #e5e7eb;
}
.bc-table td { padding: 9px 12px; border-bottom: 1px solid #f0f1f3; color: #1f2937; }
.bc-table tbody tr:nth-child(even) { background: #fafbfc; }
.bc-table tfoot td { background: #eff6ff; border-top: 2px solid #d1d5db; }

.bc-bar-track { height: 12px; background: #e5e7eb; border-radius: 6px; overflow: hidden; }
.bc-bar-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #6366f1); border-radius: 6px; }

.bc-rank {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 6px;
  font-weight: 700; font-size: 0.78rem; background: #f3f4f6; color: #6b7280;
}
.bc-rank-1 { background: #fef3c7; color: #b45309; }
.bc-rank-2 { background: #e5e7eb; color: #4b5563; }
.bc-rank-3 { background: #fde4d3; color: #9a3412; }

.bc-footer {
  margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
  font-size: 0.72rem; color: #9ca3af;
}

/* ── Print: A4, ẩn UI thừa ── */
@media print {
  @page { size: A4; margin: 14mm; }
  body { background: #fff !important; }
  .sidebar-wrapper, .sidebar-toggle-btn, .mobile-header, .no-print { display: none !important; }
  .main-content { margin: 0 !important; padding: 0 !important; }
  .content-fluid { padding: 0 !important; max-width: 100% !important; }
  .bao-cao-wrap { max-width: 100% !important; margin: 0 !important; }
  .bc-page {
    box-shadow: none !important; border: none !important;
    padding: 0 !important; border-radius: 0 !important;
  }
  .bc-section-title { break-after: avoid; }
  .bc-table { break-inside: auto; }
  .bc-table tr { break-inside: avoid; }
  .bc-kpi-grid { break-inside: avoid; }
}
`;
