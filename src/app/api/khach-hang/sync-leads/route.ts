import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getKhachHang, addKhachHangBatch, getNhanVien } from '@/lib/google-sheets';
import type { KhachHang } from '@/lib/types';

// ─── Source URLs ──────────────────────────────────────────────────────────────

// Facebook: tải toàn bộ workbook (XLSX) để đọc tất cả sheet trong 1 lần download
const FB_XLSX_URL =
  'https://docs.google.com/spreadsheets/d/1GeoXfJOYSA7sUW7RumLuId0jzhUSNvTqVFSLSQeCOHo/export?format=xlsx';

// TikTok: chỉ có 1 sheet, dùng CSV nhẹ hơn
const TT_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1Ag2fLU01DRorIxep0V4pjXDkSyYYB9ll4Le8w0ybSU8/export?format=csv&gid=1797661699';

// Sheet không chứa lead — bỏ qua
const FB_SKIP_SHEETS = new Set(['CRM_Failures']);

// Header nhận diện format Facebook Instant Form
const FB_PRODUCT_COL = 'sản_phẩm_anh_chị_đang_quan_tâm_và_tìm_hiểu?';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  let s = String(raw ?? '').trim();
  if (s.startsWith('p:')) s = s.slice(2);
  if (s.startsWith('+84')) s = '0' + s.slice(3);
  return s.replace(/\s+/g, '');
}

