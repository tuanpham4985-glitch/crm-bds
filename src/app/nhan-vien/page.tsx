'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Edit3, Trash2, X, UserCog, Phone, Mail,
  Shield, ShieldCheck, TrendingUp, Upload, Loader2, FileText, FileUser, RefreshCw,
  Megaphone, Send, Paperclip, CheckCircle2, Users, Search, ChevronDown
} from 'lucide-react';
import type { NhanVien, Pipeline, KhachHang, HopDong, DanhMuc } from '@/lib/types';
import Link from 'next/link';
import RichEditor from '@/components/RichEditor';
import { formatDate, formatCurrency } from '@/lib/utils';
import { VAI_TRO } from '@/lib/constants';
import { useAuth } from '@/hooks/useAuth';

const NHAN_VIEN_FIELDS = [
  { id: 'index', label: '#', width: 50, public: true },
  { id: 'ho_ten', label: 'Họ tên', public: true },
  { id: 'so_dien_thoai', label: 'SĐT', public: true },
  { id: 'email', label: 'Email', public: false },
  { id: 'employee_type', label: 'Chức danh', public: true },
  { id: 'phong_KD', label: 'Phòng KD', public: true },
  { id: 'trang_thai', label: 'Trạng thái', public: true },
  { id: 'khach_hang', label: 'KH', align: 'right', public: false },
  { id: 'deal', label: 'Deal', align: 'right', public: true },
  { id: 'doanh_thu', label: 'Doanh thu', align: 'right', public: true },
  { id: 'hoa_hong', label: 'Hoa hồng', align: 'right', public: false },
  { id: 'hop_dong', label: 'Hợp đồng', align: 'center', public: true },
  { id: 'ngay_tao', label: 'Ngày tạo', public: false },
  { id: 'thao_tac', label: 'Thao tác', align: 'center', width: 120, public: true, adminOnly: true }
];

