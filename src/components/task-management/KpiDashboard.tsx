'use client';
import useSWR from 'swr';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Loader2, TrendingUp, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data);

const STATUS_COLORS = ['#6366f1', '#3b82f6', '#f59e0b', '#a855f7', '#22c55e', '#94a3b8'];
const PRIORITY_COLORS = ['#ef4444', '#f97316', '#6366f1', '#22c55e'];

function StatCard({ label, value, sub, icon, color }: {
  label: string; value: number | string; sub?: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-title)' }}>{value}</p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</p>
        {sub && <p style={{ margin: 0, fontSize: 11, color }}>{sub}</p>}
      </div>
    </div>
  );
}

export default function KpiDashboard() {
  const { data: kpi, isLoading, error } = useSWR('/api/tm/kpi/company', fetcher, { revalidateOnFocus: false });

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 60, gap: 12, color: 'var(--text-muted)' }}>
      <Loader2 size={22} className="tm-spin" /> Đang tải KPI...
    </div>
  );

  if (error || !kpi) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 13 }}>
      Không thể tải dữ liệu KPI hoặc bạn không có quyền truy cập.
    </div>
  );

  const statusData = Object.entries(kpi.by_status ?? {}).map(([name, value]) => ({ name, value: value as number }));
  const priorityData = Object.entries(kpi.by_priority ?? {}).map(([name, value]) => ({ name, value: value as number }));
  const deptData = (kpi.by_department ?? []).map((d: Record<string, unknown>) => ({
    name: String(d.department_name ?? d.department_id ?? '').slice(0, 8),
    total:     Number(d.active_tasks ?? 0),
    completed: Number(d.completed_tasks ?? 0),
    overdue:   Number(d.overdue_tasks ?? 0),
  }));

  const completionRate = (kpi.total_tasks ?? 0) > 0
    ? Math.round(((kpi.completed_tasks ?? 0) / kpi.total_tasks) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <StatCard label="Tổng công việc" value={kpi.total_tasks ?? kpi.total_active_tasks ?? 0} icon={<TrendingUp size={18} />} color="#6366f1" />
        <StatCard label="Hoàn thành" value={kpi.completed_tasks ?? 0} sub={`${completionRate}% tỷ lệ`} icon={<CheckCircle2 size={18} />} color="#16a34a" />
        <StatCard label="Quá hạn" value={kpi.overdue_tasks ?? kpi.total_overdue_tasks ?? 0} icon={<AlertTriangle size={18} />} color="#dc2626" />
        <StatCard label="Chờ duyệt" value={kpi.pending_approval ?? 0} icon={<Clock size={18} />} color="#f59e0b" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Status distribution */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: 16 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-title)' }}>Theo trạng thái</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                {statusData.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v} task`, '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Priority distribution */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: 16 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-title)' }}>Theo độ ưu tiên</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                {priorityData.map((_, i) => <Cell key={i} fill={PRIORITY_COLORS[i % PRIORITY_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v} task`, '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Department bar chart */}
      {deptData.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: 16 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-title)' }}>Theo phòng ban</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deptData} barCategoryGap="30%">
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total"     name="Tổng"      fill="#6366f1" radius={[4,4,0,0]} />
              <Bar dataKey="completed" name="Hoàn thành" fill="#22c55e" radius={[4,4,0,0]} />
              <Bar dataKey="overdue"   name="Quá hạn"   fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
