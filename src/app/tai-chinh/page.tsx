'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Home, BarChart2, Percent,
  Upload, FileSpreadsheet, Download, X, AlertCircle, History, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawMonthly { label: string; doanhSo: number; dtHH: number; soCan: number }
interface RawPnL {
  soCan: number; doanhSo: number; dtMG: number;
  hhSalesAll: number; thuongNongSales: number;
  cpBanHang: number; cpVanHanh: number; lnTruocThue: number;
}
interface RawData {
  id?: string; period: string; filename: string; numMonths: number;
  pnl: RawPnL; monthly: RawMonthly[];
}
interface HistoryItem {
  id: string; ngay_upload: string; ky_bao_cao: string; ten_file: string;
  so_can: number; doanh_so_ty: number; dt_mg_ty: number;
  hh_sales_pct: number; ln_ty: number; ln_pct: number;
}

// ─── Default data (T1–T5/2026) ───────────────────────────────────────────────

const DEFAULT_RAW: RawData = {
  period: 'T1–T5/2026', filename: 'VH_BC KQ HĐKD T1-5.2026.xlsx', numMonths: 5,
  pnl: {
    soCan: 32, doanhSo: 457237918201, dtMG: 15635026322,
    hhSalesAll: 11001292919, thuongNongSales: 690909091,
    cpBanHang: 743647888, cpVanHanh: 2344661707, lnTruocThue: 854514717,
  },
  monthly: [
    { label: 'T12/25', doanhSo: 73632000000, dtHH: 2449000000, soCan: 3 },
    { label: 'T1/26',  doanhSo: 115516000000, dtHH: 3905000000, soCan: 11 },
    { label: 'T2/26',  doanhSo: 19942000000,  dtHH: 617000000,  soCan: 2 },
    { label: 'T3/26',  doanhSo: 60524000000,  dtHH: 1812000000, soCan: 3 },
    { label: 'T4/26',  doanhSo: 66896000000,  dtHH: 2148000000, soCan: 7 },
    { label: 'T5/26',  doanhSo: 120728000000, dtHH: 4620000000, soCan: 7 },
  ],
};

// ─── Compute display values ───────────────────────────────────────────────────