export default function NhanVienPage() {
  const { isAdmin, isHR, canEditHRM, isLoading: authLoading } = useAuth();
  const visibleColumns = NHAN_VIEN_FIELDS.filter(f => f.public);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [contracts, setContracts] = useState<HopDong[]>([]);
  const [danhMuc, setDanhMuc] = useState<DanhMuc>({
    employee_types: [], khu_vuc: [], gioi_tinh: [], phong_KD: [],
    giai_doan_pipeline: [], trang_thai_kh: [], trang_thai_cong_viec: [], nguon: [],
    trang_thai_nhan_vien: []
  });
  const [loading, setLoading] = useState(true);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<NhanVien | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);

  // Avatar upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form
  const [form, setForm] = useState({
    ho_ten: '', so_dien_thoai: '', email: '',
    vai_tro: 'Sale', employee_type: '', trang_thai: 'Đang làm',
    avatar_url: '',
    gioi_tinh: '', khu_vuc: '', phong_KD: '',
    so_cccd: '', ngay_cap: '', noi_cap: '', HKTT: '', ngay_sinh: '', ma_so_thue: '',
    so_tk_ngan_hang: '', ten_ngan_hang_thu_huong: '',
    so_nguoi_phu_thuoc: 0,
  });

  // Helper: Safe JSON parser to avoid crash on empty/invalid response
  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      if (!text) return { success: false, error: 'Empty response' };
      return JSON.parse(text);
    } catch (err) {
      console.error(`[API Error] Failed to parse JSON from ${res.url}. Status: ${res.status}. Body preview:`, text.slice(0, 200));
      return { success: false, error: 'Invalid JSON response' };
    }
  };

  const [syncing, setSyncing] = useState(false);

  // Announcement email state
  const annFileRef = useRef<HTMLInputElement>(null);
  const [annModal, setAnnModal] = useState(false);
  const [annSubject, setAnnSubject] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annFiles, setAnnFiles] = useState<File[]>([]);
  const [annSending, setAnnSending] = useState(false);
  const [annResult, setAnnResult] = useState<{ sent: number; failed: number; errors: string[]; failedEmails?: string[]; quotaHit?: boolean; skipped?: number; notSent?: string[] } | null>(null);
  // Người nhận: 'all' = toàn thể, 'selected' = chọn cụ thể. Cc/Bcc = danh sách id nhân viên.
  const [annMode, setAnnMode] = useState<'all' | 'selected'>('all');
  const [annTo, setAnnTo] = useState<string[]>([]);
  const [annCc, setAnnCc] = useState<string[]>([]);
  const [annBcc, setAnnBcc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  const openAnnModal = () => {
    setAnnSubject('');
    setAnnBody('');
    setAnnFiles([]);
    setAnnResult(null);
    setAnnMode('all');
    setAnnTo([]);
    setAnnCc([]);
    setAnnBcc([]);
    setShowCc(false);
    setShowBcc(false);
    setAnnModal(true);
  };

  const addAnnFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    setAnnFiles(prev => [...prev, ...picked]);
    e.target.value = '';
  };

  const removeAnnFile = (idx: number) => setAnnFiles(prev => prev.filter((_, i) => i !== idx));

  // Nhân viên đủ điều kiện nhận email (có email + đang làm) — dùng cho To/Cc/Bcc
  const annEligible = employees.filter(nv => (nv.email ?? '').trim() && nv.trang_thai !== 'Nghỉ việc');

  const sendAnnouncement = async () => {
    if (!annSubject.trim() || !annBody.trim()) return;
    if (annMode === 'selected' && annTo.length === 0) {
      alert('Vui lòng chọn ít nhất 1 người nhận, hoặc chuyển sang chế độ "Toàn thể".');
      return;
    }
    setAnnSending(true);
    setAnnResult(null);
    try {
      const fd = new FormData();
      fd.append('subject', annSubject.trim());
      fd.append('body', annBody.trim());
      if (annMode === 'selected') fd.append('recipientIds', JSON.stringify(annTo));
      if (annCc.length) fd.append('ccIds', JSON.stringify(annCc));
      if (annBcc.length) fd.append('bccIds', JSON.stringify(annBcc));
      annFiles.forEach(f => fd.append('files', f));
      const res = await fetch('/api/email/announcement', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        const failedEmails = (data.errors ?? []).map((e: string) => {
          const m = e.match(/<([^>]+)>/);
          return m ? m[1].toLowerCase() : '';
        }).filter(Boolean);
        setAnnResult({ sent: data.sent, failed: data.failed, errors: data.errors ?? [], failedEmails, quotaHit: data.quotaHit, skipped: data.skipped, notSent: data.notSent });
      } else {
        alert('Lỗi gửi thông báo: ' + (data.error || 'Không xác định'));
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setAnnSending(false);
    }
  };

  const retrySendFailed = async () => {
    // Ưu tiên danh sách "chưa gửi" (gồm cả người bị dừng sớm do quota); fallback về failedEmails
    const pending = annResult?.notSent?.length ? annResult.notSent : annResult?.failedEmails;
    if (!pending?.length) return;
    const failedIds = employees
      .filter(nv => pending.includes((nv.email ?? '').toLowerCase()))
      .map(nv => nv.id_nhan_vien);
    if (failedIds.length === 0) return;
    setAnnSending(true);
    setAnnResult(null);
    try {
      const fd = new FormData();
      fd.append('subject', annSubject.trim());
      fd.append('body', annBody.trim());
      fd.append('recipientIds', JSON.stringify(failedIds));
      annFiles.forEach(f => fd.append('files', f));
      const res = await fetch('/api/email/announcement', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        const newFailedEmails = (data.errors ?? []).map((e: string) => {
          const m = e.match(/<([^>]+)>/);
          return m ? m[1].toLowerCase() : '';
        }).filter(Boolean);
        setAnnResult({ sent: data.sent, failed: data.failed, errors: data.errors ?? [], failedEmails: newFailedEmails, quotaHit: data.quotaHit, skipped: data.skipped, notSent: data.notSent });
      } else {
        alert('Lỗi gửi lại: ' + (data.error || 'Không xác định'));
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setAnnSending(false);
    }
  };

  const handleSync = async () => {
    if (!confirm('Bạn có chắc chắn muốn đồng bộ danh sách nhân viên từ file nguồn VIC_DATA NHÂN SỰ VICTORY HOLDINGS? Dữ liệu nhân sự trên CRM sẽ được cập nhật.')) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/nhan-vien/sync', { method: 'POST' });
      const result = await safeJson(res);
      if (result.success) {
        const lines = [
          'Đồng bộ thành công!',
          `- Thêm mới: ${result.data?.inserted || 0} nhân viên`,
          `- Cập nhật: ${result.data?.updated || 0} nhân viên`,
        ];
        const mgr = result.data?.manager?.updated || 0;
        if (mgr > 0) {
          lines.push(`- Quản lý trực tiếp: ${mgr} nhân viên`);
        }
        const removed = result.data?.postgres?.removed || 0;
        if (removed > 0) {
          lines.push(`- Dọn bản sao không còn trong file nguồn: ${removed} (mã ${result.data.postgres.removed_ids.join(', ')})`);
        }
        const tu = result.data?.taskUsers;
        if (tu) {
          lines.push(`- Danh sách giao việc: thêm ${tu.created}, cập nhật ${tu.updated}, ngừng hoạt động ${tu.deactivated}`);
        }
        alert(lines.join('\n'));
        fetchAll(true);
      } else {
        alert('Đồng bộ thất bại: ' + (result.error || 'Lỗi không xác định'));
      }
    } catch (err: any) {
      alert('Đồng bộ thất bại: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const fetchAll = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      // Fetch all APIs in parallel
      const responses = await Promise.all([
        fetch('/api/nhan-vien'),
        fetch('/api/pipeline'),
        fetch('/api/khach-hang?limit=999'),
        fetch('/api/contracts'),
        fetch('/api/danh-muc'),
      ]);

      // Parse JSON safely
      const [nvData, plData, khData, hdData, dmData] = await Promise.all(
        responses.map(res => safeJson(res))
      );

      // Check for errors
      const errors = [nvData, plData, khData, hdData, dmData].filter(d => !d.success);
      if (errors.length > 0 && !isBackground) {
        console.warn('[API] Some data failed to load:', errors);
      }

      if (nvData.success) setEmployees(nvData.data);
      if (plData.success) setPipelines(plData.data);
      if (khData.success) setCustomers(khData.data);
      if (hdData.success) setContracts(hdData.data);
      if (dmData.success) setDanhMuc(dmData.data);
    } catch (err) {
      console.error('Fetch all error:', err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Stats per employee
  const getEmployeeStats = (name: string) => {
    const khCount = customers.filter(kh => kh.sale_phu_trach === name).length;
    const deals = pipelines.filter(pl => pl.sale_phu_trach === name);
    const daKy = deals.filter(pl => pl.giai_doan === 'Ký HĐ');
    return {
      customers: khCount,
      totalDeals: deals.length,
      signedDeals: daKy.length,
      revenue: daKy.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0),
      commission: daKy.reduce((s, pl) => s + pl.tien_hoa_hong, 0),
    };
  };

  // Contract count per employee — match by ID first, then by stored name as fallback
  const getContractCount = (employeeId: string) => {
    const emp = employees.find(e => e.id_nhan_vien === employeeId);
    const empContracts = contracts.filter(c =>
      c.id_nhan_vien === employeeId ||
      (emp && c.ten_nhan_vien && c.ten_nhan_vien === emp.ho_ten)
    );
    const active = empContracts.filter(c => {
      if (!c.ngay_ket_thuc) return true;
      return new Date(c.ngay_ket_thuc) >= new Date();
    });
    return { total: empContracts.length, active: active.length };
  };

  const openCreate = () => {
    setEditingItem(null);
    setForm({
      ho_ten: '', so_dien_thoai: '', email: '',
      vai_tro: 'Sale', employee_type: '', trang_thai: 'Đang làm',
      avatar_url: '',
      gioi_tinh: '', khu_vuc: '', phong_KD: '',
      so_cccd: '', ngay_cap: '', noi_cap: '', HKTT: '', ngay_sinh: '', ma_so_thue: '',
      so_tk_ngan_hang: '', ten_ngan_hang_thu_huong: '',
      so_nguoi_phu_thuoc: 0,
    });
    setUploadError('');
    setAvatarPreviewFailed(false);
    setShowModal(true);
  };

  // Safely parse date string to YYYY-MM-DD format for <input type="date">
  const parseToISODate = (dateVal: any): string => {
    if (!dateVal) return '';
    try {
      const str = String(dateVal).trim();
      const parts = str.split(/[/-]/);
      if (parts.length === 3) {
        const p1 = parseInt(parts[0], 10);
        const p2 = parseInt(parts[1], 10);
        const p3 = parseInt(parts[2], 10);
        if (p1 <= 31 && p2 <= 12 && p3 > 1900) {
          return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
        }
      }
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
    return '';
  };

  const openEdit = (nv: NhanVien) => {
    setEditingItem(nv);
    setForm({
      ho_ten: nv.ho_ten,
      so_dien_thoai: nv.so_dien_thoai,
      email: nv.email,
      vai_tro: nv.vai_tro || 'Sale',
      employee_type: nv.employee_type || '',
      trang_thai: nv.trang_thai,
      avatar_url: nv.avatar_url || '',
      gioi_tinh: nv.gioi_tinh || '',
      khu_vuc: nv.khu_vuc || '',
      phong_KD: nv.phong_KD || '',
      so_cccd: nv.so_cccd || '',
      ngay_cap: parseToISODate(nv.ngay_cap || ''),
      noi_cap: nv.noi_cap || '',
      HKTT: nv.HKTT || '',
      ngay_sinh: parseToISODate(nv.ngay_sinh || ''),
      ma_so_thue: nv.ma_so_thue || '',
      so_tk_ngan_hang: nv.so_tk_ngan_hang || '',
      ten_ngan_hang_thu_huong: nv.ten_ngan_hang_thu_huong || '',
      so_nguoi_phu_thuoc: nv.so_nguoi_phu_thuoc || 0,
    });
    setUploadError('');
    setAvatarPreviewFailed(false);
    setShowModal(true);
  };

  // Image compression helper
  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_DIMENSION = 200; // max width/height

          if (width > height) {
            if (width > MAX_DIMENSION) {
              height = Math.round((height * MAX_DIMENSION) / width);
              width = MAX_DIMENSION;
            }
          } else {
            if (height > MAX_DIMENSION) {
              width = Math.round((width * MAX_DIMENSION) / height);
              height = MAX_DIMENSION;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('No canvas context'));
          ctx.drawImage(img, 0, 0, width, height);

          let quality = 0.9;
          const attemptCompress = () => {
            canvas.toBlob((blob) => {
              if (!blob) return reject(new Error('Canvas toBlob failed'));
              // Target < 35KB to be safe for Google Sheets 50,000 character limit
              if (blob.size > 35 * 1024 && quality > 0.1) {
                quality -= 0.1;
                attemptCompress();
              } else {
                const resizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                  type: 'image/webp',
                  lastModified: Date.now(),
                });
                resolve(resizedFile);
              }
            }, 'image/webp', quality);
          };
          attemptCompress();
        };
        img.onerror = () => reject(new Error('Image load failed'));
      };
      reader.onerror = () => reject(new Error('File read failed'));
    });
  };

  // Avatar upload handler
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      // Auto resize to fit Google Sheets cell limit (< 35KB) and use webp
      let finalFile = file;
      if (file.size > 35 * 1024 || file.type !== 'image/webp') {
        try {
          finalFile = await compressImage(file);
        } catch (err) {
          console.error('Compression error:', err);
          setUploadError('Không thể xử lý ảnh. Vui lòng thử ảnh khác.');
          setUploading(false);
          return;
        }
      }

      const formData = new FormData();
      formData.append('file', finalFile);

      const res = await fetch('/api/upload-avatar', {
        method: 'POST',
        body: formData,
      });

      const data = await safeJson(res);

      if (!res.ok) {
        setUploadError(data.error || 'Upload thất bại');
        return;
      }

      if (data.url) {
        setForm(prev => ({ ...prev, avatar_url: data.url }));
        setUploadError('');
        setAvatarPreviewFailed(false);
      } else {
        setUploadError('Upload thất bại: không nhận được URL');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setUploading(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async () => {
    if (!form.ho_ten.trim()) return;
    if (!form.email.trim()) {
      alert('Email là bắt buộc (dùng để đăng nhập)');
      return;
    }
    setSaving(true);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const body = editingItem ? { ...editingItem, ...form } : form;
      const res = await fetch('/api/nhan-vien', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await safeJson(res);
      if (result.success) {
        setShowModal(false);
        fetchAll(true);
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch('/api/nhan-vien', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingId }),
      });
      const result = await safeJson(res);
      if (result.success) {
        setShowConfirm(false);
        fetchAll();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Render avatar from URL or fallback to initials
  const renderAvatar = (nv: NhanVien, size = 36) => {
    if (nv.avatar_url) {
      // Determine metallic border and shadow based on role, perfectly matching leaderboard design
      let borderStyle = '2.5px solid #cbd5e1'; // Silver for Sales
      let glowStyle = '0 2px 6px rgba(148,163,184,0.35)';

      if (nv.vai_tro === 'Admin') {
        borderStyle = '2.5px solid #d4af37'; // Gold for Admin
        glowStyle = '0 2px 8px rgba(212,175,55,0.45)';
      } else if (nv.vai_tro === 'HR') {
        borderStyle = '2.5px solid #6366f1'; // Indigo for HR
        glowStyle = '0 2px 8px rgba(99,102,241,0.35)';
      } else if (nv.vai_tro === 'Manager' || nv.employee_type?.includes('Trưởng')) {
        borderStyle = '2.5px solid #d4af37'; // Gold for Managers
        glowStyle = '0 2px 8px rgba(212,175,55,0.45)';
      } else if (nv.employee_type?.includes('Học viên') || nv.employee_type?.includes('Cộng tác')) {
        borderStyle = '2.5px solid #b45309'; // Bronze for Interns
        glowStyle = '0 2px 6px rgba(180,83,9,0.25)';
      }

      return (
        <div style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: borderStyle,
          boxShadow: glowStyle,
          background: '#ffffff',
          padding: '1.5px', // Circular white separation ring
          position: 'relative'
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff'
          }}>
            <img
              src={nv.avatar_url}
              alt={nv.ho_ten}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '100%',
                minWidth: '100%',
                objectFit: 'cover',
                objectPosition: 'center 15%',
                display: 'block'
              }}
              // If Google Drive image fails, fallback to initials
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                const innerContainer = target.parentElement as HTMLElement;
                const outerContainer = innerContainer?.parentElement as HTMLElement;
                if (outerContainer) {
                  outerContainer.style.display = 'none';
                  const fallback = outerContainer.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }
              }}
            />
          </div>
        </div>
      );
    }
    return null;
  };
  const renderAvatarFallback = (nv: NhanVien, size = 36) => {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: nv.vai_tro === 'Admin'
          ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
          : nv.vai_tro === 'HR'
          ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
          : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
        display: nv.avatar_url ? 'none' : 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: size * 0.38, fontWeight: 600,
        flexShrink: 0,
      }}>
        {nv.ho_ten.split(' ').pop()?.charAt(0).toUpperCase()}
      </div>
    );
  };

  if (authLoading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  // Chỉ HR và Admin được truy cập trang Nhân viên
  if (!canEditHRM) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--text-secondary)' }}>
        <Shield size={40} style={{ color: '#ef4444', opacity: 0.7 }} />
        <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Bạn không có quyền truy cập trang này</p>
        <p style={{ fontSize: 13, margin: 0 }}>Chỉ HR và Admin mới có thể xem trang Nhân viên</p>
      </div>
    );
  }

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Nhân viên</h1>
          <p>Quản lý nhân viên kinh doanh ({employees.length} nhân viên)</p>
        </div>
        <div className="flex gap-2">
          {canEditHRM && (
            <>
              <button
                className="btn btn-secondary"
                onClick={handleSync}
                disabled={syncing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {syncing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Đang đồng bộ...
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    Đồng bộ nhân sự
                  </>
                )}
              </button>
              <button className="btn btn-primary" onClick={openCreate}>
                <Plus size={18} />
                Thêm nhân viên
              </button>
            </>
          )}
        </div>
      </div>

      {/* Announcement Card — HR/Admin only */}
      {canEditHRM && (
        <div className="card" style={{ marginBottom: 16, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Megaphone size={17} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-title)' }}>
                  Gửi thông báo toàn thể
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                  Gửi email thông báo nội bộ đến tất cả nhân viên đang làm việc
                </div>
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={openAnnModal}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              <Send size={15} />
              Soạn thông báo
            </button>
          </div>
        </div>
      )}

      {/* Employee Table */}
      <div className="card" style={{ padding: 0 }}>
        {employees.length === 0 ? (
          <div className="empty-state">
            <UserCog size={40} />
            <h3>Chưa có nhân viên</h3>
            <p>Nhấn &quot;Thêm nhân viên&quot; để tạo mới</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ borderRadius: 'var(--radius-xl)', overflow: 'visible' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {visibleColumns.map(col => {
                    if (col.adminOnly && !canEditHRM) return null;
                    return (
                      <th
                        key={col.id}
                        style={{
                          width: col.width,
                          textAlign: col.align as any
                        }}
                      >
                        {col.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((nv, idx) => {
                  const stats = getEmployeeStats(nv.ho_ten);
                  const contractStats = getContractCount(nv.id_nhan_vien);
                  return (
                    <tr key={nv.id_nhan_vien}>
                      {visibleColumns.map((col) => {
                        if (col.adminOnly && !canEditHRM) return null;

                        if (col.id === 'index') {
                          return <td key={col.id} style={{ color: 'var(--text-label)', textAlign: col.align as any }}>{idx + 1}</td>;
                        }
                        if (col.id === 'ho_ten') {
                          return (
                            <td key={col.id} style={{ textAlign: col.align as any }}>
                              <div className="flex items-center gap-3" style={{ whiteSpace: 'nowrap' }}>
                                {renderAvatar(nv)}
                                {renderAvatarFallback(nv)}
                                <span style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                                  {nv.ho_ten}
                                </span>
                              </div>
                            </td>
                          );
                        }
                        if (col.id === 'so_dien_thoai') {
                          return (
                            <td key={col.id} style={{ textAlign: col.align as any }}>
                              <span className="flex items-center gap-2">
                                <Phone size={13} style={{ color: 'var(--text-label)' }} />
                                {nv.so_dien_thoai || '—'}
                              </span>
                            </td>
                          );
                        }
                        if (col.id === 'email') {
                          return (
                            <td key={col.id} style={{ textAlign: col.align as any }}>
                              <span className="flex items-center gap-2">
                                <Mail size={13} style={{ color: 'var(--text-label)' }} />
                                {nv.email || '—'}
                              </span>
                            </td>
                          );
                        }
                        if (col.id === 'employee_type') {
                          return (
                            <td key={col.id} style={{ textAlign: col.align as any }}>
                              <span className="flex items-center gap-2">
                                {nv.vai_tro === 'Admin' ? (
                                  <><ShieldCheck size={14} style={{ color: 'var(--primary)' }} />
                                    <span className="badge badge-info">{nv.employee_type || '—'}</span></>
                                ) : (
                                  <><Shield size={14} style={{ color: 'var(--success-text)' }} />
                                    <span className="badge badge-success">{nv.employee_type || '—'}</span></>
                                )}
                              </span>
                            </td>
                          );
                        }
                        if (col.id === 'phong_KD') {
                          return (
                            <td key={col.id} className="text-center align-middle">
                              <span className="badge badge-outline">{nv.phong_KD || '-'}</span>
                            </td>
                          );
                        }

                        if (col.id === 'trang_thai') {
                          return (
                            <td key={col.id} style={{ textAlign: col.align as any }}>
                              <span className={`badge ${
                                (nv.trang_thai === 'Đang làm' || nv.trang_thai === 'Chính thức') ? 'badge-success' :
                                (nv.trang_thai === 'Học viên' || nv.trang_thai === 'Thử việc') ? 'badge-info' :
                                nv.trang_thai === 'Nghỉ sinh' ? 'badge-warning' :
                                nv.trang_thai === 'CTV' ? '' :
                                'badge-neutral'
                              }`} style={nv.trang_thai === 'CTV' ? {
                                background: '#f3e8ff', color: '#7c3aed', fontWeight: 600
                              } : {}}>
                                {nv.trang_thai}
                              </span>
                            </td>
                          );
                        }
                        if (col.id === 'khach_hang') {
                          return <td key={col.id} style={{ textAlign: col.align as any, fontWeight: 500 }}>{stats.customers}</td>;
                        }
                        if (col.id === 'deal') {
                          return (
                            <td key={col.id} style={{ textAlign: col.align as any, fontWeight: 500 }}>
                              {stats.signedDeals}/{stats.totalDeals}
                            </td>
                          );
                        }
                        if (col.id === 'doanh_thu') {
                          return (
                            <td key={col.id} style={{ textAlign: col.align as any, fontWeight: 600 }}>
                              <span className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                                <TrendingUp size={13} style={{ color: 'var(--success-text)' }} />
                                {formatCurrency(stats.revenue)}
                              </span>
                            </td>
                          );
                        }
                        if (col.id === 'hoa_hong') {
                          return (
                            <td key={col.id} style={{ textAlign: col.align as any, color: 'var(--success-text)', fontWeight: 500 }}>
                              {formatCurrency(stats.commission)}
                            </td>
                          );
                        }
                        if (col.id === 'hop_dong') {
                          return (
                            <td key={col.id} style={{ textAlign: col.align as any }}>
                              <Link
                                href={`/nhan-vien/hop-dong?id_nhan_vien=${nv.id_nhan_vien}`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '4px 10px', borderRadius: 6,
                                  background: contractStats.active > 0 ? 'var(--success-bg)' : 'var(--bg-page)',
                                  color: contractStats.active > 0 ? 'var(--success-text)' : 'var(--text-label)',
                                  fontSize: '0.8125rem', fontWeight: 600,
                                  textDecoration: 'none', transition: 'all 0.15s',
                                }}
                                title={`${contractStats.total} hợp đồng (${contractStats.active} còn hiệu lực)`}
                              >
                                <FileText size={13} />
                                {contractStats.active}/{contractStats.total}
                              </Link>
                            </td>
                          );
                        }
                        if (col.id === 'ngay_tao') {
                          return <td key={col.id} style={{ textAlign: col.align as any }}>{formatDate(nv.ngay_tao)}</td>;
                        }
                        if (col.id === 'thao_tac') {
                          return (
                            <td key={col.id} style={{ textAlign: col.align as any }}>
                              <div className="flex items-center gap-1" style={{ justifyContent: 'center' }}>
                                <Link
                                  href={`/nhan-vien/hop-dong?id_nhan_vien=${nv.id_nhan_vien}&action=create`}
                                  className="btn btn-ghost btn-icon btn-sm"
                                  title="Tạo hợp đồng mới"
                                  style={{ color: 'var(--primary)' }}
                                >
                                  <FileText size={15} />
                                </Link>
                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(nv)} title="Chỉnh sửa"><Edit3 size={15} /></button>
                                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--danger-text)' }}
                                  title="Xóa" onClick={() => { setDeletingId(nv.id_nhan_vien); setShowConfirm(true); }}><Trash2 size={15} /></button>
                              </div>
                            </td>
                          );
                        }
                        return null;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingItem ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Avatar Upload Section */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  {/* Avatar preview */}
                   {form.avatar_url && !avatarPreviewFailed ? (
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%',
                      overflow: 'hidden', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      border: '3px solid var(--border)',
                    }}>
                      <img
                        src={form.avatar_url}
                        alt="Avatar preview"
                        style={{
                          width: '100%', height: '100%',
                          objectFit: 'cover',
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          setAvatarPreviewFailed(true);
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%',
                      background: form.avatar_url
                        ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
                        : 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: form.avatar_url ? '3px solid var(--border)' : '3px dashed var(--border)',
                      color: form.avatar_url ? '#fff' : 'var(--text-label)',
                      fontSize: form.avatar_url ? 30 : 28,
                      fontWeight: 700,
                    }}>
                      {form.avatar_url
                        ? (form.ho_ten.split(' ').pop()?.charAt(0).toUpperCase() || '?')
                        : <Upload size={28} />}
                    </div>
                  )}

                  {/* Upload spinner overlay */}
                  {uploading && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Loader2 size={24} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarUpload}
                  style={{ display: 'none' }}
                  id="avatar-upload-input"
                />

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ fontSize: '0.8rem', padding: '6px 16px' }}
                >
                  {uploading ? 'Đang tải...' : (form.avatar_url ? 'Đổi ảnh' : 'Chọn ảnh đại diện')}
                </button>

                {/* Remove avatar button */}
                {form.avatar_url && !uploading && (
                  <button
                    type="button"
                    onClick={() => {
                      setForm(prev => ({ ...prev, avatar_url: '' }));
                      setAvatarPreviewFailed(false);
                    }}
                    style={{
                      marginTop: 4, background: 'none', border: 'none',
                      color: 'var(--danger-text)', cursor: 'pointer',
                      fontSize: '0.75rem', textDecoration: 'underline',
                    }}
                  >
                    Xóa ảnh
                  </button>
                )}

                {/* Upload error */}
                {uploadError && (
                  <p style={{ color: 'var(--danger-text)', fontSize: '0.8rem', marginTop: 8, textAlign: 'center' }}>
                    {uploadError}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Họ tên *</label>
                <input className="form-input" value={form.ho_ten}
                  onChange={(e) => setForm({ ...form, ho_ten: e.target.value })} placeholder="Nhập họ tên" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Số điện thoại</label>
                  <input className="form-input" value={form.so_dien_thoai}
                    onChange={(e) => setForm({ ...form, so_dien_thoai: e.target.value })} placeholder="0901234567" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email * <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>(dùng để đăng nhập)</span></label>
                  <input className="form-input" type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Vai trò (Hệ thống)</label>
                  <select className="form-select" value={form.vai_tro}
                    onChange={(e) => setForm({ ...form, vai_tro: e.target.value })}>
                    <option value="Sale">Sale</option>
                    <option value="HR">HR (Nhân sự)</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Trạng thái</label>
                  <select className="form-select" value={form.trang_thai}
                    onChange={(e) => setForm({ ...form, trang_thai: e.target.value })}>
                    {(danhMuc?.trang_thai_nhan_vien?.length
                      ? danhMuc.trang_thai_nhan_vien
                      : ['Chính thức', 'Đang làm', 'Học viên', 'Nghỉ sinh', 'Nghỉ việc', 'Thử việc']
                    ).map(tt => <option key={tt} value={tt}>{tt}</option>)}
                  </select>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    💡 Cập nhật trạng thái để phân loại nhân sự chính xác
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Số CCCD</label>
                  <input className="form-input" value={form.so_cccd}
                    onChange={(e) => setForm({ ...form, so_cccd: e.target.value })} placeholder="Số CCCD/CMND" />
                </div>
                <div className="form-group">
                  <label className="form-label">Ngày sinh</label>
                  <input className="form-input" type="date" value={form.ngay_sinh}
                    onChange={(e) => setForm({ ...form, ngay_sinh: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Ngày cấp CCCD</label>
                  <input className="form-input" type="date" value={form.ngay_cap}
                    onChange={(e) => setForm({ ...form, ngay_cap: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nơi cấp</label>
                  <input className="form-input" value={form.noi_cap}
                    onChange={(e) => setForm({ ...form, noi_cap: e.target.value })} placeholder="Cục Cảnh sát..." />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">HKTT (Hộ khẩu thường trú)</label>
                <input className="form-input" value={form.HKTT}
                  onChange={(e) => setForm({ ...form, HKTT: e.target.value })} placeholder="Địa chỉ ghi trên CCCD" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Mã số thuế</label>
                  <input className="form-input" value={form.ma_so_thue}
                    onChange={(e) => setForm({ ...form, ma_so_thue: e.target.value })} placeholder="MST cá nhân" />
                </div>
                <div className="form-group">
                  <label className="form-label">Giới tính</label>
                  <select className="form-select" value={form.gioi_tinh}
                    onChange={(e) => setForm({ ...form, gioi_tinh: e.target.value })}>
                    <option value="">— Chọn giới tính —</option>
                    {(danhMuc?.gioi_tinh || []).map(gt => <option key={gt} value={gt}>{gt}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Phòng ban</label>
                  <select className="form-select" value={form.phong_KD}
                    onChange={(e) => setForm({ ...form, phong_KD: e.target.value })}>
                    <option value="">— Chọn Phòng ban —</option>
                    {(danhMuc?.phong_KD || []).map(pkd => <option key={pkd} value={pkd}>{pkd}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Khu vực</label>
                  <select className="form-select" value={form.khu_vuc}
                    onChange={(e) => setForm({ ...form, khu_vuc: e.target.value })}>
                    <option value="">— Chọn khu vực —</option>
                    {(danhMuc?.khu_vuc || []).map(kv => <option key={kv} value={kv}>{kv}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Số tài khoản ngân hàng</label>
                  <input className="form-input" value={form.so_tk_ngan_hang || ''}
                    onChange={(e) => setForm({ ...form, so_tk_ngan_hang: e.target.value })} placeholder="Ví dụ: 1903..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Tên ngân hàng thụ hưởng</label>
                  <input className="form-input" value={form.ten_ngan_hang_thu_huong || ''}
                    onChange={(e) => setForm({ ...form, ten_ngan_hang_thu_huong: e.target.value })} placeholder="Ví dụ: Techcombank" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Chức danh / Vị trí</label>
                  <select className="form-select" value={form.employee_type}
                    onChange={(e) => setForm({ ...form, employee_type: e.target.value })}>
                    <option value="">— Chọn Chức danh —</option>
                    {(danhMuc?.employee_types || []).map(et => <option key={et} value={et}>{et}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Số người phụ thuộc</label>
                  <input type="number" min="0" className="form-input" value={form.so_nguoi_phu_thuoc}
                    onChange={(e) => setForm({ ...form, so_nguoi_phu_thuoc: parseInt(e.target.value) || 0 })} placeholder="Nhập số người" />
                </div>
              </div>
            </div>

            {/* Password info note */}
            <div style={{
              padding: '10px 14px', margin: '0 20px',
              background: 'var(--info-bg)', borderRadius: 'var(--radius-md)',
              fontSize: '0.75rem', color: 'var(--info-text)', lineHeight: 1.5,
            }}>
              <strong>Thông tin đăng nhập:</strong><br />
              • Tài khoản: Email nhân viên<br />
              • Mật khẩu mặc định: <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 4 }}>123456</code> hoặc Số điện thoại
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !(form.ho_ten || '').trim() || !(form.email || '').trim()}
              >
                {saving ? 'Đang lưu...' : (editingItem ? 'Cập nhật' : 'Thêm mới')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận xóa</h3>
            <p>Bạn có chắc muốn xóa nhân viên này?</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Hủy</button>
              <button className="btn btn-danger" onClick={handleDelete}>Xóa</button>
            </div>
          </div>
        </div>
      )}

      {/* Announcement Modal — flex layout: chỉ editor tự scroll, modal không scroll */}
      {annModal && (
        <div className="modal-overlay" onClick={() => !annSending && setAnnModal(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-2xl)',
              boxShadow: 'var(--shadow-lg)',
              width: '100%',
              maxWidth: 600,
              height: 'min(92vh, 860px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',       /* modal không scroll — chỉ editor scroll */
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 24px', borderBottom: '1px solid var(--border-light)', flexShrink: 0,
            }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-title)' }}>
                <Megaphone size={18} style={{ color: 'var(--primary)' }} />
                Gửi thông báo toàn thể
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setAnnModal(false)} disabled={annSending}>
                <X size={18} />
              </button>
            </div>

            {/* Body — flex column, editor fills remaining space */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '16px 24px 0', gap: 10, overflow: 'hidden' }}>

              {/* Recipients — chọn người nhận + Cc/Bcc */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Mode toggle: Toàn thể / Chọn cụ thể */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-title)' }}>Người nhận:</span>
                  <div style={{ display: 'inline-flex', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    {(['all', 'selected'] as const).map(m => (
                      <button key={m} type="button" disabled={annSending}
                        onClick={() => setAnnMode(m)}
                        style={{
                          padding: '5px 12px', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer',
                          background: annMode === m ? 'var(--primary)' : 'transparent',
                          color: annMode === m ? '#fff' : 'var(--text-muted)',
                        }}>
                        {m === 'all' ? `Toàn thể (${annEligible.length})` : 'Chọn cụ thể'}
                      </button>
                    ))}
                  </div>
                  {/* Cc/Bcc toggles kiểu Gmail */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                    {!showCc && (
                      <button type="button" disabled={annSending} onClick={() => setShowCc(true)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--primary)' }}>Cc</button>
                    )}
                    {!showBcc && (
                      <button type="button" disabled={annSending} onClick={() => setShowBcc(true)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--primary)' }}>Bcc</button>
                    )}
                  </div>
                </div>

                {annMode === 'all' ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                    background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--info-text)',
                  }}>
                    <Users size={14} />
                    <span>Gửi đến <strong>{annEligible.length} nhân viên</strong> có email (mỗi người một email riêng)</span>
                  </div>
                ) : (
                  <EmployeeMultiSelect label="Đến" employees={annEligible} selected={annTo}
                    onChange={setAnnTo} disabled={annSending} placeholder="Chọn người nhận..." />
                )}

                {showCc && (
                  <EmployeeMultiSelect label="Cc" employees={annEligible} selected={annCc}
                    onChange={setAnnCc} disabled={annSending} placeholder="Chọn người nhận Cc..."
                    onClear={() => { setShowCc(false); setAnnCc([]); }} />
                )}
                {showBcc && (
                  <EmployeeMultiSelect label="Bcc" employees={annEligible} selected={annBcc}
                    onChange={setAnnBcc} disabled={annSending} placeholder="Chọn người nhận Bcc..."
                    onClear={() => { setShowBcc(false); setAnnBcc([]); }} />
                )}
                {(showCc || showBcc) && (annCc.length > 0 || annBcc.length > 0) && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Cc/Bcc sẽ được thêm vào từng email gửi đi. Nên dùng khi số người nhận chính ít, tránh gửi lặp nhiều lần.
                  </div>
                )}
              </div>

              {/* Subject */}
              <div style={{ flexShrink: 0 }}>
                <label className="form-label">Tiêu đề *</label>
                <input
                  className="form-control"
                  placeholder="Nhập tiêu đề thông báo..."
                  value={annSubject}
                  onChange={e => setAnnSubject(e.target.value)}
                  disabled={annSending}
                />
              </div>

              {/* Editor — chiếm toàn bộ không gian còn lại */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <label className="form-label" style={{ flexShrink: 0 }}>Nội dung *</label>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <RichEditor
                    value={annBody}
                    onChange={setAnnBody}
                    onFileDrop={files => setAnnFiles(prev => [...prev, ...files])}
                    disabled={annSending}
                    placeholder="Nhập nội dung thông báo..."
                    fillHeight
                  />
                </div>
              </div>
            </div>

            {/* Bottom panel: attachments + test + result — có scroll riêng nếu cần */}
            <div style={{
              flexShrink: 0, padding: '12px 24px',
              borderTop: '1px solid var(--border-lighter)',
              display: 'flex', flexDirection: 'column', gap: 10,
              maxHeight: 220, overflowY: 'auto',
            }}>
              {/* Attachments */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: annFiles.length ? 6 : 0 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => annFileRef.current?.click()}
                    disabled={annSending}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <Paperclip size={13} />
                    Đính kèm file
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ảnh hoặc PDF</span>
                </div>
                <input ref={annFileRef} type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }} onChange={addAnnFiles} />
                {annFiles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {annFiles.map((f, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                        background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border-light)', fontSize: 13,
                      }}>
                        <Paperclip size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => removeAnnFile(i)} disabled={annSending}
                          style={{ color: 'var(--danger-text)', flexShrink: 0 }}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Result */}
              {annResult && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: annResult.failed === 0 ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${annResult.failed === 0 ? '#bbf7d0' : '#fde68a'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 13,
                    color: annResult.failed === 0 ? '#15803d' : '#92400e' }}>
                    <CheckCircle2 size={15} />
                    {`Gửi thành công ${annResult.sent}/${annResult.sent + annResult.failed + (annResult.skipped ?? 0)} email${annResult.failed > 0 ? ` · ${annResult.failed} thất bại` : ''}${annResult.skipped ? ` · ${annResult.skipped} chưa gửi` : ''}`}
                  </div>
                  {annResult.quotaHit && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#991b1b', lineHeight: 1.6 }}>
                      <strong>Đã chạm hạn mức gửi email trong ngày</strong> của nhà cung cấp (Gmail). Hệ thống đã dừng để tránh bị siết thêm.
                      <br />Hạn mức thường tự mở lại sau ~24 giờ — khi đó bấm <em>“Gửi lại”</em> để gửi tiếp số còn lại. Nếu cần gửi số lượng lớn thường xuyên, nên chuyển sang email doanh nghiệp hoặc dịch vụ gửi email chuyên dụng.
                    </div>
                  )}
                  {annResult.errors.length > 0 && (
                    <>
                      <ul style={{ margin: '6px 0 4px 18px', fontSize: 12, color: '#92400e' }}>
                        {annResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                      {(annResult.notSent?.length || annResult.failedEmails?.length) ? (
                        <button
                          onClick={retrySendFailed}
                          disabled={annSending}
                          style={{
                            marginTop: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                            background: '#f59e0b', color: '#fff', border: 'none',
                            borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                          }}>
                          Gửi lại {annResult.notSent?.length ?? annResult.failed} người chưa gửi
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 10,
              padding: '14px 24px', borderTop: '1px solid var(--border-lighter)',
            }}>
              <button className="btn btn-secondary" onClick={() => setAnnModal(false)} disabled={annSending}>
                {annResult ? 'Đóng' : 'Hủy'}
              </button>
              {!annResult && (
                <button className="btn btn-primary"
                  onClick={() => sendAnnouncement()}
                  disabled={annSending || !annSubject.trim() || !annBody.trim() || (annMode === 'selected' && annTo.length === 0)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {annSending
                    ? <><Loader2 size={15} className="animate-spin" />Đang gửi...</>
                    : <><Send size={15} />{annMode === 'all' ? 'Gửi toàn thể' : `Gửi (${annTo.length})`}</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Spin animation for upload loading */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Chọn nhiều nhân viên (tick từ danh sách) — dùng cho To/Cc/Bcc ──
function EmployeeMultiSelect({
  label, employees, selected, onChange, disabled, placeholder, onClear,
}: {
  label: string;
  employees: NhanVien[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? employees.filter(nv =>
        nv.ho_ten.toLowerCase().includes(q) || (nv.email ?? '').toLowerCase().includes(q))
    : employees;

  const selectedEmps = employees.filter(nv => selected.includes(nv.id_nhan_vien));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', width: 34, flexShrink: 0 }}>{label}</span>
        <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            padding: '6px 10px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)',
          }}>
          <span>{selected.length ? `Đã chọn ${selected.length} người` : (placeholder || 'Chọn...')}</span>
          <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
        {onClear && (
          <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={disabled}
            onClick={onClear} title="Bỏ dòng này" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Chips người đã chọn */}
      {selectedEmps.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingLeft: 42 }}>
          {selectedEmps.map(nv => (
            <span key={nv.id_nhan_vien} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 6px 2px 9px',
              background: 'var(--info-bg)', color: 'var(--info-text)', borderRadius: 20, fontSize: 12, fontWeight: 500,
            }}>
              {nv.ho_ten}
              <button type="button" disabled={disabled} onClick={() => toggle(nv.id_nhan_vien)}
                style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Panel tick chọn */}
      {open && (
        <div style={{
          marginLeft: 42, border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border-lighter)' }}>
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} disabled={disabled}
              placeholder="Tìm theo tên hoặc email..."
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-title)' }} />
          </div>
          <div style={{ maxHeight: 168, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)' }}>Không tìm thấy nhân viên</div>
            ) : filtered.map(nv => {
              const checked = selected.includes(nv.id_nhan_vien);
              return (
                <label key={nv.id_nhan_vien} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
                  background: checked ? 'var(--info-bg)' : 'transparent',
                }}>
                  <input type="checkbox" checked={checked} disabled={disabled}
                    onChange={() => toggle(nv.id_nhan_vien)} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-title)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nv.ho_ten}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nv.email}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
