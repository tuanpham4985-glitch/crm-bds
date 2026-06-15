'use client';

import { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, PieChart, Pie, Legend, ComposedChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, Target,
  BarChart2, Activity, Layers, ChevronRight,
} from 'lucide-react';

// ─── Số liệu thực tế (T12/25–T5/26) ─────────────────────────────────────────

const ACTUALS = {
  period:         'T12/25–T5/26',
  months:         6,
  gmv:            457.24,   // tỷ VND — giá trị giao dịch bất động sản
  revenue:        15.64,    // tỷ VND — doanh thu môi giới (phí hoa hồng)
  hhSales:        11.00,    // tỷ — hoa hồng trả cho sales
  thuongNong:     0.69,     // tỷ — thưởng nóng cho sales
  cpBH:           0.74,     // tỷ — chi phí bán hàng, marketing
  cpVH:           2.34,     // tỷ — chi phí vận hành văn phòng
  pbt:            0.85,     // tỷ — lợi nhuận trước thuế
  soCan:          32,       // số căn đã giao dịch
  tyLeHoaHong:    3.42,     // % giá trị căn hộ — tỷ lệ phí môi giới
  hhPct:          70.4,     // % doanh thu — tỷ lệ hoa hồng/phí môi giới
};

// Các chỉ số tính từ số liệu thực tế
const LOI_NHUAN_GOC   = ACTUALS.revenue - ACTUALS.hhSales - ACTUALS.thuongNong; // 3.95 tỷ
const BIEN_LN_GOC     = LOI_NHUAN_GOC / ACTUALS.revenue * 100;                  // 25.3%
const LN_TRUOC_KHAU_HAO = ACTUALS.pbt + 0.12;                                   // ước D&A ~120tr
const BIEN_TRKHAO     = LN_TRUOC_KHAU_HAO / ACTUALS.revenue * 100;
const BIEN_LN_TT      = ACTUALS.pbt / ACTUALS.revenue * 100;                    // LN trước thuế / DT
const LN_SAU_THUE     = ACTUALS.pbt * 0.8;                                      // thuế TNDN 20%
const GIA_TRI_BQ_CAN  = ACTUALS.gmv / ACTUALS.soCan;                            // 14.29 tỷ/căn
const DT_BQ_CAN       = ACTUALS.revenue / ACTUALS.soCan;                        // 0.489 tỷ/căn

// Tham số điểm hòa vốn
const TY_LE_CP_BIEN   = (ACTUALS.hhSales + ACTUALS.thuongNong + ACTUALS.cpBH * 0.8) / ACTUALS.revenue; // ~78.5%
const TY_LE_DONG_GOP  = 1 - TY_LE_CP_BIEN;                                      // ~21.5%
const CP_CO_DINH_THANG = ACTUALS.cpVH / ACTUALS.months + ACTUALS.cpBH * 0.2 / ACTUALS.months; // ~0.42 tỷ
const DT_HOA_VON      = CP_CO_DINH_THANG / TY_LE_DONG_GOP;                      // ~1.95 tỷ/tháng
const GMV_HOA_VON     = DT_HOA_VON / (ACTUALS.tyLeHoaHong / 100);               // ~57 tỷ/tháng
const CAN_HOA_VON     = GMV_HOA_VON / GIA_TRI_BQ_CAN;                           // ~4 căn/tháng
const BIEN_AN_TOAN    = (ACTUALS.revenue / ACTUALS.months - DT_HOA_VON) / (ACTUALS.revenue / ACTUALS.months) * 100;

// Số liệu theo tháng
const THEO_THANG = [
  { thang: 'T12/25', gmv: 73.6,  dt: 2.45, can: 3 },
  { thang: 'T1/26',  gmv: 115.5, dt: 3.91, can: 11 },
  { thang: 'T2/26',  gmv: 19.9,  dt: 0.62, can: 2 },
  { thang: 'T3/26',  gmv: 60.5,  dt: 1.81, can: 3 },
  { thang: 'T4/26',  gmv: 66.9,  dt: 2.15, can: 7 },
  { thang: 'T5/26',  gmv: 120.7, dt: 4.62, can: 7 },
].map((m, i, arr) => ({
  ...m,
  lnTT:      +(m.dt * TY_LE_DONG_GOP - CP_CO_DINH_THANG).toFixed(3),
  lnGoc:     +(m.dt * (1 - (ACTUALS.hhSales + ACTUALS.thuongNong) / ACTUALS.revenue)).toFixed(3),
  soThang:   i === 0 ? 0 : +((m.dt / arr[i-1].dt - 1) * 100).toFixed(1),
  bienLNGoc: +((m.dt * (1 - (ACTUALS.hhSales + ACTUALS.thuongNong) / ACTUALS.revenue)) / m.dt * 100).toFixed(1),
}));

// Biểu đồ cơ cấu chi phí — màu sắc tương phản rõ ràng
const CO_CAU_CHI_PHI = [
  { name: 'Hoa hồng Sales',     value: ACTUALS.hhSales,    color: '#ef4444' }, // Đỏ
  { name: 'Chi phí vận hành',   value: ACTUALS.cpVH,       color: '#3b82f6' }, // Xanh dương
  { name: 'Chi phí bán hàng',   value: ACTUALS.cpBH,       color: '#10b981' }, // Xanh lá
  { name: 'Thưởng nóng Sales',  value: ACTUALS.thuongNong, color: '#f59e0b' }, // Vàng cam
];

