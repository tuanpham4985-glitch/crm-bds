import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\pipeline\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Bổ sung import useAuth
const importTarget = "import { useState, useEffect, useCallback } from 'react';";
const importReplacement = "import { useState, useEffect, useCallback } from 'react';\nimport { useAuth } from '@/hooks/useAuth';";

if (content.indexOf(importTarget) !== -1 && content.indexOf('useAuth') === -1) {
  content = content.replace(importTarget, importReplacement);
}

// 2. Thêm useAuth vào đầu component
const componentStart = "export default function PipelinePage() {";
const componentStartReplacement = `export default function PipelinePage() {
  const { user } = useAuth();
  const canViewProfit = user && ['Admin', 'Chủ tịch', 'TGĐ'].includes(user.employee_type || '');`;

if (content.indexOf(componentStart) !== -1 && content.indexOf('canViewProfit') === -1) {
  content = content.replace(componentStart, componentStartReplacement);
}

// 3. Cập nhật form state
const formStateTarget = `  const [form, setForm] = useState({
    id_khach_hang: '', giai_doan: 'Mới', gia_tri_thuc_te: 0,
    sale_phu_trach: '', id_du_an: '', ten_du_an: '', hoa_hong: 0, thang: '',
  });`;

const formStateReplacement = `  const [form, setForm] = useState({
    id_khach_hang: '', giai_doan: 'Mới', gia_tri_thuc_te: 0,
    sale_phu_trach: '', id_du_an: '', ten_du_an: '', hoa_hong: 0, thang: '',
    loi_nhuan: 0,
  });`;

if (content.indexOf(formStateTarget) !== -1) {
  content = content.replace(formStateTarget, formStateReplacement);
}

// 4. Cập nhật openCreate
const openCreateTarget = `  const openCreate = () => {
    setEditingItem(null);
    setForm({
      id_khach_hang: '', giai_doan: 'Mới', gia_tri_thuc_te: 0,
      sale_phu_trach: '', id_du_an: '', ten_du_an: '', hoa_hong: 0, thang: '',
    });
    setShowModal(true);
  };`;

const openCreateReplacement = `  const openCreate = () => {
    setEditingItem(null);
    setForm({
      id_khach_hang: '', giai_doan: 'Mới', gia_tri_thuc_te: 0,
      sale_phu_trach: '', id_du_an: '', ten_du_an: '', hoa_hong: 0, thang: '',
      loi_nhuan: 0,
    });
    setShowModal(true);
  };`;

if (content.indexOf(openCreateTarget) !== -1) {
  content = content.replace(openCreateTarget, openCreateReplacement);
}

// 5. Cập nhật openEdit
const openEditTarget = `  const openEdit = (pl: Pipeline) => {
    setEditingItem(pl);

    setForm({
      id_khach_hang: pl.id_khach_hang,
      giai_doan: pl.giai_doan,
      gia_tri_thuc_te: Number(pl.gia_tri_thuc_te) || 0,
      sale_phu_trach: pl.sale_phu_trach,
      id_du_an: pl.id_du_an,
      ten_du_an: pl.ten_du_an,
      hoa_hong: pl.hoa_hong,
      thang: pl.thang,
    });

    setShowModal(true);
  };`;

const openEditReplacement = `  const openEdit = (pl: Pipeline) => {
    setEditingItem(pl);

    setForm({
      id_khach_hang: pl.id_khach_hang,
      giai_doan: pl.giai_doan,
      gia_tri_thuc_te: Number(pl.gia_tri_thuc_te) || 0,
      sale_phu_trach: pl.sale_phu_trach,
      id_du_an: pl.id_du_an,
      ten_du_an: pl.ten_du_an,
      hoa_hong: pl.hoa_hong,
      thang: pl.thang,
      loi_nhuan: Number(pl.loi_nhuan) || 0,
    });

    setShowModal(true);
  };`;

if (content.indexOf(openEditTarget) !== -1) {
  content = content.replace(openEditTarget, openEditReplacement);
}

// 6. Cập nhật phần tính tổng loi_nhuan ở header
const totalValueTarget = `  const totalValue = filteredPipelines.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0);`;
const totalValueReplacement = `  const totalValue = filteredPipelines.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0);
  const totalProfit = activeDeals.reduce((s, pl) => s + (pl.loi_nhuan || 0), 0);`;

if (content.indexOf(totalValueTarget) !== -1 && content.indexOf('totalProfit') === -1) {
  content = content.replace(totalValueTarget, totalValueReplacement);
}

// 7. Cập nhật dòng hiển thị tổng doanh thu + lợi nhuận ở Header
const headerTextTarget = `          <p>{filteredPipelines.length} deal · Tổng giá trị: {formatCurrency(totalValue)}</p>`;
const headerTextReplacement = `          <p>
            {filteredPipelines.length} deal · Tổng giá trị: {formatCurrency(totalValue)}
            {canViewProfit && \` · Tổng lợi nhuận: \${formatCurrency(totalProfit)}\`}
          </p>`;

if (content.indexOf(headerTextTarget) !== -1) {
  content = content.replace(headerTextTarget, headerTextReplacement);
}

// 8. Cập nhật Kanban Column Header
const kanbanHeaderTarget = `            const stageValue = deals.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0);
            const colors = GIAI_DOAN_COLORS[stage] || { bg: '#f1f5f9', text: '#475569', border: '#94a3b8' };`;

const kanbanHeaderReplacement = `            const stageValue = deals.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0);
            const stageProfit = deals.reduce((s, pl) => s + (pl.loi_nhuan || 0), 0);
            const colors = GIAI_DOAN_COLORS[stage] || { bg: '#f1f5f9', text: '#475569', border: '#94a3b8' };`;

