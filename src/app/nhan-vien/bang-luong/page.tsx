'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  BadgeDollarSign, Calculator, Save, RefreshCw,
  AlertCircle, CheckCircle2, Clock, Banknote, FileText, X, Eye, Upload, Trash2,
  Download, Mail, User
} from 'lucide-react';
import type { BangLuong, NhanVien, SalaryImportRow } from '@/lib/types';
import type { PayrollEntry } from '@/lib/payroll';
import { useAuth } from '@/hooks/useAuth';
import { calculateTaxMonthly, TAX_CONFIG } from '@/lib/tax';

// ── Cấu hình cột cơ bản (id / tên / thực lĩnh) ──
const LAYOUT = {
  KD: { colId: 1, colName: 2, colVal: 38 }, // B=Mã NV, C=Họ tên, AM=Thực Lĩnh
  BO: { colId: 2, colName: 4, colVal: 62 }, // C=Mã ID, E=Họ tên, BK=Lương TL
};

// ── Mapping tất cả cột của file KD (0-indexed, A=0) ──
const KD_COLS = {
  chuc_vu:              3,  // D
  phong_ban:            5,  // F
  ct_tv:                9,  // J  — CT/TV
  cong_thuc_te:        10,  // K
  cong_tinh_luong:     11,  // L
  cong_tv:             12,  // M
  cong_ct:             13,  // N
  luong_tv:            14,  // O
  luong_ct:            15,  // P
  luong_vi_tri:        16,  // Q
  lcb_theo_ngay_cong:  17,  // R
  kpi_quy_mo:          18,  // S  — GĐDA: quy mô & duy trì
  kpi_hieu_qua_van_hanh: 19,// T  — GĐDA: hiệu quả vận hành
  kpi_chat_luong_quan_ly: 20,// U — GĐDA: chất lượng quản lý
  kpi_doanh_thu_gdkd:  21,  // V  — GĐKD/TPKD
  kpi_doanh_thu_nvkd:  22,  // W  — NVKD: doanh thu
  kpi_plus:            23,  // X  — NVKD: KPI Plus
  dieu_chinh_ky_truoc: 24,  // Y
  tong_thu_nhap:       25,  // Z
  luong_dong_bhxh:     26,  // AA
  bhxh_nld:            27,  // AB — BHXH NLĐ 10.5%
  giam_tru_ban_than:   28,  // AC
  so_nguoi_giam_tru:   29,  // AD
  so_tien_giam_tru:    30,  // AE
  thu_nhap_tinh_thue:  31,  // AF
  thue_tncn:           32,  // AG
  so_phut_di_muon:     33,  // AH
  tien_di_muon:        34,  // AI
  tru_khac:            35,  // AJ
  tam_ung_luong:       36,  // AK
  tong_khau_tru:       37,  // AL
  // AM (38) = Thực Lĩnh — đã có trong LAYOUT.KD.colVal
} as const;

// ── Mapping tất cả cột của file BO (0-indexed absolute, offset +2 từ header) ──
// File BO có 2 cột ẩn A,B đầu tiên → Mã NV ở C(2), Họ tên ở E(4), Thực lĩnh ở BK(62)
const BO_COLS = {
  phong_ban:              6,   // G
  chuc_vu:                7,   // H
  luong_ct_thang:         9,   // J  — Tiền lương Chính thức/tháng
  luong_tv_thang:         10,  // K  — Tiền lương Thử việc/tháng
  gio_cong_ct:            13,  // N  — Giờ công CT
  gio_cong_tv:            14,  // O  — Giờ công TV
  ngay_cong_tien_an:      17,  // R  — Ngày công tiền ăn
  luong_cong:             32,  // AG — Lương Công
  luong_ltg:              33,  // AH — Lương LTG
  kpi_hieu_qua:           36,  // AK — KPI Hiệu quả công việc
  tong_phu_cap_thuc_nhan: 45,  // AT — Tổng phụ cấp thực nhận
  phu_cap_tien_an:        46,  // AU — Phụ cấp tiền ăn (miễn thuế)
  tong_luong_phu_cap:     48,  // AW — Tổng lương offline + Phụ cấp
  thuong_tkkd:            49,  // AX — Thưởng TKKD theo giao dịch
  thuong_thang_13:        50,  // AY — Thưởng tháng 13
  luong_dong_bh:          52,  // BA — Lương đóng BH
  bhxh_nld:               53,  // BB — BHXH NLĐ đóng (10.5%)
  giam_tru_ban_than:      55,  // BD — Bản thân người nộp thuế
  so_nguoi_phu_thuoc:     56,  // BE — Số người phụ thuộc
  giam_tru_npt:           57,  // BF — Giảm trừ cho người phụ thuộc
  thu_nhap_chiu_thue:     58,  // BG — Thu nhập chịu thuế
  thue_tncn:              59,  // BH — Thuế TNCN
  tien_ung_phat:          60,  // BI — Tiền đã ứng/phạt/thu tiền DL
  tru_di_muon:            61,  // BJ — Trừ đi muộn về sớm
  // BK (62) = Thực lĩnh — đã có trong LAYOUT.BO.colVal
} as const;

// Chỉ chấp nhận số nguyên dương — bỏ header text, số âm, mã nhóm (I. II. VIC-XX)
function normalizeEmpId(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '0') return '';
  if (/^\d+$/.test(s) && parseInt(s, 10) > 0) return s.padStart(4, '0');
  return '';
}

// Helpers parse giá trị từ cell Excel
const _n = (v: unknown): number => typeof v === 'number' ? v : (Number(v) || 0);
const _s = (v: unknown): string => String(v ?? '').trim();

function parseExcelFile(file: File, loai: 'KD' | 'BO'): Promise<SalaryImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });

        const sheetName =
          wb.SheetNames.find(n => n === 'BẢNG LƯƠNG') ||
          wb.SheetNames.find(n => n.toLowerCase().includes('lương') || n.toLowerCase().includes('luong'));

        if (!sheetName) {
          reject(new Error(`Không tìm thấy sheet "BẢNG LƯƠNG". Các sheet: ${wb.SheetNames.join(', ')}`));
          return;
        }

        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
        const { colId, colName, colVal } = LAYOUT[loai];
        const results: SalaryImportRow[] = [];

        for (const row of rows) {
          const id = normalizeEmpId(row[colId]);
          if (!id) continue;
          const ho_ten = _s(row[colName]);
          if (!ho_ten || /^(tổng|họ và tên|họ tên|name)$/i.test(ho_ten)) continue;
          const thuc_linh = _n(row[colVal]);

          const entry: SalaryImportRow = { id_nhan_vien: id, ho_ten, thuc_linh, loai };

          if (loai === 'KD') {
            const c = KD_COLS;
            entry.chuc_vu             = _s(row[c.chuc_vu]);
            entry.phong_ban           = _s(row[c.phong_ban]);
            entry.ct_tv               = _s(row[c.ct_tv]);
            entry.cong_thuc_te        = _n(row[c.cong_thuc_te]);
            entry.cong_tinh_luong     = _n(row[c.cong_tinh_luong]);
            entry.cong_tv             = _n(row[c.cong_tv]);
            entry.cong_ct             = _n(row[c.cong_ct]);
            entry.luong_tv            = _n(row[c.luong_tv]);
            entry.luong_ct            = _n(row[c.luong_ct]);
            entry.luong_vi_tri        = _n(row[c.luong_vi_tri]);
            entry.lcb_theo_ngay_cong  = _n(row[c.lcb_theo_ngay_cong]);
            entry.kpi_quy_mo          = _n(row[c.kpi_quy_mo]);
            entry.kpi_hieu_qua_van_hanh = _n(row[c.kpi_hieu_qua_van_hanh]);
            entry.kpi_chat_luong_quan_ly = _n(row[c.kpi_chat_luong_quan_ly]);
            entry.kpi_doanh_thu_gdkd  = _n(row[c.kpi_doanh_thu_gdkd]);
            entry.kpi_doanh_thu_nvkd  = _n(row[c.kpi_doanh_thu_nvkd]);
            entry.kpi_plus            = _n(row[c.kpi_plus]);
            entry.dieu_chinh_ky_truoc = _n(row[c.dieu_chinh_ky_truoc]);
            entry.tong_thu_nhap       = _n(row[c.tong_thu_nhap]);
            entry.luong_dong_bhxh     = _n(row[c.luong_dong_bhxh]);
            entry.bhxh_nld            = _n(row[c.bhxh_nld]);
            entry.giam_tru_ban_than   = _n(row[c.giam_tru_ban_than]);
            entry.so_nguoi_giam_tru   = _n(row[c.so_nguoi_giam_tru]);
            entry.so_tien_giam_tru    = _n(row[c.so_tien_giam_tru]);
            entry.thu_nhap_tinh_thue  = _n(row[c.thu_nhap_tinh_thue]);
            entry.thue_tncn           = _n(row[c.thue_tncn]);
            entry.so_phut_di_muon     = Math.round(_n(row[c.so_phut_di_muon]));
            entry.tien_di_muon        = _n(row[c.tien_di_muon]);
            entry.tru_khac            = _n(row[c.tru_khac]);
            entry.tam_ung_luong       = _n(row[c.tam_ung_luong]);
            // Tính lại tong_khau_tru từ các thành phần (Excel có thể bỏ BHXH)
            entry.tong_khau_tru = (entry.bhxh_nld ?? 0)
              + (entry.thue_tncn ?? 0)
              + (entry.tien_di_muon ?? 0)
              + (entry.tru_khac ?? 0)
              + (entry.tam_ung_luong ?? 0);
          } else {
            // ── BO columns ──
            const c = BO_COLS;
            entry.phong_ban           = _s(row[c.phong_ban]);
            entry.chuc_vu             = _s(row[c.chuc_vu]);
            entry.luong_ct            = _n(row[c.luong_ct_thang]);
            entry.luong_tv            = _n(row[c.luong_tv_thang]);
            entry.cong_thuc_te        = _n(row[c.gio_cong_ct]);    // Giờ công CT
            entry.cong_tv             = _n(row[c.gio_cong_tv]);    // Giờ công TV
            entry.cong_tinh_luong     = _n(row[c.ngay_cong_tien_an]);
            entry.luong_cong          = _n(row[c.luong_cong]);
            entry.luong_ltg           = _n(row[c.luong_ltg]);
            entry.kpi_plus            = _n(row[c.kpi_hieu_qua]);
            entry.tong_phu_cap_thuc_nhan = _n(row[c.tong_phu_cap_thuc_nhan]);
            entry.phu_cap_tien_an_bo  = _n(row[c.phu_cap_tien_an]);
            entry.tong_thu_nhap       = _n(row[c.tong_luong_phu_cap]);
            entry.thuong_tkkd         = _n(row[c.thuong_tkkd]);
            entry.thuong_thang_13     = _n(row[c.thuong_thang_13]);
            entry.luong_dong_bhxh     = _n(row[c.luong_dong_bh]);
            entry.bhxh_nld            = _n(row[c.bhxh_nld]);
            entry.giam_tru_ban_than   = _n(row[c.giam_tru_ban_than]);
            entry.so_nguoi_giam_tru   = _n(row[c.so_nguoi_phu_thuoc]);
            entry.so_tien_giam_tru    = _n(row[c.giam_tru_npt]);
            entry.thu_nhap_tinh_thue  = _n(row[c.thu_nhap_chiu_thue]);
            entry.thue_tncn           = _n(row[c.thue_tncn]);
            entry.tien_ung_phat       = _n(row[c.tien_ung_phat]);
            entry.tru_di_muon_bo      = _n(row[c.tru_di_muon]);
            // Tổng khấu trừ tự tính
            entry.tong_khau_tru = entry.bhxh_nld + entry.thue_tncn
              + (entry.tien_ung_phat ?? 0) + (entry.tru_di_muon_bo ?? 0);
          }

          results.push(entry);
        }

        if (results.length === 0) {
          reject(new Error(`Không đọc được dữ liệu từ file ${loai}.`));
        } else {
          resolve(results);
        }
      } catch (err: any) {
        reject(new Error('Lỗi parse Excel: ' + (err?.message ?? err)));
      }
    };
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsArrayBuffer(file);
  });
}