function computeDisplay(raw: RawData) {
  const B = 1e9;
  const p = raw.pnl;
  const dtMG  = p.dtMG / B;
  const hhAll = p.hhSalesAll / B;
  const tNong = p.thuongNongSales / B;
  const cpBH  = p.cpBanHang / B;
  const cpVH  = p.cpVanHanh / B;
  const ln    = p.lnTruocThue / B;
  const ds    = p.doanhSo / B;
  const gross = dtMG - hhAll - tNong;
  const pct   = (a: number) => dtMG > 0 ? a / dtMG * 100 : 0;

  const hhPct    = pct(hhAll);
  const tNongPct = pct(tNong);
  const grossPct = pct(gross);
  const cpBHPct  = pct(cpBH);
  const cpVHPct  = pct(cpVH);
  const lnPct    = pct(ln);

  const n = raw.numMonths || raw.monthly.filter(m => !m.label.includes('12/')).length || 5;
  const avgDS  = ds / n;
  const avgDT  = dtMG / n;
  const avgCan = p.soCan / n;

  const monthly = raw.monthly.map(m => ({
    thang: m.label,
    doanhSo: m.doanhSo / B,
    dtHH: m.dtHH / B,
    soCan: m.soCan,
  }));

  const pnlRows = [
    { label: 'Doanh thu MG', value: dtMG, pct: 100, type: 'pos' },
    { label: `HH Sales (${hhPct.toFixed(1)}%)`, value: -hhAll, pct: -hhPct, type: 'neg' },
    { label: 'Thưởng nóng sales', value: -tNong, pct: -tNongPct, type: 'neg' },
    { label: 'Lợi nhuận gộp', value: gross, pct: grossPct, type: 'mid' },
    { label: 'CP bán hàng/MKT', value: -cpBH, pct: -cpBHPct, type: 'neg' },
    { label: 'CP vận hành', value: -cpVH, pct: -cpVHPct, type: 'warn' },
    { label: 'LN trước thuế', value: ln, pct: lnPct, type: 'result' },
  ];

  const kpis = [
    {
      icon: DollarSign, label: 'Doanh số GD', value: `${ds.toFixed(1)} tỷ`,
      sub: `BQ/tháng: ${avgDS.toFixed(1)} tỷ`, target: 'Mục tiêu ≥ 58 tỷ/tháng',
      status: avgDS >= 58 ? 'green' : 'red',
      note: avgDS >= 58 ? `Vượt mục tiêu +${((avgDS/58-1)*100).toFixed(0)}%` : `Chưa đạt (thiếu ${(58-avgDS).toFixed(1)} tỷ)`,
    },
    {
      icon: TrendingUp, label: 'Doanh thu môi giới', value: `${dtMG.toFixed(2)} tỷ`,
      sub: `BQ/tháng: ${avgDT.toFixed(2)} tỷ`, target: 'Mục tiêu ≥ 2,3 tỷ/tháng',
      status: avgDT >= 2.3 ? 'green' : 'red',
      note: avgDT >= 2.3 ? `Vượt mục tiêu +${((avgDT/2.3-1)*100).toFixed(0)}%` : `Chưa đạt (thiếu ${(2.3-avgDT).toFixed(2)} tỷ)`,
    },
    {
      icon: Home, label: 'Số căn bán', value: `${p.soCan} căn`,
      sub: `BQ/tháng: ${avgCan.toFixed(1)} căn`, target: 'Mục tiêu ≥ 6–7 căn/tháng',
      status: avgCan >= 6 ? 'green' : avgCan >= 4 ? 'amber' : 'red',
      note: avgCan >= 6 ? 'Đạt mục tiêu' : `Chưa đạt (BQ ${avgCan.toFixed(1)} căn/tháng)`,
    },
    {
      icon: Percent, label: 'HH Sales / Doanh thu', value: `${hhPct.toFixed(1)}%`,
      sub: `HH Sales: ${hhAll.toFixed(2)} tỷ`, target: 'Mục tiêu ≤ 65%',
      status: hhPct <= 65 ? 'green' : hhPct <= 70 ? 'amber' : 'red',
      note: hhPct <= 65 ? `Tốt (dư ${(65-hhPct).toFixed(1)}%)` : `Vượt giới hạn +${(hhPct-65).toFixed(1)}%`,
    },
    {
      icon: BarChart2, label: 'CP vận hành / DT', value: `${cpVHPct.toFixed(1)}%`,
      sub: `CP VH: ${cpVH.toFixed(2)} tỷ`, target: 'Mục tiêu ≤ 15%',
      status: cpVHPct <= 15 ? (cpVHPct >= 13 ? 'amber' : 'green') : 'red',
      note: cpVHPct <= 15 ? 'Trong giới hạn' : `Vượt giới hạn +${(cpVHPct-15).toFixed(1)}%`,
    },
    {
      icon: TrendingDown, label: 'LN trước thuế', value: `${lnPct.toFixed(1)}%`,
      sub: `LN: ${(ln*1000).toFixed(0)} triệu`, target: 'Mục tiêu ≥ 20% DT',
      status: lnPct >= 20 ? 'green' : lnPct >= 10 ? 'amber' : 'red',
      note: lnPct >= 20 ? 'Đạt mục tiêu' : `Thiếu ${(20-lnPct).toFixed(1)}% — kiểm soát HH Sales`,
    },
  ];

  const insights: { type: string; title: string; body: string }[] = [];
  if (hhPct > 65) insights.push({
    type: 'red', title: `HH Sales ${hhPct.toFixed(1)}% — vượt trần 65%`,
    body: `Deal đối tác HH 3,5–4%+ chiếm tỷ trọng cao. Mỗi điểm % dư ≈ ${((dtMG)*(hhPct-65)/100*1000/n).toFixed(0)} tr đồng/tháng. Cần tăng deal nội bộ, đặt trần HH đối tác ≤3%.`,
  });
  if (lnPct < 20) insights.push({
    type: 'red', title: `LN ${lnPct.toFixed(1)}% — xa mục tiêu 20%`,
    body: `Điểm hòa vốn ~2,7 tỷ/tháng. Nếu kéo HH Sales về 65%, LN tăng thêm ~${((hhPct-65)*0.01*dtMG*1000/1).toFixed(0)} tr / kỳ. Ưu tiên số 1 cần cải thiện.`,
  });
  const weakMonths = monthly.filter(m => m.dtHH < 2.7);
  if (weakMonths.length > 0) insights.push({
    type: 'amber', title: `${weakMonths.length} tháng dưới điểm hòa vốn`,
    body: `${weakMonths.map(m => m.thang).join(', ')} — DT dưới 2,7 tỷ. Cần pipeline dự phòng 3–6 tháng để tránh tháng lỗ.`,
  });
  if (cpVHPct > 13 && cpVHPct <= 15) insights.push({
    type: 'amber', title: `CP vận hành ${cpVHPct.toFixed(1)}% — sát giới hạn`,
    body: `Có thể có CP setup VP một lần trong kỳ. Loại CP này, CP VH thực chỉ ~${(cpVHPct-3.6).toFixed(1)}% DT — trong kiểm soát tốt.`,
  });
  const best = [...monthly].sort((a, b) => b.dtHH - a.dtHH)[0];
  if (best) insights.push({
    type: 'green', title: `${best.thang} — tháng tốt nhất (DT ${best.dtHH.toFixed(2)} tỷ)`,
    body: `${best.soCan} căn, doanh số ${best.doanhSo.toFixed(1)} tỷ. Momentum tích cực, cần duy trì và nhân rộng.`,
  });
  if (avgDS >= 58) insights.push({
    type: 'green', title: `Doanh số vượt kế hoạch +${((avgDS/58-1)*100).toFixed(0)}%`,
    body: `BQ ${avgDS.toFixed(1)} tỷ/tháng vs mục tiêu 58 tỷ. Năng lực giao dịch mạnh, cần chuyển hóa thành lợi nhuận bằng kiểm soát HH.`,
  });

  return { pnlRows, kpis, monthly, insights, lnPct, hhPct, avgDS, dtMG };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtTy = (v: number) => `${v.toFixed(2)} tỷ`;

const pnlColor = (type: string) =>
  ({ pos: '#6366f1', neg: '#ef4444', warn: '#f59e0b', mid: '#10b981', result: '#6366f1' }[type] ?? '#6366f1');

const statusStyle = (s: string) => ({
  green: { bg: 'var(--success-bg)', text: 'var(--success-text)', border: 'var(--success-border)' },
  red:   { bg: 'var(--danger-bg)',  text: 'var(--danger-text)',  border: 'var(--danger-border)' },
  amber: { bg: 'var(--warning-bg)', text: 'var(--warning-text)', border: 'var(--warning-border)' },
}[s] ?? { bg: 'var(--info-bg)', text: 'var(--info-text)', border: 'var(--info-border)' });

const insightStyle = (t: string) => ({
  red:   { bg: 'var(--danger-bg)',  text: 'var(--danger-text)',  accent: '#e24b4a' },
  amber: { bg: 'var(--warning-bg)', text: 'var(--warning-text)', accent: '#d97706' },
  green: { bg: 'var(--success-bg)', text: 'var(--success-text)', accent: '#059669' },
}[t] ?? { bg: 'var(--info-bg)', text: 'var(--info-text)', accent: '#3b82f6' });

const CustomTooltipDS = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-title)' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>{p.name}: {fmtTy(p.value)}</p>
      ))}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TaiChinhPage() {
  const [rawData, setRawData] = useState<RawData>(DEFAULT_RAW);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { pnlRows, kpis, monthly, insights, lnPct, hhPct, avgDS, dtMG } =
    useMemo(() => computeDisplay(rawData), [rawData]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/tai-chinh/history');
      if (res.ok) setHistory(await res.json());
    } catch { /* silent */ } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, []);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setUploadError('Chỉ hỗ trợ file .xlsx hoặc .xls');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/tai-chinh/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lỗi không xác định');
      setRawData(json as RawData);
      // Refresh history list after a short delay (GSheets write is async)
      setTimeout(fetchHistory, 3000);
    } catch (e: any) {
      setUploadError(e.message ?? 'Lỗi phân tích file');
    } finally {
      setUploading(false);
    }
  };

  const handleLoadHistory = async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/tai-chinh/history/${id}`);
      if (!res.ok) throw new Error('Không tải được báo cáo');
      setRawData(await res.json());
      setHistoryOpen(false);
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setLoadingId(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/tai-chinh/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rawData),
      });
      if (!res.ok) throw new Error('Export lỗi');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `VH_BaoCao_TaiChinh_${rawData.period.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setUploadError(e.message ?? 'Lỗi xuất file');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Header + actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-title)', marginBottom: 4 }}>
            Dashboard Tài chính
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Victory Holdings — Kết quả HĐKD lũy kế <strong>{rawData.period}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
              background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '0.8rem', fontWeight: 600,
              opacity: uploading ? 0.7 : 1,
            }}
          >
            <Upload size={14} />
            {uploading ? 'Đang phân tích...' : 'Upload file .xlsx'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, cursor: exporting ? 'not-allowed' : 'pointer',
              background: 'var(--bg-card)', color: 'var(--text-body)',
              border: '1px solid var(--border-light)', fontSize: '0.8rem', fontWeight: 600,
              opacity: exporting ? 0.7 : 1,
            }}
          >
            <Download size={14} />
            {exporting ? 'Đang xuất...' : 'Xuất Word (BGĐ)'}
          </button>
        </div>
      </div>

      {/* File info bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
        background: 'var(--bg-page)', borderRadius: 8, marginBottom: 16,
        border: '1px solid var(--border-lighter)', fontSize: '0.78rem', color: 'var(--text-muted)',
      }}>
        <FileSpreadsheet size={14} style={{ flexShrink: 0 }} />
        <span>Nguồn: <strong style={{ color: 'var(--text-body)' }}>{rawData.filename}</strong></span>
        <span style={{ marginLeft: 'auto' }}>Kỳ báo cáo: <strong style={{ color: 'var(--text-body)' }}>{rawData.period}</strong></span>
      </div>

      {/* Upload error */}
      {uploadError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14,
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 8, fontSize: '0.8rem', color: 'var(--danger-text)',
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{uploadError}</span>
          <button onClick={() => setUploadError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--danger-text)' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpis.map((k) => {
          const Icon = k.icon;
          const s = statusStyle(k.status);
          return (
            <div key={k.label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-light)',
              borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${s.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} style={{ color: s.text }} />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{k.label}</span>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-title)', marginBottom: 2 }}>{k.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>{k.sub}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-label)', marginBottom: 4 }}>{k.target}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: s.text, background: s.bg, padding: '3px 8px', borderRadius: 6, display: 'inline-block' }}>
                {k.note}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)', marginBottom: 4 }}>DOANH SỐ & DOANH THU THEO THÁNG</div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            {[{ color: '#818cf8', label: 'Doanh số (tỷ)' }, { color: '#10b981', label: 'DT môi giới (tỷ)' }, { color: '#ef4444', label: 'Mục tiêu DS 58 tỷ', dashed: true }].map(l => (
              <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span style={{ width: 12, height: l.dashed ? 2 : 10, borderRadius: l.dashed ? 0 : 2, background: l.color, borderTop: l.dashed ? `2px dashed ${l.color}` : undefined, display: 'inline-block' }} />
                {l.label}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `${v}tỷ`} />
              <Tooltip content={<CustomTooltipDS />} />
              <ReferenceLine y={58} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5} />
              <Bar dataKey="doanhSo" name="Doanh số" fill="#818cf8" radius={[3,3,0,0]} />
              <Bar dataKey="dtHH" name="DT môi giới" fill="#10b981" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)', marginBottom: 4 }}>SỐ CĂN BÁN THEO THÁNG</div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            {[{ color: '#10b981', label: '≥ 6 căn (đạt)' }, { color: '#f87171', label: '< 6 căn (thiếu)' }, { color: '#ef4444', label: 'Mục tiêu 6 căn', dashed: true }].map(l => (
              <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span style={{ width: 12, height: l.dashed ? 2 : 10, borderRadius: l.dashed ? 0 : 2, background: l.color, borderTop: l.dashed ? `2px dashed ${l.color}` : undefined, display: 'inline-block' }} />
                {l.label}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} domain={[0, Math.max(13, ...monthly.map(m => m.soCan + 2))]} />
              <Tooltip formatter={(v: any) => [`${v} căn`, 'Số căn']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <ReferenceLine y={6} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5} />
              <Bar dataKey="soCan" name="Số căn" radius={[4,4,0,0]}>
                {monthly.map(m => <Cell key={m.thang} fill={m.soCan >= 6 ? '#10b981' : '#f87171'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* P&L + Insights */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)', marginBottom: 14 }}>CẤU TRÚC P&amp;L — LŨY KẾ {rawData.period.toUpperCase()} (tỷ VND)</div>
          {pnlRows.map((row, i) => {
            const isResult = row.type === 'result';
            const isMid    = row.type === 'mid';
            const color    = pnlColor(row.type);
            const barW     = Math.abs(row.pct);
            const outside  = barW < 20;
            return (
              <div key={i} style={{ marginBottom: isResult || isMid ? 8 : 5 }}>
                {(isMid || isResult) && <div style={{ height: '0.5px', background: 'var(--border-light)', margin: '6px 0' }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 150, fontSize: '0.75rem', flexShrink: 0, color: isResult || isMid ? 'var(--text-title)' : 'var(--text-muted)', fontWeight: isResult || isMid ? 700 : 400 }}>
                    {row.label}
                  </span>
                  <div style={{ flex: 1, height: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: `${barW}%`, minWidth: 4, height: 18, borderRadius: 3, background: color, opacity: isResult || isMid ? 1 : 0.8, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: outside ? 0 : 6 }}>
                      {!outside && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{row.value > 0 ? '+' : ''}{fmtTy(row.value)}</span>}
                    </div>
                    {outside && <span style={{ fontSize: '0.72rem', fontWeight: 700, color, whiteSpace: 'nowrap' }}>{row.value > 0 ? '+' : ''}{fmtTy(row.value)}</span>}
                  </div>
                  <span style={{ width: 44, textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color, flexShrink: 0 }}>{Math.abs(row.pct).toFixed(1)}%</span>
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-page)', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            MKT: {((rawData.pnl.cpBanHang/rawData.pnl.dtMG)*100).toFixed(1)}% DT ✓ &nbsp;|&nbsp; Thuê VP: 4,1% DT &nbsp;|&nbsp; Hòa vốn: ~2,7 tỷ/tháng
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)', marginBottom: 14 }}>PHÂN TÍCH & KHUYẾN NGHỊ BGĐ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.map((ins, i) => {
              const s = insightStyle(ins.type);
              return (
                <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: s.bg, borderLeft: `3px solid ${s.accent}` }}>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: s.text, marginBottom: 3 }}>{ins.title}</div>
                  <div style={{ fontSize: '0.72rem', color: s.text, lineHeight: 1.55, opacity: 0.85 }}>{ins.body}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Trend line */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)' }}>XU HƯỚNG DOANH THU MÔI GIỚI (tỷ VND)</div>
          <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            {[
              { color: '#6366f1', label: 'DT môi giới', dashed: false },
              { color: '#10b981', label: 'Mục tiêu ≥ 2,3 tỷ', dashed: true },
              { color: '#f59e0b', label: 'Hòa vốn ~2,7 tỷ', dashed: true },
            ].map(l => (
              <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <svg width="22" height="10" style={{ flexShrink: 0 }}>
                  {l.dashed
                    ? <line x1="0" y1="5" x2="22" y2="5" stroke={l.color} strokeWidth="2" strokeDasharray="5,3" />
                    : <line x1="0" y1="5" x2="22" y2="5" stroke={l.color} strokeWidth="2.5" />}
                </svg>
                {l.label}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
            <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `${v}tỷ`} domain={[0, Math.max(5.5, ...monthly.map(m => m.dtHH + 0.5))]} />
            <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} tỷ`, 'DT môi giới']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <ReferenceLine y={2.3} stroke="#10b981" strokeDasharray="5 4" strokeWidth={1.5} />
            <ReferenceLine y={2.7} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
            <Line type="monotone" dataKey="dtHH" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 5, fill: '#6366f1', strokeWidth: 0 }} activeDot={{ r: 7 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* History panel */}
      <div style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, overflow: 'hidden' }}>
        <button
          onClick={() => setHistoryOpen(h => !h)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-title)',
          }}
        >
          <History size={16} style={{ color: 'var(--primary)' }} />
          <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>
            Lịch sử báo cáo {history.length > 0 && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({history.length} kỳ đã lưu)</span>}
          </span>
          {historyLoading && <Loader2 size={14} style={{ marginLeft: 4, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
          <span style={{ marginLeft: 'auto' }}>{historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </button>

        {historyOpen && (
          <div style={{ borderTop: '1px solid var(--border-lighter)', overflowX: 'auto' }}>
            {history.length === 0 ? (
              <div style={{ padding: '20px 18px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Chưa có báo cáo nào được lưu. Hãy upload file .xlsx để bắt đầu.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-page)' }}>
                    {['Ngày upload', 'Kỳ báo cáo', 'Tên file', 'Số căn', 'Doanh số', 'DT môi giới', 'HH Sales', 'LN', 'LN%', ''].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === '' || h === 'Số căn' || h === 'LN%' ? 'center' : 'left', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-lighter)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, i) => {
                    const isActive = rawData.id === row.id;
                    const date = new Date(row.ngay_upload);
                    const dateStr = `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
                    return (
                      <tr key={row.id} style={{ background: isActive ? 'rgba(99,102,241,0.06)' : i % 2 === 0 ? 'transparent' : 'var(--bg-page)' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dateStr}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-title)', whiteSpace: 'nowrap' }}>{row.ky_bao_cao}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-body)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.ten_file}>{row.ten_file}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600 }}>{row.so_can}</td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{row.doanh_so_ty.toFixed(1)} tỷ</td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{row.dt_mg_ty.toFixed(2)} tỷ</td>
                        <td style={{ padding: '9px 12px', color: row.hh_sales_pct > 65 ? 'var(--danger-text)' : 'var(--success-text)', fontWeight: 600, whiteSpace: 'nowrap' }}>{row.hh_sales_pct.toFixed(1)}%</td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{(row.ln_ty * 1000).toFixed(0)} tr</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', color: row.ln_pct >= 20 ? 'var(--success-text)' : row.ln_pct >= 10 ? 'var(--warning-text)' : 'var(--danger-text)', fontWeight: 700 }}>{row.ln_pct.toFixed(1)}%</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          {isActive ? (
                            <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600 }}>Đang xem</span>
                          ) : (
                            <button
                              onClick={() => handleLoadHistory(row.id)}
                              disabled={loadingId === row.id}
                              style={{
                                padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-light)',
                                background: 'var(--bg-card)', color: 'var(--primary)', cursor: 'pointer',
                                fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
                              }}
                            >
                              {loadingId === row.id ? 'Đang tải...' : 'Xem lại'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: '0.72rem', color: 'var(--text-label)', textAlign: 'center' }}>
        Nguồn: {rawData.filename} &nbsp;·&nbsp; Cập nhật: {rawData.period} &nbsp;·&nbsp; Victory Holdings CRM
      </div>
    </div>
  );
}
