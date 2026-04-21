import { NextRequest, NextResponse } from 'next/server';
import { getNhanVien, getPipeline, getHopDong } from '@/lib/google-sheets';
import type { BangLuong } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { thang, nam } = await request.json();

    if (!thang || !nam) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin tháng/năm' }, { status: 400 });
    }

    const [employees, pipelines, contracts] = await Promise.all([
      getNhanVien(),
      getPipeline(),
      getHopDong()
    ]);

    // Only active employees
    const activeEmployees = employees.filter(nv => nv.trang_thai !== 'Nghỉ việc');
    const monthKey = `${String(thang).padStart(2, '0')}-${nam}`;
    const now = new Date();
    // Normalize current date for comparison (keep date part only if needed, but simple comparison is usually fine)
    now.setHours(0, 0, 0, 0);

    const results: Omit<BangLuong, 'id' | 'created_at'>[] = activeEmployees.map(nv => {
      // 1. Find active contract
      const employeeContracts = contracts.filter(c => c.id_nhan_vien === nv.id_nhan_vien);
      
      const activeContract = employeeContracts.find(c => {
        if (!c.ngay_bat_dau) return false;
        
        const start = new Date(c.ngay_bat_dau);
        start.setHours(0, 0, 0, 0);
        
        if (isNaN(start.getTime()) || start > now) return false;

        if (c.ngay_ket_thuc && c.ngay_ket_thuc.trim() !== '') {
          const end = new Date(c.ngay_ket_thuc);
          end.setHours(0, 0, 0, 0);
          if (!isNaN(end.getTime()) && end < now) return false;
        }

        return true;
      });

      const baseSalary = activeContract ? (Number(activeContract.luong_co_ban) || 0) : 0;

      // 2. Revenue & Commission from closed pipeline deals matching the MM-YYYY
      const empPipelines = pipelines.filter(pl => 
        pl.sale_phu_trach === nv.id_nhan_vien && 
        pl.thang === monthKey && 
        (pl.giai_doan.toLowerCase().includes('ký') || pl.giai_doan.toLowerCase().includes('thành công'))
      );
      
      const revenue = empPipelines.reduce((sum, pl) => sum + (Number(pl.gia_tri_thuc_te) || 0), 0);
      const commission = empPipelines.reduce((sum, pl) => sum + (Number(pl.tien_hoa_hong) || 0), 0);

      const thuong = 0;
      const phat = 0;

      return {
        id_nhan_vien: nv.id_nhan_vien,
        thang: Number(thang),
        nam: Number(nam),
        luong_co_ban: baseSalary,
        doanh_thu: revenue,
        hoa_hong: commission,
        thuong,
        phat,
        tong_luong: baseSalary + commission + thuong - phat,
        trang_thai: 'draft' as const
      };
    });

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Calculate payroll error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi tính toán bảng lương' }, { status: 500 });
  }
}
