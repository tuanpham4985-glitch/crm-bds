import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getKhachHang, addKhachHang } from '@/lib/data-access';
import type { KhachHang } from '@/lib/types';

// Column indices (0-based) matching the export format from the lead funnel
const COL = {
  ten_KH:      2,   // Khách hàng
  sdt:         3,   // SĐT
  email:       4,   // Email
  dich_vu:     6,   // Dịch vụ quan tâm
  tai_chinh:   7,   // Mức tài chính
  muc_quat_am: 8,   // Mức độ quan tâm
  du_an:       10,  // Dự án
  campaign:    11,  // Campaign → nguon
  sale:        12,  // Sale
  ngay_tao:    13,  // Ngày tạo
  tang:        15,  // Khoảng tầng
  vay:         16,  // Có vay không?
  ghi_chu:     17,  // Lời nhắn
};

function norm(v: unknown): string {
  const s = String(v ?? '').trim();
  return s === '—' || s === '-' || s === 'nan' ? '' : s;
}

function normalizePhone(raw: string): string {
  const s = raw.replace(/\s+/g, '');
  return s.startsWith('0') ? s : '0' + s;
}

function parseNgayTao(raw: string): string {
  // Format: "HH:MM:SS DD/MM/YYYY"
  try {
    const parts = raw.trim().split(' ');
    const datePart = parts.length >= 2 ? parts[1] : parts[0];
    const [d, m, y] = datePart.split('/').map(Number);
    if (!d || !m || !y) return new Date().toISOString();
    return new Date(y, m - 1, d).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function buildNhuCau(row: unknown[]): string {
  const parts: string[] = [];
  const dichVu     = norm(row[COL.dich_vu]);
  const taiChinh   = norm(row[COL.tai_chinh]);
  const mucQuanTam = norm(row[COL.muc_quat_am]);
  const tang       = norm(row[COL.tang]);
  const vay        = norm(row[COL.vay]);
  if (dichVu)     parts.push(`Dịch vụ: ${dichVu}`);
  if (taiChinh)   parts.push(`Tài chính: ${taiChinh}`);
  if (mucQuanTam) parts.push(`Quan tâm: ${mucQuanTam}`);
  if (tang)       parts.push(`Tầng: ${tang}`);
  if (vay)        parts.push(`Vay: ${vay}`);
  return parts.join(' | ');
}

export interface ImportResult {
  success: boolean;
  imported: number;
  duplicates: number;
  errors: number;
  importedList: string[];
  duplicateList: { ten_KH: string; so_dien_thoai: string }[];
  errorList: { ten_KH: string; error: string }[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    if (rows.length < 2) {
      return NextResponse.json({ success: false, error: 'File không có dữ liệu' }, { status: 422 });
    }

    // Load existing customers to build duplicate set
    const existing = await getKhachHang();
    const existingPhones = new Set(existing.map(kh => kh.so_dien_thoai.replace(/\s+/g, '')));

    const importedList: string[] = [];
    const duplicateList: { ten_KH: string; so_dien_thoai: string }[] = [];
    const errorList: { ten_KH: string; error: string }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const tenKH  = norm(row[COL.ten_KH]);
      const rawSdt = norm(row[COL.sdt]);

      // Skip blank rows
      if (!tenKH || !rawSdt) continue;

      const sdt = normalizePhone(rawSdt);

      if (existingPhones.has(sdt)) {
        duplicateList.push({ ten_KH: tenKH, so_dien_thoai: sdt });
        continue;
      }

      const ngayTaoRaw = norm(row[COL.ngay_tao]);
      const ngay_tao   = ngayTaoRaw ? parseNgayTao(ngayTaoRaw) : new Date().toISOString();

      const kh: KhachHang = {
        id_khach_hang: `KH_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        ngay_tao,
        ten_KH:          tenKH,
        so_dien_thoai:   sdt,
        email:           norm(row[COL.email]),
        nguon:           norm(row[COL.campaign]),
        nhu_cau:         buildNhuCau(row),
        ghi_chu:         norm(row[COL.ghi_chu]),
        sale_phu_trach:  norm(row[COL.sale]),
        label_khach:     `${tenKH} - ${sdt}`,
      };

      try {
        await addKhachHang(kh);
        existingPhones.add(sdt); // prevent intra-batch duplicate
        importedList.push(tenKH);
        await new Promise(r => setTimeout(r, 150)); // rate-limit buffer
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errorList.push({ ten_KH: tenKH, error: msg });
      }
    }

    return NextResponse.json({
      success: true,
      imported:      importedList.length,
      duplicates:    duplicateList.length,
      errors:        errorList.length,
      importedList,
      duplicateList,
      errorList,
    } satisfies ImportResult);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[API khach-hang/import-excel] Unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi server: ' + msg }, { status: 500 });
  }
}
