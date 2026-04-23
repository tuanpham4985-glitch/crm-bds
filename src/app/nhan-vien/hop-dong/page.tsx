'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Download
} from 'lucide-react';
import { HopDong, NhanVien } from '@/lib/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { detectEmployeeClassification, getContractTemplate } from '@/lib/contractEngine';
import type { Department } from '@/config/contractTemplates';

export default function HopDongPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HopDongContent />
    </Suspense>
  );
}

function HopDongContent() {
  const { isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const prefilledEmployeeId = searchParams.get('id_nhan_vien') || '';

  const [contracts, setContracts] = useState<HopDong[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [loading, setLoading] = useState(true);

  const [exportItem, setExportItem] = useState<HopDong | null>(null);
  const [exporting, setExporting] = useState(false);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : { success: false };
    } catch {
      return { success: false };
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [hdRes, nvRes] = await Promise.all([
        fetch('/api/contracts'),
        fetch('/api/nhan-vien'),
      ]);

      const hdData = await safeJson(hdRes);
      const nvData = await safeJson(nvRes);

      if (hdData.success) setContracts(hdData.data);
      if (nvData.success) setEmployees(nvData.data);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleExport = async () => {
    if (!exportItem) return;
    setExporting(true);

    try {
      const emp = employees.find(e => e.id_nhan_vien === exportItem.id_nhan_vien) as Partial<NhanVien> | undefined;
      const now = new Date();

      const exportClassification = detectEmployeeClassification(
        emp?.vai_tro || 'Sale',
        exportItem.contract_type,
        emp?.employee_type
      );

      const exportDept = (exportItem.department || exportClassification.department) as Department;
      const exportTemplate = getContractTemplate(exportClassification.contract_category, exportDept);

      const finalData = {
        template_file: exportTemplate?.template_file ?? '',

        so_hop_dong: exportItem.so_hop_dong ?? '',
        contract_type: exportItem.contract_type ?? '',
        ngay_bat_dau: formatDate(exportItem.ngay_bat_dau),
        ngay_ket_thuc: formatDate(exportItem.ngay_ket_thuc),
        luong_co_ban: formatCurrency(exportItem.luong_co_ban),

        department: exportDept,
        phong_KD: exportItem.phong_KD ?? '',

        ho_ten: emp?.ho_ten ?? '',
        ngay_sinh: emp?.ngay_sinh ?? '',
        gioi_tinh: emp?.gioi_tinh ?? '',
        so_cccd: emp?.so_cccd ?? '',
        ngay_cap: emp?.ngay_cap ?? '',
        noi_cap: emp?.noi_cap ?? '',
        HKTT: emp?.HKTT ?? '',
        ma_so_thue: emp?.ma_so_thue ?? '',
        employee_type: emp?.employee_type ?? '',

        ngay_ky: String(now.getDate()),
        thang_ky: String(now.getMonth() + 1),
        nam_ky: String(now.getFullYear()),
      };

      const res = await fetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      });

      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `hop-dong-${exportItem.so_hop_dong}.docx`;
      a.click();

      window.URL.revokeObjectURL(url);
      setExportItem(null);

    } catch (err: any) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading || authLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Quản lý hợp đồng</h1>

      <button onClick={() => setExportItem(contracts[0])}>
        Test Export
      </button>

      {exportItem && (
        <button onClick={handleExport}>
          <Download size={16} /> Xuất file
        </button>
      )}
    </div>
  );
}