// Bảng chi phí chi tiết
const CHI_PHI_CHI_TIET = [
  { cat: 'Chi phí trực tiếp', item: 'Hoa hồng Sales',          amount: 11.00, pctDT: 70.4, pctTotal: 74.5, phanLoai: 'Biến đổi',         status: 'red' },
  { cat: 'Chi phí trực tiếp', item: 'Thưởng nóng Sales',       amount: 0.69,  pctDT: 4.4,  pctTotal: 4.7,  phanLoai: 'Biến đổi',         status: 'ok' },
  { cat: 'Bán hàng',          item: 'MKT / Event / Lương KD',  amount: 0.74,  pctDT: 4.8,  pctTotal: 5.0,  phanLoai: 'Bán cố định',      status: 'warn' },
  { cat: 'Vận hành',          item: 'Lương văn phòng',         amount: 0.80,  pctDT: 5.1,  pctTotal: 5.4,  phanLoai: 'Cố định',          status: 'warn' },
  { cat: 'Vận hành',          item: 'Thuê văn phòng',          amount: 0.70,  pctDT: 4.5,  pctTotal: 4.7,  phanLoai: 'Cố định',          status: 'red' },
  { cat: 'Vận hành',          item: 'Bảo hiểm xã hội',        amount: 0.15,  pctDT: 1.0,  pctTotal: 1.0,  phanLoai: 'Cố định',          status: 'ok' },
  { cat: 'Vận hành',          item: 'Thiết bị / CCDC (1 lần)', amount: 0.30,  pctDT: 1.9,  pctTotal: 2.0,  phanLoai: 'Phát sinh 1 lần',  status: 'warn' },
  { cat: 'Vận hành',          item: 'Điện / Nước / Internet',  amount: 0.39,  pctDT: 2.5,  pctTotal: 2.6,  phanLoai: 'Cố định',          status: 'ok' },
];

// Kịch bản rủi ro
const KICH_BAN = [
  { ten: 'Hiện tại',        dtThang: ACTUALS.revenue/ACTUALS.months,         moTa: 'Số liệu thực tế',             lnTT: ACTUALS.pbt/ACTUALS.months,                                                                     color: '#6366f1' },
  { ten: 'A: DS −20%',      dtThang: ACTUALS.revenue/ACTUALS.months*0.8,     moTa: 'Doanh số giảm 20%',           lnTT: +(ACTUALS.revenue/ACTUALS.months*0.8*TY_LE_DONG_GOP - CP_CO_DINH_THANG),                         color: '#ef4444' },
  { ten: 'B: HH +5%',       dtThang: ACTUALS.revenue/ACTUALS.months,         moTa: 'Hoa hồng tăng thêm 5% DT',   lnTT: +(ACTUALS.revenue/ACTUALS.months*(TY_LE_DONG_GOP-0.05) - CP_CO_DINH_THANG),                       color: '#ef4444' },
  { ten: 'C: MKT +30%',     dtThang: ACTUALS.revenue/ACTUALS.months,         moTa: 'Chi phí MKT tăng 30%',        lnTT: +(ACTUALS.revenue/ACTUALS.months*TY_LE_DONG_GOP - CP_CO_DINH_THANG - ACTUALS.cpBH*0.3/ACTUALS.months), color: '#f59e0b' },
  { ten: 'D: Thêm VP',      dtThang: ACTUALS.revenue/ACTUALS.months,         moTa: 'Mở thêm văn phòng +0.25 tỷ', lnTT: +(ACTUALS.revenue/ACTUALS.months*TY_LE_DONG_GOP - CP_CO_DINH_THANG - 0.25),                       color: '#f59e0b' },
  { ten: 'D+: VP & DS×1.4', dtThang: ACTUALS.revenue/ACTUALS.months*1.4,     moTa: 'Mở VP + Doanh số tăng 40%',  lnTT: +(ACTUALS.revenue/ACTUALS.months*1.4*TY_LE_DONG_GOP - CP_CO_DINH_THANG - 0.25),                  color: '#10b981' },
];

// Biểu đồ điểm hòa vốn
const BIEU_DO_HOA_VON = Array.from({ length: 20 }, (_, i) => {
  const dt = (i + 1) * 0.4;
  return { dt: +dt.toFixed(1), lnTT: +(dt * TY_LE_DONG_GOP - CP_CO_DINH_THANG).toFixed(3) };
});

// Dự báo H2/2026
const THANG_H2 = ['T6/26', 'T7/26', 'T8/26', 'T9/26', 'T10/26', 'T11/26'];
const DU_BAO = {
  xau:  [2.5, 1.5, 1.6, 2.0, 2.5, 2.8],
  coso: [3.5, 2.0, 2.2, 2.8, 3.5, 4.0],
  tot:  [4.5, 3.0, 3.2, 3.8, 4.5, 5.5],
};
const DU_BAO_DATA = THANG_H2.map((m, i) => ({
  thang: m,
  'Kịch bản xấu':    DU_BAO.xau[i],
  'Kịch bản cơ sở':  DU_BAO.coso[i],
  'Kịch bản tốt':    DU_BAO.tot[i],
}));
const TONG_H2 = {
  xau:  { dt: DU_BAO.xau.reduce((a,b)=>a+b,0),  lnTT: +(DU_BAO.xau.reduce((a,b)=>a+b,0)*TY_LE_DONG_GOP  - CP_CO_DINH_THANG*6) },
  coso: { dt: DU_BAO.coso.reduce((a,b)=>a+b,0), lnTT: +(DU_BAO.coso.reduce((a,b)=>a+b,0)*TY_LE_DONG_GOP - CP_CO_DINH_THANG*6) },
  tot:  { dt: DU_BAO.tot.reduce((a,b)=>a+b,0),  lnTT: +(DU_BAO.tot.reduce((a,b)=>a+b,0)*TY_LE_DONG_GOP  - CP_CO_DINH_THANG*6) },
};

// Phân tầng kết quả kinh doanh
const PHAN_TANG = [
  { ten: 'Doanh thu môi giới',       value: ACTUALS.revenue,  type: 'pos' },
  { ten: 'Hoa hồng Sales',           value: -ACTUALS.hhSales, type: 'neg' },
  { ten: 'Thưởng nóng',              value: -ACTUALS.thuongNong, type: 'neg' },
  { ten: 'Lợi nhuận gộp',            value: LOI_NHUAN_GOC,    type: 'sub' },
  { ten: 'Chi phí bán hàng / MKT',   value: -ACTUALS.cpBH,    type: 'neg' },
  { ten: 'Chi phí vận hành',         value: -ACTUALS.cpVH,    type: 'neg' },
  { ten: 'Lợi nhuận trước thuế',     value: ACTUALS.pbt,      type: 'result' },
];