// ---- helpers ----
function fmt(n: number) {
  if (!n) return '0';
  return Math.round(n).toLocaleString('vi-VN');
}
function fmtCurrency(n: number) {
  if (!n) return '0 ₫';
  return Math.round(n).toLocaleString('vi-VN') + ' ₫';
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:            { label: 'Nháp',       cls: 'badge-neutral'  },
  pending_approval: { label: 'Chờ duyệt',  cls: 'badge-warning'  },
  approved:         { label: 'Đã duyệt',   cls: 'badge-info'     },
  paid:             { label: 'Đã trả',     cls: 'badge-success'  },
  locked:           { label: 'Đã khóa',    cls: 'badge-error'    },
};

// ================================================================
export default function BangLuongPage() {
  const { user, isAdmin, isHR, canEditHRM, isLoading: authLoading } = useAuth();

  const now = new Date();
  const [thang, setThang] = useState(now.getMonth() + 1);
  const [nam,   setNam]   = useState(now.getFullYear());

  // Tab: 'import' | 'preview' | 'saved'
  const [tab, setTab] = useState<'import' | 'preview' | 'saved'>('import');

  // Preview state
  const [preview,   setPreview]   = useState<PayrollEntry[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);

  // Saved state
  const [saved,     setSaved]     = useState<BangLuong[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  // Status
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast,  setToast]  = useState<{ msg: string; ok: boolean } | null>(null);

  // Import Excel state
  const [importedKD, setImportedKD] = useState<SalaryImportRow[]>([]);
  const [importedBO, setImportedBO] = useState<SalaryImportRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drawer state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openDrawer = (id: string) => {
    setSelectedId(id);
    setIsDrawerOpen(true);
  };

  // Employee maps
  const [empMap, setEmpMap] = useState<Map<string, string>>(new Map());
  const [depMap, setDepMap] = useState<Map<string, number>>(new Map());
  const [nvMap,  setNvMap]  = useState<Map<string, NhanVien>>(new Map());

  // Slip drawer (Import tab)
  const [slipRow,       setSlipRow]       = useState<SalaryImportRow | null>(null);
  const [isSlipDrawer,  setIsSlipDrawer]  = useState(false);

  // Email modal
  const [emailModal, setEmailModal] = useState<{
    open: boolean; row: SalaryImportRow | null; emailTo: string; sending: boolean;
  }>({ open: false, row: null, emailTo: '', sending: false });

  // --- Tính ngày công chuẩn (Trừ T7 nửa buổi, CN nghỉ, Trừ Lễ VN) ---
  const getVietnameseHolidays = (year: number) => {
    return [
      `${year}-01-01`, // Tết Dương lịch
      `${year}-04-30`, // Giải phóng miền Nam
      `${year}-05-01`, // Quốc tế Lao động
      `${year}-09-02`, // Quốc khánh
    ];
  };

  const calculateWorkdays = (m: number, y: number) => {
    const daysInMonth = new Date(y, m, 0).getDate();
    let standard = 0;
    const holidays = getVietnameseHolidays(y);

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      const dayOfWeek = date.getDay(); // 0: CN, 1: T2, ..., 6: T7
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      if (holidays.includes(dateStr)) continue;

      if (dayOfWeek === 0) {
        // Chủ nhật nghỉ
      } else if (dayOfWeek === 6) {
        standard += 0.5; // Thứ 7 làm nửa buổi
      } else {
        standard += 1;   // Thứ 2-6 làm cả ngày
      }
    }
    return standard;
  };

  // ── Phát hiện loại KD/BO từ tên file ──
  function detectLoai(filename: string): 'KD' | 'BO' {
    const upper = filename.toUpperCase();
    if (upper.includes(' BO ') || upper.includes('-BO-') || upper.includes('_BO_') || upper.endsWith(' BO') || /\bBO\b/.test(upper)) return 'BO';
    return 'KD'; // default KD
  }

  // ── Import nhiều file — parse trực tiếp trên browser ──
  const handleFiles = async (files: File[]) => {
    const xlsFiles = files.filter(f => /\.(xlsx|xls)$/i.test(f.name));
    if (xlsFiles.length === 0) {
      showToast('Chỉ chấp nhận file .xlsx hoặc .xls', false);
      return;
    }
    setIsImporting(true);
    let successCount = 0;
    for (const file of xlsFiles) {
      const loai = detectLoai(file.name);
      try {
        const rows = await parseExcelFile(file, loai);
        if (loai === 'KD') setImportedKD(rows);
        else setImportedBO(rows);
        showToast(`Đọc file ${loai} thành công: ${rows.length} nhân viên`);
        successCount++;
      } catch (e: any) {
        showToast(`Lỗi đọc ${file.name}: ${e?.message ?? e}`, false);
      }
    }
    setIsImporting(false);
  };

  // ── Load employee names ──
  useEffect(() => {
    fetch('/api/nhan-vien')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const m = new Map<string, string>();
          const dm = new Map<string, number>();
          const nvm = new Map<string, NhanVien>();
          d.data.forEach((nv: NhanVien) => {
            m.set(nv.id_nhan_vien, nv.ho_ten);
            dm.set(nv.id_nhan_vien, nv.so_nguoi_phu_thuoc || 0);
            nvm.set(nv.id_nhan_vien, nv);
          });
          setEmpMap(m);
          setDepMap(dm);
          setNvMap(nvm);
        }
      })
      .catch(() => {});
  }, []);

  // ── Show toast ──
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Tải xuống phiếu lương Word (đầy đủ template) ──
  const downloadSlip = async (row: SalaryImportRow) => {
    try {
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
              WidthType, AlignmentType } = await import('docx');

      const ngayIn = new Date();
      const F  = 'Times New Roman';
      const fmtM = (v?: number) => (v != null && v !== 0) ? Math.round(v).toLocaleString('vi-VN') + ' ₫' : '—';
      const fmtV = (v?: number) => (v != null && v !== 0) ? String(Math.round(v)) : '—';
      const isKD = row.loai === 'KD';

      // Cell margins chung (padding bên trong ô)
      const CM = { top: 80, bottom: 80, left: 120, right: 120 };
      const CM_R = { top: 80, bottom: 80, left: 80, right: 140 }; // ô số tiền — padding phải rộng hơn

      // ── builder helpers ──
      const cell = (text: string, opts: {
        w?: number; bold?: boolean; color?: string; bg?: string;
        align?: typeof AlignmentType[keyof typeof AlignmentType]; size?: number; italic?: boolean;
        isRight?: boolean;
      } = {}) =>
        new TableCell({
          width: opts.w != null ? { size: opts.w, type: WidthType.PERCENTAGE } : undefined,
          shading: opts.bg ? { fill: opts.bg } : undefined,
          margins: opts.isRight ? CM_R : CM,
          children: [new Paragraph({
            alignment: opts.align ?? AlignmentType.LEFT,
            spacing: { before: 20, after: 20 },
            children: [new TextRun({
              text, bold: opts.bold ?? false, size: opts.size ?? 22,
              color: opts.color ?? '1F2937', font: F, italics: opts.italic ?? false,
            })],
          })],
        });

      // Section header (full-width, navy bg)
      const secRow = (title: string) => new TableRow({ children: [
        new TableCell({
          columnSpan: 2,
          shading: { fill: '1E3A5F' },
          margins: CM,
          children: [new Paragraph({
            spacing: { before: 40, after: 40 },
            children: [new TextRun({ text: title, bold: true, size: 24, color: 'FFFFFF', font: F })],
          })],
        }),
      ]});

      // Sub-group header (light blue)
      const groupRow = (title: string) => new TableRow({ children: [
        new TableCell({
          columnSpan: 2,
          shading: { fill: 'DBEAFE' },
          margins: CM,
          children: [new Paragraph({
            spacing: { before: 30, after: 30 },
            children: [new TextRun({ text: title, bold: true, size: 20, color: '1D4ED8', font: F, italics: true })],
          })],
        }),
      ]});

      // Info row: label | value (2 cols)
      const infoRow = (label: string, value: string, vBold = false) => new TableRow({ children: [
        cell(label, { w: 55 }),
        cell(value || '—', { w: 45, bold: vBold }),
      ]});

      // Money row: label | số tiền (right-align, optional color)
      const moneyRow = (label: string, value?: number, opts: {
        bold?: boolean; color?: string; bg?: string; indent?: boolean; dim?: boolean;
      } = {}) =>
        new TableRow({ children: [
          cell((opts.indent ? '      ' : '') + label, {
            bg: opts.bg,
            color: opts.dim ? '6B7280' : undefined,
            italic: opts.dim,
          }),
          cell(fmtM(value), {
            align: AlignmentType.RIGHT,
            bold: opts.bold,
            color: opts.dim ? '6B7280' : (opts.color ?? (opts.bold ? '111827' : '374151')),
            bg: opts.bg,
            isRight: true,
          }),
        ]});

      // Separator: dòng thông tin thuế (giảm trừ) — màu xám/xanh, không tính vào khấu trừ trực tiếp
      const taxInfoRow = (label: string, value?: number) =>
        moneyRow(label, value, { color: '2563EB', dim: false });

      // Total row (green bg)
      const totalRow = (label: string, value?: number) => new TableRow({ children: [
        new TableCell({ shading: { fill: 'D1FAE5' }, margins: CM, children: [new Paragraph({
          spacing: { before: 50, after: 50 },
          children: [new TextRun({ text: label, bold: true, size: 24, color: '065F46', font: F })],
        })] }),
        new TableCell({ shading: { fill: 'D1FAE5' }, margins: CM_R, children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 50, after: 50 },
          children: [new TextRun({ text: fmtM(value), bold: true, size: 24, color: '065F46', font: F })],
        })] }),
      ]});

      // Deduction total row (red-ish)
      const deductTotalRow = (label: string, value?: number) => new TableRow({ children: [
        new TableCell({ shading: { fill: 'FEE2E2' }, margins: CM, children: [new Paragraph({
          spacing: { before: 50, after: 50 },
          children: [new TextRun({ text: label, bold: true, size: 24, color: '991B1B', font: F })],
        })] }),
        new TableCell({ shading: { fill: 'FEE2E2' }, margins: CM_R, children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 50, after: 50 },
          children: [new TextRun({ text: fmtM(value), bold: true, size: 24, color: '991B1B', font: F })],
        })] }),
      ]});

      // KPI groups for KD (chỉ render nếu có giá trị > 0)
      const kpiGDDARows = isKD && (row.kpi_quy_mo || row.kpi_hieu_qua_van_hanh || row.kpi_chat_luong_quan_ly) ? [
        groupRow('▸ KPI Giám đốc dự án (GĐDA)'),
        ...(row.kpi_quy_mo          ? [moneyRow('KPI quy mô & duy trì hoạt động', row.kpi_quy_mo, { indent: true })] : []),
        ...(row.kpi_hieu_qua_van_hanh ? [moneyRow('KPI hiệu quả vận hành dự án', row.kpi_hieu_qua_van_hanh, { indent: true })] : []),
        ...(row.kpi_chat_luong_quan_ly ? [moneyRow('KPI chất lượng quản lý vận hành', row.kpi_chat_luong_quan_ly, { indent: true })] : []),
      ] : [];

      const kpiGDKDRows = isKD && row.kpi_doanh_thu_gdkd ? [
        groupRow('▸ KPI Giám đốc / Trưởng phòng KD (GĐKD/TPKD)'),
        moneyRow('KPI doanh thu', row.kpi_doanh_thu_gdkd, { indent: true }),
      ] : [];

      const kpiNVKDRows = isKD && (row.kpi_doanh_thu_nvkd || row.kpi_plus) ? [
        groupRow('▸ KPI Nhân viên Kinh doanh (NVKD)'),
        ...(row.kpi_doanh_thu_nvkd ? [moneyRow('KPI doanh thu', row.kpi_doanh_thu_nvkd, { indent: true })] : []),
        ...(row.kpi_plus ? [moneyRow('KPI Plus — Hiệu quả làm việc', row.kpi_plus, { indent: true })] : []),
      ] : [];

      const doc = new Document({
        sections: [{
          properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 1080 } } },
          children: [
            // ── Tiêu đề công ty ──
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [
              new TextRun({ text: 'CÔNG TY CỔ PHẦN BẤT ĐỘNG SẢN VICTORY HOLDINGS', bold: true, size: 26, font: F }),
            ]}),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [
              new TextRun({ text: 'victoryholdings.com.vn', size: 18, color: '888888', font: F }),
            ]}),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [
              new TextRun({ text: `PHIẾU LƯƠNG THÁNG ${thang}/${nam}`, bold: true, size: 34, font: F }),
            ]}),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 280 }, children: [
              new TextRun({ text: `Khối: ${isKD ? 'Kinh Doanh' : 'Back Office'}`, size: 20, italics: true, color: '666666', font: F }),
            ]}),

            // ── Bảng chính ──
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                // ── I. THÔNG TIN NHÂN SỰ ──
                secRow('I. THÔNG TIN NHÂN SỰ'),
                infoRow('Mã nhân viên', row.id_nhan_vien, true),
                infoRow('Họ và tên', row.ho_ten, true),
                infoRow('Chức vụ', row.chuc_vu || '—'),
                infoRow('Phòng ban', row.phong_ban || '—'),
                infoRow('Loại hợp đồng', row.ct_tv || '—'),

                // ── II. CÔNG THÁNG ──
                secRow('II. CÔNG THÁNG'),
                infoRow('Công thực tế', fmtV(row.cong_thuc_te)),
                infoRow('Công tính lương', fmtV(row.cong_tinh_luong)),
                ...(row.cong_tv  ? [infoRow('Công thử việc (TV)', fmtV(row.cong_tv))]  : []),
                ...(row.cong_ct  ? [infoRow('Công chính thức (CT)', fmtV(row.cong_ct))] : []),
                ...(row.luong_tv ? [moneyRow('Lương thử việc', row.luong_tv)]  : []),
                ...(row.luong_ct ? [moneyRow('Lương chính thức', row.luong_ct)] : []),

                // ── III. THU NHẬP ──
                secRow('III. THU NHẬP'),
                // ── KD Thu nhập ──
                ...(isKD ? [
                  ...(row.luong_vi_tri       ? [moneyRow('Lương vị trí', row.luong_vi_tri)]           : []),
                  ...(row.lcb_theo_ngay_cong ? [moneyRow('LCB theo ngày công', row.lcb_theo_ngay_cong)] : []),
                  ...kpiGDDARows, ...kpiGDKDRows, ...kpiNVKDRows,
                  ...(row.dieu_chinh_ky_truoc ? [moneyRow('Điều chỉnh kỳ trước', row.dieu_chinh_ky_truoc, { color: (row.dieu_chinh_ky_truoc ?? 0) >= 0 ? '059669' : 'DC2626' })] : []),
                ] : [
                  // ── BO Thu nhập ──
                  ...(row.luong_ct         ? [moneyRow('Tiền lương CT/tháng', row.luong_ct)]             : []),
                  ...(row.luong_tv         ? [moneyRow('Tiền lương TV/tháng', row.luong_tv)]             : []),
                  ...(row.luong_cong       ? [moneyRow('Lương Công', row.luong_cong)]                    : []),
                  ...(row.luong_ltg        ? [moneyRow('Lương LTG (làm thêm giờ)', row.luong_ltg)]       : []),
                  ...(row.kpi_plus         ? [moneyRow('KPI Hiệu quả công việc', row.kpi_plus)]          : []),
                  ...(row.thuong_tkkd      ? [moneyRow('Thưởng TKKD theo giao dịch', row.thuong_tkkd)]   : []),
                  ...(row.thuong_thang_13  ? [moneyRow('Thưởng tháng 13', row.thuong_thang_13)]          : []),
                  ...(row.tong_phu_cap_thuc_nhan ? [moneyRow('Tổng phụ cấp thực nhận', row.tong_phu_cap_thuc_nhan)] : []),
                  ...(row.phu_cap_tien_an_bo ? [moneyRow('Phụ cấp tiền ăn (miễn thuế)', row.phu_cap_tien_an_bo)] : []),
                ]),

                // Tổng thu nhập
                totalRow('TỔNG THU NHẬP', row.tong_thu_nhap),

                // ── IV. KHẤU TRỪ ──
                secRow('IV. KHẤU TRỪ'),
                ...(row.luong_dong_bhxh  ? [moneyRow('Lương đóng BHXH (cơ sở tính)', row.luong_dong_bhxh, { dim: true })] : []),
                ...(row.bhxh_nld         ? [moneyRow('BHXH NLĐ đóng (10.5%)', row.bhxh_nld, { color: 'DC2626' })] : []),
                // Giảm trừ thuế: dùng taxInfoRow (màu xanh, không phải tiền bị khấu trừ)
                ...(row.giam_tru_ban_than ? [taxInfoRow('Giảm trừ bản thân (tính thuế)', row.giam_tru_ban_than)] : []),
                ...(row.so_tien_giam_tru  ? [taxInfoRow(`Giảm trừ NPT (${row.so_nguoi_giam_tru ?? 0} người)`, row.so_tien_giam_tru)] : []),
                ...(row.thu_nhap_tinh_thue ? [moneyRow('Thu nhập tính thuế', row.thu_nhap_tinh_thue, { dim: true })] : []),
                ...(row.thue_tncn          ? [moneyRow('Thuế TNCN', row.thue_tncn, { color: 'DC2626' })] : []),
                // KD-specific deductions
                ...(isKD ? [
                  ...(row.so_phut_di_muon  ? [infoRow('Số phút đi muộn', `${Math.round(row.so_phut_di_muon)} phút`)] : []),
                  ...(row.tien_di_muon     ? [moneyRow('Tiền đi muộn', row.tien_di_muon, { color: 'DC2626' })] : []),
                  ...(row.tru_khac         ? [moneyRow('Trừ khác', row.tru_khac, { color: 'DC2626' })] : []),
                  ...(row.tam_ung_luong    ? [moneyRow('Tạm ứng lương', row.tam_ung_luong, { color: 'DC2626' })] : []),
                ] : [
                  // BO-specific deductions
                  ...(row.tien_ung_phat    ? [moneyRow('Tiền đã ứng/phạt/thu tiền DL', row.tien_ung_phat, { color: 'DC2626' })] : []),
                  ...(row.tru_di_muon_bo   ? [moneyRow('Trừ đi muộn về sớm', row.tru_di_muon_bo, { color: 'DC2626' })] : []),
                ]),

                deductTotalRow('TỔNG KHẤU TRỪ', row.tong_khau_tru),
              ],
            }),

            // ── Thực lĩnh (highlight box) ──
            new Paragraph({ spacing: { before: 200, after: 0 } }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [new TableRow({ children: [
                new TableCell({
                  shading: { fill: '064E3B' },
                  children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 100 },
                    children: [new TextRun({
                      text: `LƯƠNG THỰC LĨNH:  ${row.thuc_linh.toLocaleString('vi-VN')} ₫`,
                      bold: true, size: 32, color: 'FFFFFF', font: F,
                    })],
                  })],
                }),
              ]})],
            }),

            // ── Ghi chú + ký tên ──
            new Paragraph({ spacing: { before: 240, after: 60 }, children: [
              new TextRun({ text: 'Mọi thắc mắc về lương vui lòng liên hệ phòng Nhân sự trong vòng 3 ngày làm việc.', size: 18, italics: true, color: '888888', font: F }),
            ]}),
            new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 280 }, children: [
              new TextRun({ text: `Hà Nội, ngày ${ngayIn.getDate()} tháng ${ngayIn.getMonth()+1} năm ${ngayIn.getFullYear()}`, size: 20, font: F }),
            ]}),
            new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [
              new TextRun({ text: 'GIÁM ĐỐC', bold: true, size: 22, font: F }),
            ]}),
            new Paragraph({ alignment: AlignmentType.RIGHT, children: [
              new TextRun({ text: '(Ký và đóng dấu)', size: 18, italics: true, color: '888888', font: F }),
            ]}),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `Phieu_luong_${row.id_nhan_vien}_T${thang}_${nam}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast('Lỗi tạo file Word: ' + (e?.message ?? e), false);
    }
  };

  // ── Mở modal gửi email ──
  function openEmailModal(row: SalaryImportRow) {
    const nv = nvMap.get(row.id_nhan_vien);
    setEmailModal({ open: true, row, emailTo: nv?.email || '', sending: false });
  }

  // ── Gửi email lương ──
  const sendSalaryEmail = async () => {
    const { row, emailTo } = emailModal;
    if (!row || !emailTo) return;
    setEmailModal(m => ({ ...m, sending: true }));
    try {
      const res = await fetch('/api/email/salary-slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ho_ten: row.ho_ten, id_nhan_vien: row.id_nhan_vien, thuc_linh: row.thuc_linh, loai: row.loai, thang, nam, email_to: emailTo }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Đã gửi phiếu lương tới ${emailTo}`);
        setEmailModal({ open: false, row: null, emailTo: '', sending: false });
      } else {
        showToast('Lỗi gửi email: ' + data.error, false);
        setEmailModal(m => ({ ...m, sending: false }));
      }
    } catch (e: any) {
      showToast('Lỗi kết nối: ' + (e?.message ?? e), false);
      setEmailModal(m => ({ ...m, sending: false }));
    }
  };

  // ── Tính lương (preview) ──
  const handleCalculate = useCallback(async () => {
    if (!canEditHRM) return;
    setCalcLoading(true);
    setPreview([]);
    try {
      const res = await fetch('/api/payroll/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang, nam }),
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
        setTab('preview');
      } else {
        showToast('Lỗi: ' + data.error, false);
      }
    } catch {
      showToast('Lỗi kết nối khi tính lương', false);
    } finally {
      setCalcLoading(false);
    }
  }, [canEditHRM, thang, nam]);

  // ── Load saved payrolls ──
  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch(`/api/payroll?thang=${thang}&nam=${nam}`);
      const data = await res.json();
      if (data.success) setSaved(data.data);
    } catch {
      showToast('Lỗi tải dữ liệu đã lưu', false);
    } finally {
      setSavedLoading(false);
    }
  }, [thang, nam]);

  useEffect(() => {
    if (tab === 'saved') loadSaved();
  }, [tab, loadSaved]);

  useEffect(() => {
    if (!authLoading && !canEditHRM) {
      setTab('saved');
    }
  }, [authLoading, canEditHRM]);

  const allImported = [...importedKD, ...importedBO];
  const totalThucLinh = allImported.reduce((s, r) => s + r.thuc_linh, 0);

  // ── Inline edit fields ──
  function updateField(idx: number, field: 'thuong' | 'phat' | 'so_ngay_nghi_khong_luong' | 'so_gio_ot' | 'so_nguoi_phu_thuoc', val: string) {
    const raw = Number(val) || 0;
    setPreview(prev => {
      const next = [...prev];
      const row  = { ...next[idx] };
      row[field] = raw;

      // 1. Tính công thực tế
      row.so_ngay_lam_viec_thuc_te = row.so_ngay_cong_chuan - row.so_ngay_nghi_khong_luong;
      
      // 2. Lương theo ngày công
      row.salary_by_day = row.so_ngay_cong_chuan > 0 
        ? (row.luong_co_ban / row.so_ngay_cong_chuan) * row.so_ngay_lam_viec_thuc_te
        : 0;

      // 3. Tính OT
      const hourly_rate = row.so_ngay_cong_chuan > 0 ? (row.luong_co_ban / row.so_ngay_cong_chuan / 8) : 0;
      row.ot_pay = row.so_gio_ot * hourly_rate * 1.5;

      // 4. Gross
      const gross = row.salary_by_day + row.hoa_hong + row.thuong + row.ot_pay - row.phat;
      row.gross = gross;

      // 5. Bảo hiểm
      const bao_hiem = row.isProbation ? 0 : row.luong_co_ban * 0.105;
      row.bao_hiem = bao_hiem;

      // 6. Thuế TNCN
      let thue_ = 0;
      let tttt = 0;
      const so_phu_thuoc = row.so_nguoi_phu_thuoc || 0;

      // Note: Handle Probation, Collaborator, and Intern for 10% flat tax
      if (row.isProbation || row.isCollaborator || row.isIntern) {
        tttt = gross;
        if (tttt >= 2000000) {
          thue_ = Math.round(tttt * 0.1);
        }
      } else {
        const giam_tru = TAX_CONFIG.giam_tru_ban_than + (TAX_CONFIG.giam_tru_phu_thuoc * so_phu_thuoc);
        tttt = Math.max(0, gross - bao_hiem - giam_tru);
        thue_ = Math.round(calculateTaxMonthly(tttt));
      }
      
      row.thu_nhap_chiu_thue = tttt;
      row.thue       = thue_;
      row.tong_luong = gross - bao_hiem - thue_;

      // 7. Cập nhật dynamic items để hiển thị Drawer đồng bộ
      const items: any[] = [];
      if (row.salary_by_day > 0) items.push({ loai_khoan: 'Lương thực tế', nhom: 'thu_nhap', so_tien: Math.round(row.salary_by_day), ghi_chu: '' });
      if (row.hoa_hong > 0)      items.push({ loai_khoan: 'Hoa hồng BĐS', nhom: 'thu_nhap', so_tien: Math.round(row.hoa_hong), ghi_chu: '' });
      if (row.thuong > 0)        items.push({ loai_khoan: 'Thưởng', nhom: 'thu_nhap', so_tien: Math.round(row.thuong), ghi_chu: '' });
      if (row.ot_pay > 0)        items.push({ loai_khoan: 'Lương OT', nhom: 'thu_nhap', so_tien: Math.round(row.ot_pay), ghi_chu: '' });
      if (row.phat > 0)          items.push({ loai_khoan: 'Phạt', nhom: 'khau_tru', so_tien: Math.round(row.phat), ghi_chu: '' });
      if (row.bao_hiem > 0)      items.push({ loai_khoan: 'BHXH (10.5%)', nhom: 'khau_tru', so_tien: Math.round(row.bao_hiem), ghi_chu: '' });
      if (row.thue > 0)          items.push({ loai_khoan: 'Thuế TNCN', nhom: 'khau_tru', so_tien: Math.round(row.thue), ghi_chu: '' });
      
      (row as any).items = items;
      
      next[idx] = row;
      return next;
    });
  }

  // ── Lưu bảng lương từ Import Excel ──
  const handleSaveImport = async () => {
    if (!canEditHRM || allImported.length === 0) return;
    if (!confirm(`Lưu bảng lương import tháng ${thang}/${nam} (${allImported.length} nhân viên)?\nBản ghi trùng sẽ bị bỏ qua.`)) return;

    setSaving(true);
    try {
      const entries: PayrollEntry[] = allImported.map(row => ({
        id_nhan_vien: row.id_nhan_vien,
        ho_ten: row.ho_ten,
        thang,
        nam,
        luong_co_ban: 0,
        doanh_thu: 0,
        hoa_hong: 0,
        thuong: 0,
        phat: 0,
        so_ngay_cong_chuan: 0,
        so_ngay_lam_viec_thuc_te: 0,
        so_ngay_nghi_khong_luong: 0,
        so_gio_ot: 0,
        salary_by_day: 0,
        ot_pay: 0,
        bao_hiem: 0,
        bh_company: 0,
        thue: 0,
        gross: row.thuc_linh,
        tong_luong: row.thuc_linh,
        trang_thai: 'draft',
      }));

      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang, nam, entries }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || `Đã lưu thành công ${data.saved} bản ghi!`);
        setImportedKD([]);
        setImportedBO([]);
        setTab('saved');
        await loadSaved();
      } else {
        showToast('Lỗi: ' + (data.error || data.errors?.join(', ')), false);
      }
    } catch (err) {
      showToast('Lỗi lưu bảng lương', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Lưu bảng lương ──
  const handleSave = async () => {
    if (!canEditHRM || preview.length === 0) return;
    if (!confirm(`Lưu bảng lương tháng ${thang}/${nam}?\nBản ghi trùng sẽ bị bỏ qua.`)) return;
    
    console.log('[Payroll] Saving entries:', preview.length, { thang, nam });
    setSaving(true);
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang, nam, entries: preview }),
      });
      const data = await res.json();
      console.log('[Payroll] Save response:', data);

      if (data.success) {
        showToast(data.message || `Đã lưu thành công ${data.saved} bản ghi!`);
        setPreview([]);
        setTab('saved');
        await loadSaved();
      } else {
        showToast('Lỗi: ' + (data.error || data.errors?.join(', ')), false);
      }
    } catch (err) {
      console.error('[Payroll] Save error:', err);
      showToast('Lỗi lưu bảng lương', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Đổi trạng thái ──
  const changeStatus = async (id: string, trang_thai: string) => {
    const res = await fetch('/api/payroll', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, trang_thai }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã cập nhật trạng thái');
      loadSaved();
    } else {
      showToast('Lỗi: ' + data.error, false);
    }
  };

  // ── Xuất báo cáo DOCX ──
  const handleExport = async (isYearly = false) => {
    if (exporting) return;
    setExporting(true);
    try {
      const urlParams = isYearly ? `nam=${nam}` : `thang=${thang}&nam=${nam}`;
      const res = await fetch(`/api/payroll/export?${urlParams}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Lỗi xuất file');
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isYearly ? `Bao_cao_luong_nam_${nam}.docx` : `Bao_cao_luong_${thang}_${nam}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast(isYearly ? `Đã xuất báo cáo năm ${nam}` : 'Đã xuất báo cáo tháng');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xuất file', false);
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) return <div className="loading-spinner"><div className="spinner" /></div>;

  // ── Access Control Filter ──
  const displaySaved = canEditHRM ? saved : saved.filter(bl => bl.id_nhan_vien === user?.id_nhan_vien);

  // ── Tổng kết preview ──
  const totalNet  = preview.reduce((s, r) => s + r.tong_luong, 0);
  const totalComm = preview.reduce((s, r) => s + r.hoa_hong,   0);
  const totalRev  = preview.reduce((s, r) => s + r.doanh_thu,  0);

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          background: toast.ok ? 'var(--success-bg)' : 'var(--danger-bg)',
          color: toast.ok ? 'var(--success-text)' : 'var(--danger-text)',
          border: `1px solid ${toast.ok ? 'var(--success-border)' : 'var(--danger-border)'}`,
          borderRadius: 'var(--radius-lg)', padding: '12px 20px',
          boxShadow: 'var(--shadow-md)', fontSize: '0.875rem', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'slideUp var(--transition) ease',
        }}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Bảng lương</h1>
          <p>Import từ file Excel KD/BO hoặc tính từ HOP_DONG + PIPELINE</p>
        </div>
        {canEditHRM && tab === 'import' && allImported.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={handleSaveImport}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Đang lưu...' : `Lưu ${allImported.length} bản ghi`}
          </button>
        )}
        {canEditHRM && tab === 'preview' && preview.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Đang lưu...' : `Lưu ${preview.length} bản ghi`}
          </button>
        )}
        {tab === 'saved' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {canEditHRM && displaySaved.length > 0 && (
              <>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleExport(false)} 
                  disabled={exporting}
                  style={{ background: 'var(--info-text)', borderColor: 'var(--info-text)' }}
                >
                  <FileText size={15} />
                  {exporting ? '...' : `Xuất tháng ${thang}`}
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleExport(true)} 
                  disabled={exporting}
                  style={{ background: '#6366f1', borderColor: '#6366f1' }}
                >
                  <Calculator size={15} />
                  {exporting ? '...' : `Xuất năm ${nam}`}
                </button>
              </>
            )}
            <button className="btn btn-secondary" onClick={loadSaved} disabled={savedLoading}>
              <RefreshCw size={15} />
              Làm mới
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, width: 120 }}>
            <label className="form-label">Tháng</label>
            <select className="form-select" value={thang} onChange={e => setThang(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, width: 100 }}>
            <label className="form-label">Năm</label>
            <input
              type="number"
              className="form-input"
              value={nam}
              min={2020} max={2100}
              onChange={e => setNam(Number(e.target.value))}
            />
          </div>
          {canEditHRM && (
            <button
              className="btn btn-secondary"
              onClick={handleCalculate}
              disabled={calcLoading}
            >
              <Calculator size={15} />
              {calcLoading ? 'Đang tính...' : 'Tính lương'}
            </button>
          )}
          {/* Tab switcher */}
          {canEditHRM && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {([
                { key: 'import',  label: '📥 Import Excel' },
                { key: 'preview', label: '📊 Preview' },
                { key: 'saved',   label: '📁 Đã lưu' },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: '7px 16px', borderRadius: 'var(--radius-full)',
                    fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
                    border: '1px solid',
                    background: tab === t.key ? 'var(--primary)' : 'var(--bg-page)',
                    color: tab === t.key ? '#fff' : 'var(--text-muted)',
                    borderColor: tab === t.key ? 'var(--primary)' : 'var(--border-light)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== TAB: IMPORT EXCEL ===== */}
      {canEditHRM && tab === 'import' && (
        <>
          {/* Hidden file input - multiple */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              const files = Array.from(e.target.files || []);
              if (files.length) handleFiles(files);
              e.target.value = '';
            }}
          />

          {/* Drop zone */}
          <div
            className="card"
            style={{
              marginBottom: 20, padding: 0,
              border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border-light)'}`,
              background: isDragging ? 'var(--primary-bg)' : undefined,
              transition: 'all 0.15s',
              cursor: isImporting ? 'wait' : 'pointer',
            }}
            onClick={() => !isImporting && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setIsDragging(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length) handleFiles(files);
            }}
          >
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              {isImporting ? (
                <>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontWeight: 500, color: 'var(--text-body)' }}>Đang đọc file...</div>
                </>
              ) : (
                <>
                  <Upload size={32} style={{ color: 'var(--primary)', marginBottom: 10 }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-title)', marginBottom: 4 }}>
                    Kéo thả hoặc nhấn để chọn file
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Chọn 1 hoặc 2 file cùng lúc — tên file chứa <strong>KD</strong> hoặc <strong>BO</strong> để tự phân loại
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {importedKD.length > 0 ? (
                      <span style={{ fontSize: '0.78rem', background: 'var(--primary-bg)', color: 'var(--primary)', padding: '3px 10px', borderRadius: 'var(--radius-full)', fontWeight: 500 }}>
                        <CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        KD: {importedKD.length} NV
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', background: 'var(--bg-muted)', color: 'var(--text-muted)', padding: '3px 10px', borderRadius: 'var(--radius-full)' }}>
                        KD: chưa có
                      </span>
                    )}
                    {importedBO.length > 0 ? (
                      <span style={{ fontSize: '0.78rem', background: '#e0e7ff', color: '#6366f1', padding: '3px 10px', borderRadius: 'var(--radius-full)', fontWeight: 500 }}>
                        <CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        BO: {importedBO.length} NV
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', background: 'var(--bg-muted)', color: 'var(--text-muted)', padding: '3px 10px', borderRadius: 'var(--radius-full)' }}>
                        BO: chưa có
                      </span>
                    )}
                    {(importedKD.length > 0 || importedBO.length > 0) && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '3px 10px', height: 'auto' }}
                        onClick={e => { e.stopPropagation(); setImportedKD([]); setImportedBO([]); }}
                      >
                        <Trash2 size={12} /> Xóa
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Table tổng hợp */}
          {allImported.length > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
                {[
                  { label: `KD thực lĩnh (${importedKD.length} NV)`,  value: fmt(importedKD.reduce((s,r)=>s+r.thuc_linh,0)), color: 'var(--primary)' },
                  { label: `BO thực lĩnh (${importedBO.length} NV)`,  value: importedBO.length > 0 ? fmt(importedBO.reduce((s,r)=>s+r.thuc_linh,0)) : '—', color: '#6366f1' },
                  { label: 'Tổng thực lĩnh',                          value: fmt(totalThucLinh), color: 'var(--success-text)' },
                ].map(k => (
                  <div key={k.label} className="kpi-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div>
                      <div className="kpi-label">{k.label}</div>
                      <div className="kpi-value" style={{ fontSize: '1.1rem', color: k.color }}>{k.value}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: 0 }}>
                <div className="table-wrapper">
                  <table className="data-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 30 }}>#</th>
                        <th style={{ width: 60 }}>Loại</th>
                        <th style={{ width: 90 }}>Mã NV</th>
                        <th>Họ và tên</th>
                        <th style={{ textAlign: 'right', fontWeight: 700 }}>Thực lĩnh</th>
                        <th style={{ textAlign: 'center', width: 130 }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allImported.map((row, idx) => (
                        <tr key={`${row.loai}-${row.id_nhan_vien}-${idx}`}>
                          <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                          <td>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                              background: row.loai === 'KD' ? 'var(--primary-bg)' : '#e0e7ff',
                              color: row.loai === 'KD' ? 'var(--primary)' : '#6366f1',
                            }}>{row.loai}</span>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.id_nhan_vien}</td>
                          <td style={{ fontWeight: 500 }}>{row.ho_ten}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: row.thuc_linh > 0 ? 'var(--success-text)' : 'var(--text-muted)' }}>
                            {fmt(row.thuc_linh)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              <button title="Xem chi tiết" className="btn btn-secondary" style={{ padding: '4px 7px' }}
                                onClick={() => { setSlipRow(row); setIsSlipDrawer(true); }}>
                                <Eye size={13} />
                              </button>
                              <button title="Tải xuống Word" className="btn btn-secondary" style={{ padding: '4px 7px', color: '#2563eb' }}
                                onClick={() => downloadSlip(row)}>
                                <Download size={13} />
                              </button>
                              <button title="Gửi email" className="btn btn-secondary" style={{ padding: '4px 7px', color: '#059669' }}
                                onClick={() => openEmailModal(row)}>
                                <Mail size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--bg-muted)', fontWeight: 700 }}>
                        <td colSpan={5} style={{ textAlign: 'right', padding: '10px 16px' }}>Tổng cộng:</td>
                        <td style={{ textAlign: 'right', color: 'var(--success-text)', padding: '10px 16px' }}>{fmt(totalThucLinh)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
              Chưa có dữ liệu — kéo thả file vào vùng trên để bắt đầu
            </div>
          )}
        </>
      )}

      {/* ===== TAB: PREVIEW ===== */}
      {canEditHRM && tab === 'preview' && (
        <>
          {/* KPI summary */}
          {preview.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
              {[
                { label: 'Doanh thu chốt', value: fmt(totalRev),  icon: <Banknote size={18} />, color: 'var(--primary)' },
                { label: 'Tổng hoa hồng',  value: fmt(totalComm), icon: <BadgeDollarSign size={18} />, color: '#f59e0b' },
                { label: 'Tổng NET chi',   value: fmt(totalNet),  icon: <CheckCircle2 size={18} />, color: 'var(--success-text)' },
              ].map(k => (
                <div key={k.label} className="kpi-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ color: k.color, background: `${k.color}15`, borderRadius: 'var(--radius-md)', padding: 10 }}>
                    {k.icon}
                  </div>
                  <div>
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-value" style={{ fontSize: '1.1rem' }}>{k.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            {calcLoading ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                Đang tính toán lương và hoa hồng từ Sheets...
              </div>
            ) : preview.length === 0 ? (
              <div className="empty-state" style={{ padding: 60 }}>
                <BadgeDollarSign size={40} />
                <h3>Chưa có dữ liệu preview</h3>
                <p>Chọn tháng/năm và nhấn <strong>Tính lương</strong></p>
              </div>
            ) : (
              <div className="table-wrapper" style={{ overflow: 'visible' }}>
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th>
                      <th>Nhân viên</th>
                      <th style={{ textAlign: 'right' }}>Tổng thu nhập (Gross)</th>
                      <th style={{ textAlign: 'right' }}>Khấu trừ (Thuế, BH, Phạt)</th>
                      <th style={{ textAlign: 'right', fontWeight: 700 }}>Thực nhận (Net)</th>
                      <th style={{ textAlign: 'center', width: 90 }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, idx) => {
                      const tong_khau_tru = (row.bao_hiem || 0) + (row.thue || 0) + (row.phat || 0);
                      return (
                        <tr key={row.id_nhan_vien}>
                          <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                          <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                            <div>{empMap.get(row.id_nhan_vien) || row.ho_ten || row.id_nhan_vien}</div>
                            <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                              {(!row.isProbation && !row.isCollaborator && !row.isIntern) && <span style={{ fontSize: '0.65rem', color: 'var(--primary)', background: 'var(--primary-bg)', padding: '1px 4px', borderRadius: 4 }}>Chính thức</span>}
                              {row.isProbation && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-muted)', padding: '1px 4px', borderRadius: 4 }}>Thử việc</span>}
                              {row.isCollaborator && <span style={{ fontSize: '0.65rem', color: '#6366f1', background: '#e0e7ff', padding: '1px 4px', borderRadius: 4 }}>CTV</span>}
                              {row.isIntern && <span style={{ fontSize: '0.65rem', color: '#10b981', background: '#ecfdf5', padding: '1px 4px', borderRadius: 4 }}>Học viên</span>}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(row.gross)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--danger-text)' }}>-{fmt(tong_khau_tru)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success-text)' }}>{fmt(row.tong_luong)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => openDrawer(row.id_nhan_vien)}>
                              <Eye size={14} style={{ marginRight: 4 }} />
                              Chi tiết
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {preview.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <AlertCircle size={13} />
              Công chuẩn {nam}: T2-T6=1, T7=0.5. Đã trừ các ngày lễ VN. Lương = (Lương CB / Công chuẩn) × Thực tế. OT × 1.5.
            </div>
          )}
        </>
      )}

      {/* ===== TAB: SAVED ===== */}
      {tab === 'saved' && (
        <div className="card" style={{ padding: 0 }}>
          {savedLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              Đang tải...
            </div>
          ) : displaySaved.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <Clock size={40} />
              <h3>Chưa có bảng lương tháng {thang}/{nam}</h3>
              {canEditHRM && <p>Chuyển sang tab Preview, tính lương rồi lưu.</p>}
            </div>
          ) : (
            <div className="table-wrapper" style={{ overflow: 'visible' }}>
              <table className="data-table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th>Nhân viên</th>
                    <th style={{ textAlign: 'right' }}>Tổng thu nhập (Gross)</th>
                    <th style={{ textAlign: 'right' }}>Khấu trừ (Thuế, BH, Phạt)</th>
                    <th style={{ textAlign: 'right', fontWeight: 700 }}>Thực nhận (Net)</th>
                    <th style={{ textAlign: 'center', width: 100 }}>Trạng thái</th>
                    <th style={{ textAlign: 'center', width: 140 }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {displaySaved.map((bl, idx) => {
                    const meta = STATUS_META[bl.trang_thai] ?? STATUS_META.draft;
                    const tong_khau_tru = (bl.bao_hiem || 0) + (bl.thue || 0) + (bl.phat || 0);
                    return (
                      <tr key={bl.id}>
                        <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                          <div>{empMap.get(bl.id_nhan_vien) || bl.id_nhan_vien}</div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                            {(!bl.isProbation && !bl.isCollaborator && !bl.isIntern) && <span style={{ fontSize: '0.65rem', color: 'var(--primary)', background: 'var(--primary-bg)', padding: '1px 4px', borderRadius: 4 }}>Chính thức</span>}
                            {bl.isProbation && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-muted)', padding: '1px 4px', borderRadius: 4 }}>Thử việc</span>}
                            {bl.isCollaborator && <span style={{ fontSize: '0.65rem', color: '#6366f1', background: '#e0e7ff', padding: '1px 4px', borderRadius: 4 }}>CTV</span>}
                            {bl.isIntern && <span style={{ fontSize: '0.65rem', color: '#10b981', background: '#ecfdf5', padding: '1px 4px', borderRadius: 4 }}>Học viên</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(bl.gross ?? (bl.salary_by_day + bl.hoa_hong + bl.thuong + bl.ot_pay))}</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger-text)' }}>-{fmt(tong_khau_tru)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success-text)' }}>{fmt(bl.tong_luong)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${meta.cls}`}>{meta.label}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => openDrawer(bl.id_nhan_vien)}>
                              <Eye size={14} /> Chi tiết
                            </button>
                            {canEditHRM && (
                              <select
                                className="form-select"
                                style={{ padding: '2px 22px 2px 6px', fontSize: '0.75rem', height: 26, width: 'auto' }}
                                value={bl.trang_thai}
                                onChange={e => changeStatus(bl.id, e.target.value)}
                                disabled={bl.trang_thai === 'locked'}
                              >
                                <option value="draft">Nháp</option>
                                <option value="pending_approval">Chờ duyệt</option>
                                <option value="approved">Đã duyệt</option>
                                <option value="paid">Đã trả</option>
                                <option value="locked">Đã khóa</option>
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== DRAWER CHI TIẾT LƯƠNG ===== */}
      <div className={`drawer-overlay ${isDrawerOpen ? 'open' : ''}`} onClick={() => setIsDrawerOpen(false)} />
      <div className={`drawer-panel ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3>Chi tiết lương</h3>
          <button className="btn-icon" onClick={() => setIsDrawerOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          {(() => {
            if (!selectedId) return null;
            let drawerRecord: PayrollEntry | BangLuong | null = null;
            let isPreviewMode = false;
            let drawerIdx = -1;

            if (tab === 'preview') {
              drawerIdx = preview.findIndex(r => r.id_nhan_vien === selectedId);
              if (drawerIdx !== -1) {
                drawerRecord = preview[drawerIdx];
                isPreviewMode = true;
              }
            } else {
              drawerRecord = saved.find(r => r.id_nhan_vien === selectedId) || null;
            }

            if (!drawerRecord) return <div className="text-muted text-center mt-4">Không tìm thấy dữ liệu</div>;

            const ho_ten = empMap.get(drawerRecord.id_nhan_vien) || (drawerRecord as any).ho_ten || drawerRecord.id_nhan_vien;
            const items = (drawerRecord as any).items || [];
            
            // Nếu không có items (dữ liệu cũ), tự tạo items ảo để hiển thị đồng nhất
            const _actual   = (drawerRecord as any).so_ngay_lam_viec_thuc_te;
            const _standard = (drawerRecord as any).so_ngay_cong_chuan;
            const _congNote = (_actual != null && _standard != null)
              ? `${_actual}/${_standard} ngày`
              : '';
            const displayItems = items.length > 0 ? items : [
              { loai_khoan: 'Lương thực tế', nhom: 'thu_nhap', so_tien: drawerRecord.salary_by_day, ghi_chu: _congNote },
              { loai_khoan: 'Hoa hồng', nhom: 'thu_nhap', so_tien: drawerRecord.hoa_hong, ghi_chu: '' },
              { loai_khoan: 'Thưởng', nhom: 'thu_nhap', so_tien: drawerRecord.thuong, ghi_chu: '' },
              { loai_khoan: 'Lương OT', nhom: 'thu_nhap', so_tien: drawerRecord.ot_pay, ghi_chu: '' },
              { loai_khoan: 'Phạt', nhom: 'khau_tru', so_tien: drawerRecord.phat, ghi_chu: '' },
              { loai_khoan: 'BHXH (10.5%)', nhom: 'khau_tru', so_tien: drawerRecord.bao_hiem, ghi_chu: '' },
              { loai_khoan: 'Thuế TNCN', nhom: 'khau_tru', so_tien: drawerRecord.thue, ghi_chu: '' },
            ].filter(i => i.so_tien !== 0);

            const incomeItems    = displayItems.filter((i: any) => i.nhom === 'thu_nhap');
            const deductionItems = displayItems.filter((i: any) => i.nhom === 'khau_tru');
            const companyItems   = displayItems.filter((i: any) => i.nhom === 'chi_phi_cty');

            const totalGross = incomeItems.reduce((s: number, i: any) => s + i.so_tien, 0);
            const totalDed   = deductionItems.reduce((s: number, i: any) => s + i.so_tien, 0);
            const totalComp  = companyItems.reduce((s: number, i: any) => s + i.so_tien, 0);

            const so_npt = (drawerRecord as any).so_nguoi_phu_thuoc ?? depMap.get(drawerRecord.id_nhan_vien) ?? 0;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Header Profile */}
                <div style={{ background: 'var(--bg-page)', padding: 16, borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: 4 }}>{ho_ten}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    {drawerRecord.isIntern ? 'Học viên (Thực tập)' : drawerRecord.isCollaborator ? 'Cộng tác viên (CTV)' : drawerRecord.isProbation ? 'Thử việc' : 'Chính thức'} | Tháng {thang}/{nam}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.8rem', color: 'var(--text-body)', borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
                    <div>Lương hợp đồng: <strong>{fmt(drawerRecord.luong_co_ban || (drawerRecord as any).luong_dong_bh)}</strong></div>
                    <div>Lương đóng BH: <strong>{fmt((drawerRecord as any).luong_dong_bh || drawerRecord.luong_co_ban)}</strong></div>
                    
                    {(!drawerRecord.isProbation && !drawerRecord.isCollaborator && !drawerRecord.isIntern) && (
                      <>
                        <div style={{ color: 'var(--info-text)' }}>Giảm trừ bản thân: <strong>{fmt(11000000)}</strong></div>
                        <div style={{ color: 'var(--info-text)' }}>Giảm trừ NPT ({so_npt}): <strong>{fmt(so_npt * 4400000)}</strong></div>
                      </>
                    )}
                    
                    <div>TN chịu thuế: <strong>{fmt((drawerRecord as any).thu_nhap_chiu_thue || 0)}</strong></div>
                    <div>Tổng chi phí: <strong style={{color: 'var(--primary)'}}>{fmt((drawerRecord as any).tong_chi_phi || (totalGross + totalComp))}</strong></div>
                  </div>
                </div>

                {/* 1. THU NHẬP */}
                <div className="form-section">
                  <div className="form-section-title">1. Thu nhập (Gross)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {incomeItems.map((item: any, i: number) => (
                      <div key={i} className="card" style={{ padding: '10px 14px', boxShadow: 'none', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-body)' }}>{item.loai_khoan}</div>
                          {item.ghi_chu ? <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{item.ghi_chu}</div> : null}
                        </div>
                        <div style={{ fontWeight: 600, color: 'var(--text-title)' }}>{fmtCurrency(item.so_tien)}</div>
                      </div>
                    ))}
                    {isPreviewMode && (
                       <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                         * Điều chỉnh Thưởng/OT/Nghỉ ở bảng Preview để cập nhật items
                       </div>
                    )}
                  </div>
                  <div style={{ marginTop: 12, textAlign: 'right', fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>
                    Tổng Gross: {fmtCurrency(totalGross)}
                  </div>
                </div>

                {/* 2. KHẤU TRỪ */}
                <div className="form-section">
                  <div className="form-section-title">2. Khấu trừ (Trừ vào lương)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {deductionItems.map((item: any, i: number) => (
                      <div key={i} className="card" style={{ padding: '10px 14px', boxShadow: 'none', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-body)' }}>{item.loai_khoan}</div>
                        <div style={{ fontWeight: 600, color: 'var(--danger-text)' }}>-{fmtCurrency(item.so_tien)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, textAlign: 'right', fontSize: '1rem', fontWeight: 600, color: 'var(--danger-text)' }}>
                    Tổng khấu trừ: -{fmtCurrency(totalDed)}
                  </div>
                </div>

                {/* 3. CHI PHÍ NHÂN SỰ CÔNG TY */}
                {companyItems.length > 0 && (
                  <div className="form-section">
                    <div className="form-section-title">3. Chi phí nhân sự Công ty trả (Không ảnh hưởng lương)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                      {companyItems.map((item: any, i: number) => (
                        <div key={i} className="card" style={{ padding: '10px 14px', boxShadow: 'none', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-body)' }}>{item.loai_khoan}</div>
                          <div style={{ fontWeight: 600, color: 'var(--info-text)' }}>{fmtCurrency(item.so_tien)}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, textAlign: 'right', fontSize: '1rem', fontWeight: 600, color: 'var(--info-text)' }}>
                      Tổng CP Công ty trả: {fmtCurrency(totalComp)}
                    </div>
                  </div>
                )}

                {/* 4. THỰC NHẬN */}
                <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: 20, borderRadius: 'var(--radius-lg)', border: '1px solid rgba(16, 185, 129, 0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Thực nhận (NET)</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success-text)' }}>
                    {fmtCurrency(totalGross - totalDed)}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
      {/* ===== SLIP DRAWER (Import tab) ===== */}
      <div className={`drawer-overlay ${isSlipDrawer ? 'open' : ''}`} onClick={() => setIsSlipDrawer(false)} />
      <div className={`drawer-panel ${isSlipDrawer ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3>Chi tiết phiếu lương</h3>
          <button className="btn-icon" onClick={() => setIsSlipDrawer(false)}><X size={20} /></button>
        </div>
        <div className="drawer-body">
          {slipRow && (() => {
            const nv = nvMap.get(slipRow.id_nhan_vien);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Profile */}
                <div style={{ background: 'var(--bg-page)', padding: 16, borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontWeight: 700, fontSize: '1.1rem' }}>
                      {slipRow.ho_ten.split(' ').pop()?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem' }}>{slipRow.ho_ten}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {slipRow.id_nhan_vien} · {slipRow.loai === 'KD' ? 'Kinh doanh' : 'Back Office'}
                        {nv?.phong_KD ? ` · ${nv.phong_KD}` : ''}
                      </div>
                    </div>
                  </div>
                  {nv && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.8rem', color: 'var(--text-body)', borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
                      {nv.email      && <div><span style={{ color: 'var(--text-muted)' }}>Email: </span>{nv.email}</div>}
                      {nv.so_dien_thoai && <div><span style={{ color: 'var(--text-muted)' }}>SĐT: </span>{nv.so_dien_thoai}</div>}
                      {nv.so_tk_ngan_hang && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-muted)' }}>STK: </span>{nv.so_tk_ngan_hang} · {nv.ten_ngan_hang_thu_huong}</div>}
                    </div>
                  )}
                </div>
                {/* ── II. Công tháng ── */}
                {(slipRow.cong_thuc_te != null || slipRow.cong_tinh_luong != null) && (
                  <div className="form-section">
                    <div className="form-section-title">II. Công tháng</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.82rem', marginTop: 8 }}>
                      {slipRow.cong_thuc_te     != null && <div>Công thực tế: <strong>{slipRow.cong_thuc_te}</strong></div>}
                      {slipRow.cong_tinh_luong  != null && <div>Công tính lương: <strong>{slipRow.cong_tinh_luong}</strong></div>}
                      {!!slipRow.cong_tv  && <div>Công TV: <strong>{slipRow.cong_tv}</strong></div>}
                      {!!slipRow.cong_ct  && <div>Công CT: <strong>{slipRow.cong_ct}</strong></div>}
                      {!!slipRow.luong_tv && <div>Lương TV: <strong style={{color:'var(--success-text)'}}>{fmt(slipRow.luong_tv)}</strong></div>}
                      {!!slipRow.luong_ct && <div>Lương CT: <strong style={{color:'var(--success-text)'}}>{fmt(slipRow.luong_ct)}</strong></div>}
                    </div>
                  </div>
                )}

                {/* ── III. Thu nhập ── */}
                <div className="form-section">
                  <div className="form-section-title">III. Thu nhập</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                    {[
                      { label: 'Lương vị trí',          value: slipRow.luong_vi_tri },
                      { label: 'LCB theo ngày công',     value: slipRow.lcb_theo_ngay_cong },
                      // KD fields
                      { label: 'KPI quy mô & duy trì',   value: slipRow.kpi_quy_mo },
                      { label: 'KPI hiệu quả vận hành',  value: slipRow.kpi_hieu_qua_van_hanh },
                      { label: 'KPI chất lượng quản lý', value: slipRow.kpi_chat_luong_quan_ly },
                      { label: 'KPI doanh thu (GĐKD)',   value: slipRow.kpi_doanh_thu_gdkd },
                      { label: 'KPI doanh thu (NVKD)',   value: slipRow.kpi_doanh_thu_nvkd },
                      { label: 'KPI Plus / Hiệu quả',   value: slipRow.kpi_plus },
                      { label: 'Điều chỉnh kỳ trước',   value: slipRow.dieu_chinh_ky_truoc },
                      // BO fields
                      { label: 'Lương Công (BO)',              value: slipRow.luong_cong },
                      { label: 'Lương LTG (BO)',               value: slipRow.luong_ltg },
                      { label: 'Thưởng TKKD (BO)',             value: slipRow.thuong_tkkd },
                      { label: 'Thưởng tháng 13 (BO)',         value: slipRow.thuong_thang_13 },
                      { label: 'Phụ cấp thực nhận (BO)',       value: slipRow.tong_phu_cap_thuc_nhan },
                      { label: 'Phụ cấp tiền ăn (BO)',         value: slipRow.phu_cap_tien_an_bo },
                    ].filter(i => !!i.value).map(i => (
                      <div key={i.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '3px 0', borderBottom: '1px dashed var(--border-light)' }}>
                        <span style={{ color: 'var(--text-body)' }}>{i.label}</span>
                        <strong style={{ color: 'var(--success-text)' }}>{fmt(i.value!)}</strong>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 700, padding: '6px 0', borderTop: '2px solid var(--border)' }}>
                      <span>TỔNG THU NHẬP</span>
                      <span style={{ color: 'var(--primary)' }}>{fmtCurrency(slipRow.tong_thu_nhap ?? 0)}</span>
                    </div>
                  </div>
                </div>

                {/* ── IV. Khấu trừ ── */}
                {(slipRow.bhxh_nld || slipRow.thue_tncn || slipRow.tien_di_muon || slipRow.tru_khac || slipRow.tam_ung_luong) ? (
                  <div className="form-section">
                    <div className="form-section-title">IV. Khấu trừ</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                      {[
                        { label: 'Lương đóng BHXH',             value: slipRow.luong_dong_bhxh },
                        { label: 'BHXH NLĐ đóng (10.5%)',        value: slipRow.bhxh_nld },
                        { label: 'Giảm trừ bản thân',            value: slipRow.giam_tru_ban_than },
                        { label: `Giảm trừ NPT (${slipRow.so_nguoi_giam_tru ?? 0} người)`, value: slipRow.so_tien_giam_tru },
                        { label: 'Thu nhập tính thuế',           value: slipRow.thu_nhap_tinh_thue },
                        { label: 'Thuế TNCN',                    value: slipRow.thue_tncn },
                        { label: `Phút đi muộn: ${Math.round(slipRow.so_phut_di_muon ?? 0)} ph`, value: slipRow.tien_di_muon },
                        { label: 'Trừ khác',                     value: slipRow.tru_khac },
                        { label: 'Tạm ứng lương',                value: slipRow.tam_ung_luong },
                        { label: 'Tiền đã ứng/phạt (BO)',        value: slipRow.tien_ung_phat },
                        { label: 'Trừ đi muộn về sớm (BO)',      value: slipRow.tru_di_muon_bo },
                      ].filter(i => !!i.value).map(i => (
                        <div key={i.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '3px 0', borderBottom: '1px dashed var(--border-light)' }}>
                          <span style={{ color: 'var(--text-body)' }}>{i.label}</span>
                          <strong style={{ color: 'var(--danger-text)' }}>-{fmt(i.value!)}</strong>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 700, padding: '6px 0', borderTop: '2px solid var(--border)' }}>
                        <span>TỔNG KHẤU TRỪ</span>
                        <span style={{ color: 'var(--danger-text)' }}>-{fmtCurrency(slipRow.tong_khau_tru ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* ── Thực lĩnh ── */}
                <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-lg)', padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Thực lĩnh — Tháng {thang}/{nam}
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success-text)' }}>{fmtCurrency(slipRow.thuc_linh)}</div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => downloadSlip(slipRow)}>
                    <Download size={15} /> Tải Word
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setIsSlipDrawer(false); openEmailModal(slipRow); }}>
                    <Mail size={15} /> Gửi email
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ===== EMAIL MODAL ===== */}
      {emailModal.open && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">
                <Mail size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Gửi phiếu lương
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setEmailModal(m => ({ ...m, open: false }))}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg-page)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 600 }}>{emailModal.row?.ho_ten}</div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {emailModal.row?.id_nhan_vien} · Tháng {thang}/{nam} · Thực lĩnh: <strong style={{ color: 'var(--success-text)' }}>{fmtCurrency(emailModal.row?.thuc_linh ?? 0)}</strong>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Địa chỉ email nhận</label>
                <input
                  type="email" className="form-input"
                  placeholder="example@email.com"
                  value={emailModal.emailTo}
                  onChange={e => setEmailModal(m => ({ ...m, emailTo: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEmailModal(m => ({ ...m, open: false }))}>Hủy</button>
              <button className="btn btn-primary" disabled={!emailModal.emailTo || emailModal.sending} onClick={sendSalaryEmail}>
                <Mail size={15} />
                {emailModal.sending ? 'Đang gửi...' : 'Gửi email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
