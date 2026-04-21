'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BadgeDollarSign, Calculator, Save, CheckCircle2, AlertCircle
} from 'lucide-react';
import type { BangLuong, NhanVien } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export default function BangLuongPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  
  // App state
  const [employeesMap, setEmployeesMap] = useState<Map<string, string>>(new Map());
  const [previewData, setPreviewData] = useState<Omit<BangLuong, "id" | "created_at">[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Filters
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const [thang, setThang] = useState(currentMonth);
  const [nam, setNam] = useState(currentYear);

  // Load employees for mapping
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/nhan-vien');
      const data = await res.json();
      if (data.success && data.data) {
        const map = new Map<string, string>();
        data.data.forEach((nv: NhanVien) => {
          map.set(nv.id_nhan_vien, nv.ho_ten);
        });
        setEmployeesMap(map);
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleCalculate = async () => {
    if (!isAdmin) return;
    if (!thang || !nam) {
      alert('Vui lòng chọn tháng và năm');
      return;
    }

    setLoading(true);
    setPreviewData([]); // Clear old preview
    
    try {
      const res = await fetch('/api/payroll/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang: Number(thang), nam: Number(nam) })
      });
      const result = await res.json();
      if (result.success) {
        setPreviewData(result.data);
      } else {
        alert('Lỗi: ' + result.error);
      }
    } catch (err) {
      console.error('Calculate error:', err);
      alert('Lỗi kết nối khi tính lương');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isAdmin || previewData.length === 0) return;
    
    // Check if any draft has invalid values
    if (!confirm(`Bạn có chắc muốn lưu bảng lương tháng ${thang}/${nam}?`)) return;

    setSaving(true);
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewData)
      });
      const result = await res.json();
      if (result.success) {
        alert(result.message || 'Lưu bảng lương thành công!');
        // Optionally clear preview or re-calculate
        setPreviewData([]);
      } else {
        alert('Lỗi: ' + result.error);
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('Lỗi lưu bảng lương. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  // Handle local edits for Thuong/Phat preview
  const updatePreviewField = (index: number, field: 'thuong' | 'phat', val: string) => {
    const rawVal = Number(val) || 0;
    const newData = [...previewData];
    const row = { ...newData[index] };
    
    row[field] = rawVal;
    row.tong_luong = row.luong_co_ban + row.hoa_hong + row.thuong - row.phat;
    
    newData[index] = row;
    setPreviewData(newData);
  };

  if (authLoading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Bảng lương</h1>
          <p>Tính toán lương, hoa hồng từ hợp đồng và deals thành công</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {isAdmin && (
            <button 
              className="btn btn-primary" 
              onClick={handleSave} 
              disabled={saving || loading || previewData.length === 0}
            >
              {saving ? (
                <>Đang lưu...</>
              ) : (
                <><Save size={18} /> Lưu bảng lương</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Filter Options */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, width: 120 }}>
            <label className="form-label">Tháng</label>
            <select 
              className="form-select"
              value={thang}
              onChange={(e) => setThang(Number(e.target.value))}
            >
              {[...Array(12)].map((_, i) => (
                <option key={i+1} value={i+1}>Tháng {i+1}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0, width: 120 }}>
            <label className="form-label">Năm</label>
            <input 
              type="number" 
              className="form-input" 
              value={nam}
              onChange={(e) => setNam(Number(e.target.value))}
            />
          </div>

          <button 
            className="btn btn-secondary" 
            onClick={handleCalculate} 
            disabled={loading}
          >
            {loading ? 'Đang tính...' : <><Calculator size={16} /> Tính lương</>}
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>
            Đang tính toán lương và hoa hồng...
          </div>
        ) : previewData.length === 0 ? (
          <div className="empty-state">
            <BadgeDollarSign size={40} />
            <h3>Chưa có dữ liệu Preview</h3>
            <p>Chọn tháng/năm và nhấn &quot;Tính lương&quot; để xem trước</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Nhân viên</th>
                  <th style={{ textAlign: 'right' }}>Lương CB</th>
                  <th style={{ textAlign: 'right' }}>Doanh thu</th>
                  <th style={{ textAlign: 'right' }}>Hoa hồng</th>
                  <th style={{ textAlign: 'right', width: 130 }}>Thưởng (+)</th>
                  <th style={{ textAlign: 'right', width: 130 }}>Phạt (-)</th>
                  <th style={{ textAlign: 'right' }}>Tổng lương</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {previewData.map((bl, idx) => (
                  <tr key={bl.id_nhan_vien}>
                    <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                      {employeesMap.get(bl.id_nhan_vien) || bl.id_nhan_vien}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(bl.luong_co_ban)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(bl.doanh_thu)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--warning)' }}>{formatCurrency(bl.hoa_hong)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <input 
                        type="number" 
                        className="form-input" 
                        style={{ padding: '4px 8px', textAlign: 'right', height: 32 }}
                        value={bl.thuong === 0 ? '' : bl.thuong}
                        placeholder="0"
                        onChange={(e) => updatePreviewField(idx, 'thuong', e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input 
                        type="number" 
                        className="form-input" 
                        style={{ padding: '4px 8px', textAlign: 'right', height: 32 }}
                        value={bl.phat === 0 ? '' : bl.phat}
                        placeholder="0"
                        onChange={(e) => updatePreviewField(idx, 'phat', e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>
                      {formatCurrency(bl.tong_luong)}
                    </td>
                    <td>
                      <span className="badge badge-neutral">
                        Preview
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {previewData.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <AlertCircle size={14} /> Điền thưởng / phạt trực tiếp trên bảng preview trước khi bấm Lưu bảng lương.
        </div>
      )}
    </div>
  );
}