// ─── Hàm tiện ích ────────────────────────────────────────────────────────────

const f2   = (v: number) => v.toFixed(2);
const f1   = (v: number) => v.toFixed(1);
const f0   = (v: number) => v.toFixed(0);
const fPct = (v: number) => `${v.toFixed(1)}%`;

const mauTrangThai = (s: string) => ({
  red:  { text: 'var(--danger-text)',  bg: 'var(--danger-bg)',  border: '#fca5a5' },
  warn: { text: 'var(--warning-text)', bg: 'var(--warning-bg)', border: '#fcd34d' },
  ok:   { text: 'var(--success-text)', bg: 'var(--success-bg)', border: '#6ee7b7' },
}[s] ?? { text: 'var(--text-muted)', bg: 'var(--bg-page)', border: 'var(--border-light)' });

const KPICard = ({ label, value, sub, icon: Icon, color, note }: any) => (
  <div style={{ background: 'var(--bg-card)', border: `1px solid var(--border-light)`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${color}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={15} style={{ color }} />
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
    </div>
    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-title)', marginBottom: 2 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>{sub}</div>}
    {note && <div style={{ fontSize: '0.7rem', color, fontWeight: 600, background: `${color}15`, padding: '2px 7px', borderRadius: 5, display: 'inline-block' }}>{note}</div>}
  </div>
);

const TieuDeMuc = ({ children }: any) => (
  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{children}</div>
);

const The = ({ children, style }: any) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px', ...style }}>{children}</div>
);

const TooltipTuyChon = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-title)' }}>{label}</p>
      {payload.map((p: any) => <p key={p.dataKey} style={{ color: p.color ?? p.fill, margin: '2px 0' }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value} {p.unit ?? 'tỷ'}</p>)}
    </div>
  );
};

// ─── Nội dung từng tab ────────────────────────────────────────────────────────