function parseDDMMYYYY(raw: string): string {
  try {
    const [d, m, y] = String(raw).trim().split('/').map(Number);
    if (!d || !m || !y) return new Date().toISOString();
    return new Date(y, m - 1, d).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// ─── LeadRow internal type ────────────────────────────────────────────────────

interface LeadRow {
  ten_KH: string;
  so_dien_thoai: string;
  email: string;
  nguon: 'Facebook' | 'TikTok';
  nhu_cau: string;
  ghi_chu: string;
  ngay_tao: string;
}

// ─── Per-format mappers ───────────────────────────────────────────────────────

// Format 1: Facebook Instant Form (có cột full_name, phone_number)
function mapFbInstantForm(row: Record<string, string>): LeadRow | null {
  const tenKH  = String(row['full_name']    ?? '').trim();
  const rawSdt = String(row['phone_number'] ?? '').trim();
  if (!tenKH || !rawSdt) return null;

  const sdt = normalizePhone(rawSdt);
  if (sdt.length < 8) return null;

  let ngay_tao: string;
  try {
    const t = String(row['created_time'] ?? '').trim();
    ngay_tao = t ? new Date(t).toISOString() : new Date().toISOString();
  } catch {
    ngay_tao = new Date().toISOString();
  }

  return {
    ten_KH:        tenKH,
    so_dien_thoai: sdt,
    email:         String(row['email'] ?? '').trim(),
    nguon:         'Facebook',
    nhu_cau:       String(row[FB_PRODUCT_COL] ?? '').replace(/_/g, ' ').trim(),
    ghi_chu:       [row['campaign_name'], row['ad_name']]
                     .map(v => String(v ?? '').trim()).filter(Boolean).join(' / '),
    ngay_tao,
  };
}

// Format 2: Trang tính2 (Họ tên, Số điện thoại, Email, Dự án, Thời gian)
function mapFbManual(row: Record<string, string>): LeadRow | null {
  const tenKH  = String(row['Họ tên']        ?? '').trim();
  const rawSdt = String(row['Số điện thoại'] ?? '').trim();
  if (!tenKH || !rawSdt) return null;

  const sdt = normalizePhone(rawSdt);
  if (sdt.length < 8) return null;

  let ngay_tao: string;
  try {
    const t = String(row['Thời gian'] ?? '').trim();
    ngay_tao = t ? new Date(t).toISOString() : new Date().toISOString();
  } catch {
    ngay_tao = new Date().toISOString();
  }

  return {
    ten_KH:        tenKH,
    so_dien_thoai: sdt,
    email:         String(row['Email'] ?? '').trim(),
    nguon:         'Facebook',
    nhu_cau:       String(row['Dự án'] ?? '').trim(),
    ghi_chu:       '',
    ngay_tao,
  };
}

// Format 3: TikTok
function mapTikTok(row: Record<string, string>): LeadRow | null {
  const tenKH  = String(row['Name']         ?? '').trim();
  const rawSdt = String(row['Phone number'] ?? '').trim();
  if (!tenKH || !rawSdt) return null;

  const sdt = normalizePhone(rawSdt);
  if (sdt.length < 8) return null;

  const vay = String(row['Vay'] ?? '').trim();

  return {
    ten_KH:        tenKH,
    so_dien_thoai: sdt,
    email:         String(row['Email'] ?? '').trim(),
    nguon:         'TikTok',
    nhu_cau:       String(row['Sản phẩm'] ?? '').trim(),
    ghi_chu:       vay ? `Vay: ${vay}` : '',
    ngay_tao:      parseDDMMYYYY(String(row['_CRM_SYNCED_AT'] ?? '')),
  };
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

// Tải XLSX Facebook, duyệt tất cả sheet có dữ liệu lead
async function fetchFacebookAllSheets(): Promise<LeadRow[]> {
  const res = await fetch(FB_XLSX_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Facebook XLSX HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const leads: LeadRow[] = [];

  for (const sheetName of wb.SheetNames) {
    if (FB_SKIP_SHEETS.has(sheetName)) continue;

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
    if (rows.length === 0) continue;

    // Auto-detect format từ header của hàng đầu tiên
    const firstRow = rows[0];
    const hasInstantForm = 'full_name' in firstRow && 'phone_number' in firstRow;
    const hasManual      = 'Họ tên'   in firstRow && 'Số điện thoại' in firstRow;

    if (hasInstantForm) {
      for (const row of rows) {
        const mapped = mapFbInstantForm(row);
        if (mapped) leads.push(mapped);
      }
    } else if (hasManual) {
      for (const row of rows) {
        const mapped = mapFbManual(row);
        if (mapped) leads.push(mapped);
      }
    }
    // Sheet không nhận dạng được → bỏ qua
  }

  return leads;
}

async function fetchTikTokLeads(): Promise<LeadRow[]> {
  const res = await fetch(TT_CSV_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`TikTok CSV HTTP ${res.status}`);

  const text = await res.text();
  const wb   = XLSX.read(text, { type: 'string' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });

  return rows.map(mapTikTok).filter((r): r is LeadRow => r !== null);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(): Promise<NextResponse> {
  try {
    // 1. Fetch cả 2 nguồn song song
    const [fbLeads, ttLeads] = await Promise.all([
      fetchFacebookAllSheets().catch((e: unknown) => {
        console.error('[sync-leads] Facebook error:', e);
        return [] as LeadRow[];
      }),
      fetchTikTokLeads().catch((e: unknown) => {
        console.error('[sync-leads] TikTok error:', e);
        return [] as LeadRow[];
      }),
    ]);

    const leads: LeadRow[] = [...fbLeads, ...ttLeads];

    if (leads.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Cả 2 sheet phễu đều không có dữ liệu hợp lệ' },
        { status: 422 }
      );
    }

    // 2. Load dữ liệu song song: KH hiện tại + danh sách Sale active
    const [existing, allEmployees] = await Promise.all([
      getKhachHang(),
      getNhanVien(),
    ]);

    // Sale active để round-robin assign
    const saleList = allEmployees
      .filter(nv => nv.vai_tro === 'Sale' && nv.trang_thai !== 'Nghỉ việc')
      .map(nv => nv.ho_ten);
    const seenPhones = new Set(existing.map(kh => kh.so_dien_thoai.replace(/\s+/g, '')));

    const duplicateList: { ten_KH: string; so_dien_thoai: string; nguon: string }[] = [];
    const bySource: Record<string, { imported: number; duplicates: number }> = {
      Facebook: { imported: 0, duplicates: 0 },
      TikTok:   { imported: 0, duplicates: 0 },
    };

    // 3. Tách mới / trùng
    const newLeads: LeadRow[] = [];
    for (const lead of leads) {
      if (seenPhones.has(lead.so_dien_thoai)) {
        duplicateList.push({ ten_KH: lead.ten_KH, so_dien_thoai: lead.so_dien_thoai, nguon: lead.nguon });
        bySource[lead.nguon].duplicates++;
      } else {
        seenPhones.add(lead.so_dien_thoai);
        newLeads.push(lead);
        bySource[lead.nguon].imported++;
      }
    }

    // 4. Batch-insert — 3 API calls cho tất cả
    if (newLeads.length > 0) {
      // Round-robin: phân đều lead cho các Sale theo thứ tự
      const khs: KhachHang[] = newLeads.map((lead, i) => ({
        id_khach_hang:  `KH_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        ngay_tao:       lead.ngay_tao,
        ten_KH:         lead.ten_KH,
        so_dien_thoai:  lead.so_dien_thoai,
        email:          lead.email,
        nguon:          lead.nguon,
        nhu_cau:        lead.nhu_cau,
        ghi_chu:        lead.ghi_chu,
        sale_phu_trach: saleList.length > 0 ? saleList[i % saleList.length] : '',
        label_khach:    `${lead.ten_KH} - ${lead.so_dien_thoai}`,
      }));

      await addKhachHangBatch(khs);
    }

    return NextResponse.json({
      success:      true,
      imported:     newLeads.length,
      duplicates:   duplicateList.length,
      errors:       0,
      importedList: newLeads.map(l => ({ ten_KH: l.ten_KH, nguon: l.nguon })),
      duplicateList,
      errorList:    [],
      bySource,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[API khach-hang/sync-leads] Unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi server: ' + msg }, { status: 500 });
  }
}
