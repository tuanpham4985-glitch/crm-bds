import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getKhachHang, addKhachHang } from '@/lib/data-access';
import type { KhachHang } from '@/lib/types';
import { getCrmSessionUser, isCrmAdmin } from '@/lib/crm-auth';
import { classifyRow, phoneKey, resolveColumns } from '@/lib/khach-hang-excel-import';

export interface ImportResult {
  success: boolean;
  totalRows: number;
  imported: number;
  duplicates: number;
  invalid: number;
  errors: number;
  importedList: string[];
  duplicateList: { ten_KH: string; so_dien_thoai: string }[];
  invalidList: { row: number; reason: string }[];
  errorList: { ten_KH: string; error: string }[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCrmSessionUser();
  if (!isCrmAdmin(user)) return NextResponse.json({ success: false, error: 'Không có quyền import khách hàng' }, { status: 403 });
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ success: false, error: 'Không đọc được form data: ' + msg }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'Thiếu file Excel' }, { status: 400 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ success: false, error: 'Không đọc được file: ' + msg }, { status: 400 });
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { success: false, error: 'File không phải định dạng Excel hợp lệ (.xlsx/.xls): ' + msg },
        { status: 422 }
      );
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

    if (rows.length < 1) {
      return NextResponse.json({ success: false, error: 'File không có dữ liệu' }, { status: 422 });
    }

    // Cột được xác định qua HEADER thực tế của file, không theo vị trí cố định —
    // tránh map nhầm khi file nguồn có layout khác export của phễu lead nội bộ.
    const columns = resolveColumns(rows[0]);
    if (!columns) {
      return NextResponse.json({
        success: false,
        error: 'Không tìm thấy cột "Tên KH" và/hoặc "SĐT" ở dòng tiêu đề. Đặt tên cột theo mẫu: Tên KH/Tên khách hàng/Họ tên/Tên NK, SĐT/Số điện thoại/Điện thoại/Phone, Email (tuỳ chọn).',
      }, { status: 422 });
    }

    const dataRows = rows.slice(1);
    if (dataRows.length === 0) {
      return NextResponse.json({ success: false, error: 'File không có dòng dữ liệu' }, { status: 422 });
    }

    // Load existing customers to build duplicate set — canonical last-9-digit
    // phone comparison, đồng nhất với dedupe của /api/khach-hang (manual create/update).
    const existing = await getKhachHang();
    const existingPhoneKeys = new Set(existing.map(kh => phoneKey(kh.so_dien_thoai)));

    const importedList: string[] = [];
    const duplicateList: { ten_KH: string; so_dien_thoai: string }[] = [];
    const invalidList: { row: number; reason: string }[] = [];
    const errorList: { ten_KH: string; error: string }[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const classification = classifyRow(dataRows[i], columns, existingPhoneKeys);
      if (classification.status === 'blank') continue;
      if (classification.status === 'invalid') {
        invalidList.push({ row: i + 2, reason: classification.reason }); // +2: bù dòng header + 1-based
        continue;
      }
      if (classification.status === 'duplicate') {
        duplicateList.push({ ten_KH: classification.ten_KH, so_dien_thoai: classification.so_dien_thoai });
        continue;
      }

      // Import Excel CHỈ ghi tên/SĐT/email — các field CRM khác giữ default
      // theo contract hiện tại, không suy diễn từ bất kỳ cột nào khác trong file.
      const kh: KhachHang = {
        id_khach_hang: `KH_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        ngay_tao: new Date().toISOString(),
        ten_KH: classification.ten_KH,
        so_dien_thoai: classification.so_dien_thoai,
        email: classification.email,
        nguon: '',
        nhu_cau: '',
        ghi_chu: '',
        sale_phu_trach: '',
        label_khach: `${classification.ten_KH} - ${classification.so_dien_thoai}`,
      };

      try {
        await addKhachHang(kh);
        existingPhoneKeys.add(phoneKey(classification.so_dien_thoai)); // prevent intra-batch duplicate
        importedList.push(classification.ten_KH);
        await new Promise(r => setTimeout(r, 150)); // rate-limit buffer
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errorList.push({ ten_KH: classification.ten_KH, error: msg });
      }
    }

    return NextResponse.json({
      success: true,
      totalRows:     dataRows.length,
      imported:      importedList.length,
      duplicates:    duplicateList.length,
      invalid:       invalidList.length,
      errors:        errorList.length,
      importedList,
      duplicateList,
      invalidList,
      errorList,
    } satisfies ImportResult);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[API khach-hang/import-excel] Unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi server: ' + msg }, { status: 500 });
  }
}