function TabTongQuan() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 8 thẻ KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KPICard label="Doanh số giao dịch" value={`${f1(ACTUALS.gmv)} tỷ`} sub={`Bình quân ${f1(ACTUALS.gmv/ACTUALS.months)} tỷ/tháng`} icon={DollarSign} color="#6366f1" note={`${ACTUALS.soCan} căn | BQ ${f1(GIA_TRI_BQ_CAN)} tỷ/căn`} />
        <KPICard label="Doanh thu môi giới" value={`${f2(ACTUALS.revenue)} tỷ`} sub={`Bình quân ${f2(ACTUALS.revenue/ACTUALS.months)} tỷ/tháng`} icon={TrendingUp} color="#10b981" note={`Phí môi giới ${f1(ACTUALS.tyLeHoaHong)}% doanh số`} />
        <KPICard label="Lợi nhuận gộp" value={`${f2(LOI_NHUAN_GOC)} tỷ`} sub={`Biên lợi nhuận gộp ${fPct(BIEN_LN_GOC)}`} icon={BarChart2} color="#f59e0b" note="Sau hoa hồng & thưởng nóng" />
        <KPICard label="Lợi nhuận trước khấu hao & thuế" value={`~${f2(LN_TRUOC_KHAU_HAO)} tỷ`} sub={`Biên ${fPct(BIEN_TRKHAO)}`} icon={Activity} color="#8b5cf6" note="Lợi nhuận + khấu hao ước ~120 triệu" />
        <KPICard label="Lợi nhuận trước thuế" value={`${f2(ACTUALS.pbt)} tỷ`} sub={`Biên ${fPct(BIEN_LN_TT)}`} icon={Target} color={BIEN_LN_TT < 10 ? '#ef4444' : '#10b981'} note={BIEN_LN_TT < 10 ? '🔴 Cần cải thiện' : '✅ Đạt'} />
        <KPICard label="Lợi nhuận sau thuế (ước tính)" value={`~${f2(LN_SAU_THUE)} tỷ`} sub="Giả định thuế thu nhập DN 20%" icon={DollarSign} color="#64748b" note="Áp dụng cho doanh nghiệp vừa nhỏ" />
        <KPICard label="Doanh thu hòa vốn" value={`${f2(DT_HOA_VON)} tỷ/tháng`} sub={`Doanh số HV: ${f1(GMV_HOA_VON)} tỷ | ${Math.ceil(CAN_HOA_VON)} căn`} icon={AlertTriangle} color="#f59e0b" note={`Biên an toàn ${fPct(BIEN_AN_TOAN)}`} />
        <KPICard label="Hoa hồng Sales / Doanh thu" value={fPct(ACTUALS.hhPct)} sub="Mức tốt ≤ 65%" icon={TrendingDown} color="#ef4444" note={`🔴 Cao hơn chuẩn +${f1(ACTUALS.hhPct-65)}%`} />
      </div>

      {/* Biểu đồ doanh thu & lợi nhuận */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <The>
          <TieuDeMuc>Doanh thu & Lợi nhuận trước thuế theo tháng</TieuDeMuc>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={THEO_THANG}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis yAxisId="dt"  tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v=>`${v}tỷ`} />
              <YAxis yAxisId="ln" orientation="right" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v=>`${v}tỷ`} />
              <Tooltip content={<TooltipTuyChon />} />
              <ReferenceLine yAxisId="dt" y={DT_HOA_VON} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: 'Hòa vốn', position: 'left', fontSize: 10, fill: '#ef4444' }} />
              <Bar yAxisId="dt" dataKey="dt" name="Doanh thu môi giới" fill="#818cf8" radius={[3,3,0,0]} />
              <Line yAxisId="ln" type="monotone" dataKey="lnTT" name="Lợi nhuận trước thuế" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: '#10b981' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </The>

        <The>
          <TieuDeMuc>Cơ cấu chi phí (6 tháng)</TieuDeMuc>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={CO_CAU_CHI_PHI} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={32}
                label={({ percent }: { percent?: number }) => `${((percent ?? 0)*100).toFixed(0)}%`}
                labelLine={false}>
                {CO_CAU_CHI_PHI.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} tỷ`, '']} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: '0.72rem' }} />
            </PieChart>
          </ResponsiveContainer>
        </The>
      </div>

      {/* Phân tầng kết quả kinh doanh */}
      <The>
        <TieuDeMuc>Kết quả kinh doanh theo từng bước — Lũy kế {ACTUALS.period} (tỷ VND)</TieuDeMuc>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PHAN_TANG.map((row) => {
            const isNeg = row.type === 'neg';
            const isSub = row.type === 'sub';
            const isResult = row.type === 'result';
            const color = isSub ? '#10b981' : isResult ? '#6366f1' : isNeg ? '#ef4444' : '#818cf8';
            const barWidth = Math.abs(row.value) / ACTUALS.revenue * 100;
            const outside = barWidth < 15;
            if (isSub || isResult) return (
              <div key={row.ten} style={{ padding: '4px 0', borderTop: '1px solid var(--border-light)', marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 200, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-title)', flexShrink: 0 }}>{row.ten}</span>
                  <span style={{ fontWeight: 700, color, fontSize: '0.88rem' }}>{row.value > 0 ? '+' : ''}{f2(row.value)} tỷ</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, color }}>{fPct(row.value/ACTUALS.revenue*100)}</span>
                </div>
              </div>
            );
            return (
              <div key={row.ten} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 200, fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{row.ten}</span>
                <div style={{ flex: 1, height: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: `${barWidth}%`, height: 20, minWidth: 4, borderRadius: 3, background: color, opacity: 0.85, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: outside ? 0 : 6 }}>
                    {!outside && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{f2(Math.abs(row.value))} tỷ</span>}
                  </div>
                  {outside && <span style={{ fontSize: '0.72rem', fontWeight: 700, color, whiteSpace: 'nowrap' }}>{f2(Math.abs(row.value))} tỷ</span>}
                </div>
                <span style={{ width: 44, textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color, flexShrink: 0 }}>{fPct(Math.abs(row.value)/ACTUALS.revenue*100)}</span>
              </div>
            );
          })}
        </div>
      </The>
    </div>
  );
}

function TabDoanhSo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <The>
          <TieuDeMuc>Doanh số giao dịch & Số căn theo tháng</TieuDeMuc>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={THEO_THANG}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis yAxisId="gmv" tick={{ fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
              <YAxis yAxisId="can" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip content={<TooltipTuyChon />} />
              <Bar yAxisId="gmv" dataKey="gmv" name="Doanh số giao dịch" fill="#818cf8" radius={[3,3,0,0]}>
                {THEO_THANG.map(m => <Cell key={m.thang} fill={m.gmv >= GMV_HOA_VON ? '#818cf8' : '#fca5a5'} />)}
              </Bar>
              <Line yAxisId="can" type="monotone" dataKey="can" name="Số căn" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} unit=" căn" />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>
            🔴 Màu đỏ = tháng dưới mức hòa vốn ({f1(GMV_HOA_VON)} tỷ/tháng)
          </div>
        </The>

        <The>
          <TieuDeMuc>Tăng trưởng doanh thu so với tháng trước (%)</TieuDeMuc>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={THEO_THANG.slice(1)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}%`} />
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'So tháng trước']} />
              <ReferenceLine y={0} stroke="var(--border-light)" />
              <Bar dataKey="soThang" name="Tăng trưởng" radius={[3,3,0,0]}>
                {THEO_THANG.slice(1).map(m => <Cell key={m.thang} fill={m.soThang >= 0 ? '#10b981' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </The>
      </div>

      {/* Bảng KPI theo tháng */}
      <The>
        <TieuDeMuc>Chi tiết kết quả kinh doanh theo tháng</TieuDeMuc>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)' }}>
                {['Tháng','DS giao dịch (tỷ)','Doanh thu MG (tỷ)','Lợi nhuận gộp (tỷ)','Biên LP gộp','LN trước thuế (tỷ)','Số căn','Giá trị BQ/căn (tỷ)','So tháng trước'].map((h, hi) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: hi === 0 ? 'left' : 'right', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-lighter)', fontSize: '0.72rem' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {THEO_THANG.map((m, i) => (
                <tr key={m.thang} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-page)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-title)' }}>{m.thang}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{f1(m.gmv)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: m.dt >= DT_HOA_VON ? 'var(--success-text)' : 'var(--danger-text)' }}>{f2(m.dt)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{f2(m.lnGoc)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fPct(m.bienLNGoc)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: m.lnTT >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>{m.lnTT >= 0 ? '+' : ''}{f2(m.lnTT)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{m.can}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{m.can > 0 ? f1(m.gmv/m.can) : '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: m.soThang > 0 ? 'var(--success-text)' : m.soThang < 0 ? 'var(--danger-text)' : 'var(--text-muted)' }}>{i === 0 ? '—' : `${m.soThang > 0 ? '+' : ''}${f1(m.soThang)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </The>

      {/* Placeholder dự án & sales */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {['Phân tích theo Dự án', 'Top Nhân viên Kinh doanh'].map(title => (
          <The key={title}>
            <TieuDeMuc>{title}</TieuDeMuc>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 10 }}>
              <Layers size={36} style={{ color: 'var(--text-label)', opacity: 0.4 }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Cần dữ liệu chi tiết hơn</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-label)', lineHeight: 1.5 }}>
                  Thêm cột Dự án & Nhân viên vào sheet<br />
                  <code style={{ background: 'var(--bg-page)', padding: '1px 6px', borderRadius: 3 }}>TH DT-HH</code> để hiển thị biểu đồ này
                </div>
              </div>
            </div>
          </The>
        ))}
      </div>
    </div>
  );
}

function TabLoiNhuan() {
  const duLieuBien = THEO_THANG.map(m => ({
    thang: m.thang,
    bienLNGoc: m.bienLNGoc,
    bienLNTT:  +(m.lnTT / m.dt * 100).toFixed(1),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Biên lợi nhuận gộp',                value: fPct(BIEN_LN_GOC),    note: 'Mức tốt > 30%',  color: BIEN_LN_GOC > 30 ? '#10b981' : '#f59e0b' },
          { label: 'Biên lợi nhuận trước khấu hao & thuế', value: fPct(BIEN_TRKHAO), note: 'Mức tốt > 15%',  color: BIEN_TRKHAO > 15 ? '#10b981' : '#ef4444' },
          { label: 'Biên lợi nhuận trước thuế',          value: fPct(BIEN_LN_TT),    note: 'Mức tốt > 15%',  color: BIEN_LN_TT > 15 ? '#10b981' : '#ef4444' },
          { label: 'Tỷ lệ hoa hồng Sales',               value: fPct(ACTUALS.hhPct), note: 'Mức tốt < 65%',  color: ACTUALS.hhPct > 65 ? '#ef4444' : '#10b981' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid var(--border-light)`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: k.color, marginBottom: 4 }}>{k.value}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-label)' }}>{k.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <The>
          <TieuDeMuc>Xu hướng biên lợi nhuận theo tháng (%)</TieuDeMuc>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={duLieuBien}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}%`} domain={[-20, 40]} />
              <Tooltip formatter={(v:any) => [`${Number(v).toFixed(1)}%`, '']} />
              <ReferenceLine y={0} stroke="var(--border-light)" strokeWidth={2} />
              <Line type="monotone" dataKey="bienLNGoc" name="Biên lợi nhuận gộp" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="bienLNTT"  name="Biên lợi nhuận trước thuế" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} />
              <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
            </LineChart>
          </ResponsiveContainer>
        </The>

        <The>
          <TieuDeMuc>Doanh thu vs Tổng chi phí theo tháng (tỷ)</TieuDeMuc>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={THEO_THANG}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
              <Tooltip content={<TooltipTuyChon />} />
              <Bar dataKey="dt" name="Doanh thu môi giới" fill="#818cf8" radius={[3,3,0,0]} />
              <Bar dataKey={(d) => +(d.dt - d.lnTT).toFixed(2)} name="Tổng chi phí" fill="#fca5a5" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </The>
      </div>

      <The>
        <TieuDeMuc>Phân tích giả định: Nếu hoa hồng Sales giảm xuống...</TieuDeMuc>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)' }}>
                {['Hoa hồng Sales (%)', 'Hoa hồng (tỷ)', 'Lợi nhuận gộp', 'Biên LP gộp', 'LN trước thuế (ước)', 'Biên LN trước thuế', 'Cải thiện thêm'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-lighter)', fontSize: '0.72rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[70.4, 68, 65, 62, 60].map((hhPct, i) => {
                const hh      = ACTUALS.revenue * hhPct / 100;
                const gp      = ACTUALS.revenue - hh - ACTUALS.thuongNong;
                const gpM     = gp / ACTUALS.revenue * 100;
                const varRate = (hh + ACTUALS.thuongNong + ACTUALS.cpBH * 0.8) / ACTUALS.revenue;
                const pbt     = ACTUALS.revenue * (1 - varRate) - ACTUALS.cpVH - ACTUALS.cpBH * 0.2;
                const pbtM    = pbt / ACTUALS.revenue * 100;
                const diff    = pbt - ACTUALS.pbt;
                const isBase  = hhPct === 70.4;
                return (
                  <tr key={hhPct} style={{ background: isBase ? 'rgba(99,102,241,0.05)' : i % 2 === 0 ? 'transparent' : 'var(--bg-page)', fontWeight: isBase ? 700 : 400 }}>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: hhPct > 65 ? 'var(--danger-text)' : 'var(--success-text)', fontWeight: 700 }}>{fPct(hhPct)} {isBase && '← Hiện tại'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(hh)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(gp)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: gpM > 30 ? 'var(--success-text)' : 'var(--text-body)' }}>{fPct(gpM)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: pbt > 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>{f2(pbt)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fPct(pbtM)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: diff > 0 ? 'var(--success-text)' : 'var(--text-muted)', fontWeight: 600 }}>{diff > 0 ? `+${f2(diff)} tỷ` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--warning-text)', background: 'var(--warning-bg)', padding: '6px 10px', borderRadius: 6 }}>
          ⚠ Nếu cắt hoa hồng từ 70.4% → 65%: Lợi nhuận trước thuế tăng thêm ~0.85 tỷ (tương đương nhân đôi lợi nhuận cả kỳ)
        </div>
      </The>
    </div>
  );
}

function TabChiPhi() {
  const cpCoDinh = ACTUALS.cpVH + ACTUALS.cpBH * 0.2;
  const cpBienDoi = ACTUALS.hhSales + ACTUALS.thuongNong + ACTUALS.cpBH * 0.8;

  const cpTheoThang = THEO_THANG.map(m => ({
    thang: m.thang,
    cpBienDoi: +(m.dt * TY_LE_CP_BIEN).toFixed(3),
    cpCoDinh:  +CP_CO_DINH_THANG.toFixed(3),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Chi phí cố định (6 tháng)', value: `${f2(cpCoDinh)} tỷ`,    sub: `${f2(CP_CO_DINH_THANG)} tỷ/tháng`,            color: '#6366f1', note: `${fPct(cpCoDinh/ACTUALS.revenue*100)} doanh thu` },
          { label: 'Chi phí biến đổi (6 tháng)', value: `${f2(cpBienDoi)} tỷ`,  sub: `${fPct(TY_LE_CP_BIEN*100)} mỗi đồng doanh thu`, color: '#ef4444', note: `Tỷ lệ đóng góp: ${fPct(TY_LE_DONG_GOP*100)}` },
          { label: 'Tổng chi phí (6 tháng)',    value: `${f2(cpCoDinh+cpBienDoi)} tỷ`, sub: `${fPct((cpCoDinh+cpBienDoi)/ACTUALS.revenue*100)} doanh thu`, color: '#f59e0b', note: `Còn lại: ${f2(ACTUALS.pbt)} tỷ lợi nhuận` },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid var(--border-light)`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-title)', marginBottom: 2 }}>{k.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>{k.sub}</div>
            <div style={{ fontSize: '0.68rem', color: k.color, fontWeight: 600, background: `${k.color}15`, padding: '2px 7px', borderRadius: 5, display: 'inline-block' }}>{k.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <The>
          <TieuDeMuc>Chi phí cố định & Biến đổi theo tháng (tỷ)</TieuDeMuc>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cpTheoThang}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
              <Tooltip content={<TooltipTuyChon />} />
              <Bar dataKey="cpBienDoi" name="Chi phí biến đổi" fill="#fca5a5" stackId="a" />
              <Bar dataKey="cpCoDinh"  name="Chi phí cố định"  fill="#818cf8" stackId="a" radius={[3,3,0,0]} />
              <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
            </BarChart>
          </ResponsiveContainer>
        </The>

        <The>
          <TieuDeMuc>Phân bổ: Cố định vs Biến đổi</TieuDeMuc>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Chi phí biến đổi', value: cpBienDoi, color: '#fca5a5' },
                  { name: 'Chi phí cố định',   value: cpCoDinh,  color: '#818cf8' },
                ]}
                dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={28}
                label={({ name, percent }: { name?: string; percent?: number }) => `${((percent ?? 0)*100).toFixed(0)}%`}
                labelLine={false}>
                {[{ color: '#fca5a5' }, { color: '#818cf8' }].map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v:any) => [`${Number(v).toFixed(2)} tỷ`, '']} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: '0.72rem' }} />
            </PieChart>
          </ResponsiveContainer>
        </The>
      </div>

      <The>
        <TieuDeMuc>Bảng chi phí chi tiết — tỷ lệ và đánh giá</TieuDeMuc>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)' }}>
              {['Nhóm', 'Khoản mục', 'Số tiền (tỷ)', '% Doanh thu', '% Tổng CP', 'Phân loại', 'Đánh giá'].map((h, hi) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: hi >= 2 && hi <= 4 ? 'right' : 'left', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-lighter)', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHI_PHI_CHI_TIET.map((r, i) => {
              const c = mauTrangThai(r.status);
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-page)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{r.cat}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.item}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(r.amount)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: r.pctDT > 20 ? 'var(--danger-text)' : 'var(--text-body)' }}>{fPct(r.pctDT)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fPct(r.pctTotal)}</td>
                  <td style={{ padding: '8px 12px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{r.phanLoai}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: c.text, background: c.bg, padding: '2px 8px', borderRadius: 4 }}>
                      {r.status === 'red' ? '🔴 Cần kiểm soát' : r.status === 'warn' ? '⚠️ Theo dõi' : '✅ Ổn định'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 10, fontSize: '0.7rem', color: 'var(--text-label)', fontStyle: 'italic' }}>
          * Chi tiết nội bộ chi phí vận hành (2.34 tỷ) là ước tính theo chuẩn ngành. Cần kiểm tra thực tế để xác nhận từng khoản.
        </div>
      </The>
    </div>
  );
}