if (content.indexOf(kanbanHeaderTarget) !== -1 && content.indexOf('stageProfit') === -1) {
  content = content.replace(kanbanHeaderTarget, kanbanHeaderReplacement);
}

const kanbanTitleTarget = `                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.text }}>
                    {formatCurrency(stageValue)}
                  </span>`;

const kanbanTitleReplacement = `                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: colors.text, whiteSpace: 'nowrap' }}>
                    DT: {formatCurrency(stageValue)}
                    {canViewProfit && \` · LN: \${formatCurrency(stageProfit)}\`}
                  </span>`;

if (content.indexOf(kanbanTitleTarget) !== -1) {
  content = content.replace(kanbanTitleTarget, kanbanTitleReplacement);
}

// 9. Cập nhật Kanban Card Value
const kanbanCardTarget = `                      <div className="kanban-card-value">{formatCurrency(pl.gia_tri_thuc_te)}</div>`;
const kanbanCardReplacement = `                      <div className="kanban-card-value" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>DT: {formatCurrency(pl.gia_tri_thuc_te)}</span>
                        {canViewProfit && (
                          <span style={{ color: 'var(--success-text)', fontSize: '0.72rem', fontWeight: 600 }}>
                            LN: {formatCurrency(pl.loi_nhuan || 0)}
                          </span>
                        )}
                      </div>`;

if (content.indexOf(kanbanCardTarget) !== -1) {
  content = content.replace(kanbanCardTarget, kanbanCardReplacement);
}

// 10. Cập nhật Table headers và values
const tableHeadTarget = `                  <th>Dự án</th>
                  <th style={{ textAlign: 'right' }}>Giá trị</th>
                  <th style={{ textAlign: 'right' }}>Hoa hồng</th>`;

const tableHeadReplacement = `                  <th>Dự án</th>
                  <th style={{ textAlign: 'right' }}>Giá trị</th>
                  {canViewProfit && <th style={{ textAlign: 'right' }}>Lợi nhuận</th>}
                  <th style={{ textAlign: 'right' }}>Hoa hồng</th>`;

if (content.indexOf(tableHeadTarget) !== -1 && content.indexOf('canViewProfit && <th') === -1) {
  content = content.replace(tableHeadTarget, tableHeadReplacement);
}

const tableRowTarget = `                      <td>{pl.ten_du_an || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        <span className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                          <DollarSign size={13} style={{ color: 'var(--text-label)' }} />
                          {formatCurrency(pl.gia_tri_thuc_te)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--success-text)' }}>{formatCurrency(pl.tien_hoa_hong)}</td>`;

const tableRowReplacement = `                      <td>{pl.ten_du_an || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        <span className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                          <DollarSign size={13} style={{ color: 'var(--text-label)' }} />
                          {formatCurrency(pl.gia_tri_thuc_te)}
                        </span>
                      </td>
                      {canViewProfit && (
                        <td style={{ textAlign: 'right', color: 'var(--success-text)', fontWeight: 600 }}>
                          {formatCurrency(pl.loi_nhuan || 0)}
                        </td>
                      )}
                      <td style={{ textAlign: 'right', color: 'var(--success-text)' }}>{formatCurrency(pl.tien_hoa_hong)}</td>`;

if (content.indexOf(tableRowTarget) !== -1 && content.indexOf('canViewProfit && (') === -1) {
  content = content.replace(tableRowTarget, tableRowReplacement);
}

const emptyStateTarget = `                  <tr>
                    <td colSpan={9} className="empty-state">`;

const emptyStateReplacement = `                  <tr>
                    <td colSpan={canViewProfit ? 10 : 9} className="empty-state">`;

if (content.indexOf(emptyStateTarget) !== -1) {
  content = content.replace(emptyStateTarget, emptyStateReplacement);
}

// 11. Cập nhật Form Modal Fields (ô nhập Lợi nhuận)
const formFieldsTarget = `              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Giá trị thực tế (VNĐ)</label>
                  <input className="form-input" type="number" value={form.gia_tri_thuc_te}
                    onChange={(e) => setForm({ ...form, gia_tri_thuc_te: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Hoa hồng (%)</label>
                  <input className="form-input" type="number" step="0.01" value={form.hoa_hong}
                    onChange={(e) => setForm({ ...form, hoa_hong: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>`;

const formFieldsReplacement = `              <div style={{ display: 'grid', gridTemplateColumns: canViewProfit ? '1fr 1fr 1fr' : '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Giá trị thực tế (VNĐ)</label>
                  <input className="form-input" type="number" value={form.gia_tri_thuc_te}
                    onChange={(e) => setForm({ ...form, gia_tri_thuc_te: parseFloat(e.target.value) || 0 })} />
                </div>
                {canViewProfit && (
                  <div className="form-group">
                    <label className="form-label">Lợi nhuận thực tế (VNĐ)</label>
                    <input className="form-input" type="number" value={form.loi_nhuan}
                      onChange={(e) => setForm({ ...form, loi_nhuan: parseFloat(e.target.value) || 0 })} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Hoa hồng (%)</label>
                  <input className="form-input" type="number" step="0.01" value={form.hoa_hong}
                    onChange={(e) => setForm({ ...form, hoa_hong: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>`;

if (content.indexOf(formFieldsTarget) !== -1) {
  content = content.replace(formFieldsTarget, formFieldsReplacement);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Phân quyền xem và tính tổng loi_nhuan trong PipelinePage thành công!');
