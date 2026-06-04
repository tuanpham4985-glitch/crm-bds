import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getKhachHang, addKhachHang } from '@/lib/google-sheets';
import type { KhachHang } from '@/lib/types';

// ─── Source configs ───────────────────────────────────────────────────────────

const SOURCES = {
  Facebook: 'https://docs.google.com/spreadsheets/d/1GeoXfJOYSA7sUW7RumLuId0jzhUSNvTqVFSLSQeCOHo/export?format=csv&gid=527024522',
  TikTok:   'https://docs.google.com/spreadsheets/d/1Ag2fLU01DRorIxep0V4pjXDkSyYYB9ll4Le8w0ybSU8/export?format=csv&gid=1797661699',
} as const;

// Header dài của Facebook (dễ typo)
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
    const [d, m, y] = raw.trim().split('/').map(Number);
    if (!d || !m || !y) return new Date().toISOString();
    return new Date(y, m - 1, d).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const wb = XLSX.read(text, { type: 'string' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
}

// ─── Per-source mappers ───────────────────────────────────────────────────────

interface LeadRow {
  ten_KH: string;
  so_dien_thoai: string;
  email: string;
  nguon: 'Facebook' | 'TikTok';
  nhu_cau: string;
  ghi_chu: string;
  ngay_tao: string;
}

function mapFacebook(row: Record<string, string>): LeadRow | null {
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

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(): Promise<NextResponse> {
  try {
    // 1. Fetch cả 2 sheet song song
    const [fbRows, ttRows] = await Promise.all([
      fetchCsv(SOURCES.Facebook).catch((e: unknown) => {
        console.error('[sync-leads] Facebook fetch error:', e);
        return [] as Record<string, string>[];
      }),
      fetchCsv(SOURCES.TikTok).catch((e: unknown) => {
        console.error('[sync-leads] TikTok fetch error:', e);
        return [] as Record<string, string>[];
      }),
    ]);

    // 2. Map mỗi nguồn
    const leads: LeadRow[] = [
      ...fbRows.map(mapFacebook).filter((r): r is LeadRow => r !== null),
      ...ttRows.map(mapTikTok).filter((r): r is LeadRow => r !== null),
    ];

    if (leads.length === 0) {
      return NextResponse.json({ success: false, error: 'Cả 2 sheet phễu đều không có dữ liệu hợp lệ' }, { status: 422 });
    }

    // 3. Load KH hiện tại để check trùng
    const existing = await getKhachHang();
    const existingPhones = new Set(existing.map(kh => kh.so_dien_thoai.replace(/\s+/g, '')));

    const importedList:  { ten_KH: string; nguon: string }[] = [];
    const duplicateList: { ten_KH: string; so_dien_thoai: string; nguon: string }[] = [];
    const errorList:     { ten_KH: string; nguon: string; error: string }[] = [];

    // Đếm theo nguồn cho UI
    const bySource: Record<string, { imported: number; duplicates: number }> = {
      Facebook: { imported: 0, duplicates: 0 },
      TikTok:   { imported: 0, duplicates: 0 },
    };

    // 4. Ghi tuần tự để tránh rate-limit Sheets API
    for (const lead of leads) {
      if (existingPhones.has(lead.so_dien_thoai)) {
        duplicateList.push({ ten_KH: lead.ten_KH, so_dien_thoai: lead.so_dien_thoai, nguon: lead.nguon });
        bySource[lead.nguon].duplicates++;
        continue;
      }

      const kh: KhachHang = {
        id_khach_hang:  `KH_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        ngay_tao:       lead.ngay_tao,
        ten_KH:         lead.ten_KH,
        so_dien_thoai:  lead.so_dien_thoai,
        email:          lead.email,
        nguon:          lead.nguon,
        nhu_cau:        lead.nhu_cau,
        ghi_chu:        lead.ghi_chu,
        sale_phu_trach: '',
        label_khach:    `${lead.ten_KH} - ${lead.so_dien_thoai}`,
      };

      try {
        await addKhachHang(kh);
        existingPhones.add(lead.so_dien_thoai);
        importedList.push({ ten_KH: lead.ten_KH, nguon: lead.nguon });
        bySource[lead.nguon].imported++;
        await new Promise(r => setTimeout(r, 150));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errorList.push({ ten_KH: lead.ten_KH, nguon: lead.nguon, error: msg });
      }
    }

    return NextResponse.json({
      success:       true,
      imported:      importedList.length,
      duplicates:    duplicateList.length,
      errors:        errorList.length,
      importedList,
      duplicateList,
      errorList,
      bySource,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[API khach-hang/sync-leads] Unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi server: ' + msg }, { status: 500 });
  }
}