function TabHoaVon() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Doanh thu hòa vốn',  value: `${f2(DT_HOA_VON)} tỷ/tháng`,    sub: 'Doanh thu tối thiểu phải đạt', color: '#f59e0b' },
          { label: 'Doanh số hòa vốn',   value: `${f1(GMV_HOA_VON)} tỷ/tháng`,   sub: 'Doanh số giao dịch tối thiểu', color: '#f59e0b' },
          { label: 'Số căn hòa vốn',     value: `${Math.ceil(CAN_HOA_VON)} căn/tháng`, sub: 'Số căn giao dịch tối thiểu',   color: '#f59e0b' },
          { label: 'Biên an toàn',       value: fPct(BIEN_AN_TOAN), sub: `Bình quân ${f2(ACTUALS.revenue/ACTUALS.months)} tỷ vs hòa vốn ${f2(DT_HOA_VON)} tỷ`, color: BIEN_AN_TOAN > 30 ? '#10b981' : '#f59e0b' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid var(--border-light)`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: k.color, marginBottom: 4 }}>{k.value}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-label)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <The>
          <TieuDeMuc>Biểu đồ điểm hòa vốn — Lợi nhuận theo Doanh thu (tỷ)</TieuDeMuc>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={BIEU_DO_HOA_VON}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="dt" tick={{ fontSize: 11 }} label={{ value: 'Doanh thu môi giới (tỷ)', position: 'insideBottom', offset: -5, fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
              <Tooltip formatter={(v:any) => [`${Number(v).toFixed(3)} tỷ`, 'Lợi nhuận trước thuế']} labelFormatter={v=>`Doanh thu = ${v} tỷ`} />
              <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} label={{ value: 'Điểm hòa vốn', position: 'right', fontSize: 11, fill: '#ef4444' }} />
              <ReferenceLine x={ACTUALS.revenue/ACTUALS.months} stroke="#6366f1" strokeDasharray="5 4" label={{ value: 'Bình quân hiện tại', position: 'top', fontSize: 10, fill: '#6366f1' }} />
              <Line type="linear" dataKey="lnTT" name="Lợi nhuận trước thuế" stroke="#10b981" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-page)', padding: '6px 10px', borderRadius: 6 }}>
            Hòa vốn: Doanh thu = {f2(DT_HOA_VON)} tỷ/tháng | Doanh số = {f1(GMV_HOA_VON)} tỷ | {Math.ceil(CAN_HOA_VON)} căn/tháng
          </div>
        </The>

        <The>
          <TieuDeMuc>Cơ cấu lợi nhuận đóng góp</TieuDeMuc>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {[
              { label: 'Doanh thu',                       pct: 100,                                          color: '#818cf8' },
              { label: 'Hoa hồng Sales',                  pct: -ACTUALS.hhPct,                               color: '#ef4444' },
              { label: 'Thưởng nóng',                     pct: -(ACTUALS.thuongNong/ACTUALS.revenue*100),    color: '#f97316' },
              { label: 'Chi phí bán hàng (80% biến đổi)', pct: -(ACTUALS.cpBH*0.8/ACTUALS.revenue*100),     color: '#f59e0b' },
              { label: '→ Tỷ lệ đóng góp',                pct: TY_LE_DONG_GOP*100,                           color: '#10b981', bold: true },
              { label: 'Chi phí cố định / DT bình quân',  pct: -(CP_CO_DINH_THANG/(ACTUALS.revenue/ACTUALS.months)*100), color: '#6366f1' },
              { label: '→ Biên lợi nhuận trước thuế bình quân', pct: BIEN_LN_TT,                            color: '#8b5cf6', bold: true },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 195, fontSize: '0.7rem', fontWeight: r.bold ? 700 : 400, color: r.bold ? 'var(--text-title)' : 'var(--text-muted)', flexShrink: 0 }}>{r.label}</span>
                <div style={{ flex: 1, height: 16, borderRadius: 3, background: `${r.color}25`, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.abs(r.pct)}%`, height: '100%', background: r.color, opacity: 0.8 }} />
                </div>
                <span style={{ width: 50, textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, color: r.color, flexShrink: 0 }}>{r.pct > 0 ? '+' : ''}{f1(r.pct)}%</span>
              </div>
            ))}
          </div>
        </The>
      </div>

      <The>
        <TieuDeMuc>Mô phỏng các kịch bản rủi ro — Tác động đến lợi nhuận</TieuDeMuc>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {KICH_BAN.map(s => (
            <div key={s.ten} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-page)', border: `1px solid ${s.lnTT < 0 ? '#fca5a5' : s.lnTT < 0.05 ? '#fcd34d' : '#6ee7b7'}`, borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-title)', marginBottom: 4 }}>{s.ten}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8 }}>{s.moTa}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: s.lnTT < 0 ? 'var(--danger-text)' : s.lnTT < 0.05 ? 'var(--warning-text)' : 'var(--success-text)' }}>
                {s.lnTT >= 0 ? '+' : ''}{f2(s.lnTT)} tỷ/tháng
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-label)', marginTop: 4 }}>
                {s.lnTT < 0 ? '❌ Thua lỗ' : s.lnTT < 0.05 ? '⚠️ Gần hòa vốn' : '✅ Có lãi'}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--danger-text)', background: 'var(--danger-bg)', padding: '8px 12px', borderRadius: 6, lineHeight: 1.6 }}>
          🔴 <strong>Cảnh báo:</strong> 5/6 kịch bản đều gần hoặc âm lợi nhuận. Biên an toàn chỉ {fPct(BIEN_AN_TOAN)} — cần tập trung cắt giảm hoa hồng trước khi mở rộng.
        </div>
      </The>
    </div>
  );
}

function TabDuBao() {
  const mucTieu = [
    { label: '500 triệu/tháng', lnTT: 0.5,  color: '#10b981' },
    { label: '1 tỷ/tháng',      lnTT: 1.0,  color: '#6366f1' },
    { label: '2 tỷ/tháng',      lnTT: 2.0,  color: '#f59e0b' },
    { label: '3 tỷ/tháng',      lnTT: 3.0,  color: '#ef4444' },
  ].map(t => ({
    ...t,
    dtCan:   +(t.lnTT + CP_CO_DINH_THANG) / TY_LE_DONG_GOP,
    gmvCan:  +(t.lnTT + CP_CO_DINH_THANG) / TY_LE_DONG_GOP / (ACTUALS.tyLeHoaHong / 100),
    canCan:  Math.ceil(((t.lnTT + CP_CO_DINH_THANG) / TY_LE_DONG_GOP) / (ACTUALS.tyLeHoaHong / 100) / GIA_TRI_BQ_CAN),
    salesCan: Math.ceil(((t.lnTT + CP_CO_DINH_THANG) / TY_LE_DONG_GOP) / (ACTUALS.tyLeHoaHong / 100) / GIA_TRI_BQ_CAN / 2.5),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Tóm tắt 3 kịch bản */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { title: 'Kịch bản xấu',   sub: 'Thị trường chậm, T7-T9 yếu',              color: '#ef4444', ...TONG_H2.xau },
          { title: 'Kịch bản cơ sở', sub: 'Duy trì đà T5/26, T7-T8 giảm nhẹ',        color: '#6366f1', ...TONG_H2.coso },
          { title: 'Kịch bản tốt',   sub: 'Thêm dự án mới, đội ngũ mở rộng',          color: '#10b981', ...TONG_H2.tot },
        ].map(s => (
          <div key={s.title} style={{ background: 'var(--bg-card)', border: `1px solid var(--border-light)`, borderRadius: 12, padding: '16px', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontWeight: 700, color: s.color, fontSize: '0.88rem', marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>{s.sub}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { k: 'Doanh thu H2/2026', v: `${f2(s.dt)} tỷ` },
                { k: 'Lợi nhuận H2/2026', v: `${s.lnTT > 0 ? '+' : ''}${f2(s.lnTT)} tỷ`, bold: true, color: s.lnTT > 0 ? 'var(--success-text)' : 'var(--danger-text)' },
              ].map(row => (
                <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{row.k}</span>
                  <span style={{ fontWeight: row.bold ? 700 : 400, color: row.color }}>{row.v}</span>
                </div>
              ))}
              <div style={{ height: '1px', background: 'var(--border-lighter)', margin: '4px 0' }} />
              {[
                { k: 'Doanh thu cả năm', v: `${f2(ACTUALS.revenue + s.dt)} tỷ` },
                { k: 'Lợi nhuận cả năm', v: `${f2(ACTUALS.pbt + s.lnTT)} tỷ`, color: s.color },
              ].map(row => (
                <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{row.k}</span>
                  <span style={{ color: row.color }}>{row.v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <The>
        <TieuDeMuc>Dự báo doanh thu môi giới H2/2026 — 3 kịch bản (tỷ)</TieuDeMuc>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={DU_BAO_DATA}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
            <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
            <Tooltip content={<TooltipTuyChon />} />
            <ReferenceLine y={DT_HOA_VON} stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `Hòa vốn ${f2(DT_HOA_VON)}tỷ`, fontSize: 10, fill: '#f59e0b' }} />
            <Line type="monotone" dataKey="Kịch bản xấu"   stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} />
            <Line type="monotone" dataKey="Kịch bản cơ sở" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="Kịch bản tốt"   stroke="#10b981" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} />
            <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
          </LineChart>
        </ResponsiveContainer>
      </The>

      <The>
        <TieuDeMuc>Doanh số cần đạt để đạt mục tiêu lợi nhuận (giữ cơ cấu chi phí hiện tại)</TieuDeMuc>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)' }}>
              {['Mục tiêu lợi nhuận', 'DT cần/tháng (tỷ)', 'Doanh số GD cần/tháng (tỷ)', 'Số căn/tháng', 'Nhân viên KD cần', 'Tăng so với hiện tại', 'Khả thi?'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-lighter)', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: 'rgba(99,102,241,0.05)' }}>
              <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--primary)', fontWeight: 700 }}>Hiện tại (bình quân)</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(ACTUALS.revenue/ACTUALS.months)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f1(ACTUALS.gmv/ACTUALS.months)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f1(ACTUALS.soCan/ACTUALS.months)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>~8</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>—</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>🟡 Vừa đủ</td>
            </tr>
            {mucTieu.map(t => {
              const tangthem = ((t.dtCan / (ACTUALS.revenue/ACTUALS.months)) - 1) * 100;
              return (
                <tr key={t.label}>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: t.color, fontWeight: 700 }}>{t.label}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(t.dtCan)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f1(t.gmvCan)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{t.canCan}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{t.salesCan}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: tangthem > 100 ? 'var(--danger-text)' : 'var(--warning-text)', fontWeight: 700 }}>+{f0(tangthem)}%</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{tangthem < 50 ? '🟢 Đạt được' : tangthem < 150 ? '🟡 Thách thức' : '🔴 Cần cải cách'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--text-label)', fontStyle: 'italic' }}>
          * Giả định: giá trị bình quân/căn {f1(GIA_TRI_BQ_CAN)} tỷ, phí môi giới {f1(ACTUALS.tyLeHoaHong)}%, mỗi nhân viên bán 2.5 căn/tháng.
          Nếu cắt hoa hồng về 65%: cần doanh thu ít hơn ~20% để đạt cùng mục tiêu lợi nhuận.
        </div>
      </The>
    </div>
  );
}

// ─── Trang chính ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'exec',   label: 'Tổng quan',       icon: BarChart2 },
  { id: 'sales',  label: 'Doanh số',        icon: TrendingUp },
  { id: 'profit', label: 'Lợi nhuận',       icon: DollarSign },
  { id: 'cost',   label: 'Chi phí',         icon: Layers },
  { id: 'bep',    label: 'Điểm hòa vốn',   icon: Target },
  { id: 'fcst',   label: 'Dự báo',          icon: Activity },
];

export default function CFODashboard() {
  const [tab, setTab] = useState('exec');

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Thanh điều hướng & tiêu đề */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a href="/tai-chinh" style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Tài chính
            </a>
            <ChevronRight size={14} style={{ color: 'var(--text-label)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Phân tích tài chính chuyên sâu</span>
          </div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-title)', marginTop: 4 }}>
            Bảng điều hành tài chính — Victory Holdings
          </h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Số liệu thực tế {ACTUALS.period} · {ACTUALS.months} tháng · {ACTUALS.soCan} căn đã giao dịch
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: `Doanh số ${f1(ACTUALS.gmv)} tỷ`, color: '#6366f1' },
            { label: `Doanh thu ${f2(ACTUALS.revenue)} tỷ`, color: '#10b981' },
            { label: `LN trước thuế ${fPct(BIEN_LN_TT)}`, color: BIEN_LN_TT > 10 ? '#10b981' : '#ef4444' },
          ].map(b => (
            <div key={b.label} style={{ padding: '4px 12px', borderRadius: 6, background: `${b.color}15`, border: `1px solid ${b.color}30`, fontSize: '0.72rem', fontWeight: 700, color: b.color }}>
              {b.label}
            </div>
          ))}
        </div>
      </div>

      {/* Thanh tab */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'var(--bg-page)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: active ? 700 : 500, transition: 'all 0.15s',
                background: active ? 'var(--bg-card)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Nội dung tab */}
      {tab === 'exec'   && <TabTongQuan />}
      {tab === 'sales'  && <TabDoanhSo />}
      {tab === 'profit' && <TabLoiNhuan />}
      {tab === 'cost'   && <TabChiPhi />}
      {tab === 'bep'    && <TabHoaVon />}
      {tab === 'fcst'   && <TabDuBao />}

      <div style={{ marginTop: 20, fontSize: '0.7rem', color: 'var(--text-label)', textAlign: 'center', lineHeight: 1.6 }}>
        Bảng điều hành tài chính · Số liệu: {ACTUALS.period} · Điểm hòa vốn: {f2(DT_HOA_VON)} tỷ/tháng · Tỷ lệ đóng góp: {fPct(TY_LE_DONG_GOP*100)} · Victory Holdings CRM
      </div>
    </div>
  );
}
