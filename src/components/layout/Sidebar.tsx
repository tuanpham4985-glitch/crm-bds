'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2, UserCog, FileText, LogOut, Download, ShieldCheck, Shield, BadgeDollarSign, Key, Lock, Eye, EyeOff, X,
  ChevronDown, Briefcase, BarChart3, LayoutList, TrendingUp, MapPin, ClipboardList,
} from 'lucide-react';
import useSWR from 'swr';
import styles from './Sidebar.module.css';
import { useAuth } from '@/hooks/useAuth';
import { useTmStore } from '@/stores/tmStore';

// Hook: trả về badge count cho sidebar
// - Nếu đang ở trang TM: lấy từ Zustand (đã được cập nhật bởi useNotifications)
// - Nếu ở trang khác: fetch 1 lần, không refresh tự động
function useTmBadge(loggedIn: boolean, onTmPage: boolean): number {
  const badgeFromStore = useTmStore(s => s.badgeTotal);
  const { data } = useSWR(
    !loggedIn || onTmPage ? null : '/api/tm/badge',
    (url: string) => fetch(url).then(r => r.json()),
    { revalidateOnFocus: false, refreshInterval: 0, dedupingInterval: 300_000 },
  );
  if (onTmPage) return badgeFromStore;
  return data?.data?.count ?? 0;
}

const swrFetcher = (url: string) => fetch(url).then(r => r.json());
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const CRM_CATALOG = [
  { href: '/du-an',     label: 'Dự án',        icon: Building2 },
  { href: '/stacking',  label: 'Bảng hàng',    icon: LayoutList },
];

const HRM_ITEMS = [
  { href: '/nhan-vien', label: 'Nhân viên', icon: UserCog },
  { href: '/nhan-vien/hop-dong', label: 'Hợp đồng', icon: FileText },
  { href: '/nhan-vien/bang-luong', label: 'Bảng lương', icon: BadgeDollarSign },
  { href: '/cham-cong-ngoai', label: 'Chấm công online', icon: MapPin },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();

  const { data: pendingData } = useSWR(
    user ? '/api/cham-cong-ngoai/pending-count' : null,
    swrFetcher,
    { refreshInterval: 30_000 },
  );
  const pendingCount: number = pendingData?.count ?? 0;

  // Badge từ Zustand store (được set bởi useNotifications khi ở trang TM)
  // Khi không ở trang TM: fetch 1 lần lúc mount, không auto-refresh
  const tmBadge: number = useTmBadge(!!user, pathname.startsWith('/quan-ly-cong-viec'));
  const [logo, setLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const [hrmOpen, setHrmOpen] = useState(true);

  // Auto-expand HRM group if current path is inside
  useEffect(() => {
    if (HRM_ITEMS.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))) setHrmOpen(true);
  }, [pathname]);

  // Force group open when collapsed (so icons are visible)
  useEffect(() => {
    if (collapsed) setHrmOpen(true);
  }, [collapsed]);

  // Password Modal State
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ old: '', new: '', confirm: '' });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    // Hiển thị logo từ localStorage ngay lập tức (cache nhanh)
    const cached = localStorage.getItem('company_logo');
    if (cached) setLogo(cached);

    // Đồng bộ logo từ server (để sync giữa các thiết bị)
    fetch('/api/settings/logo')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setLogo(d.data);
          localStorage.setItem('company_logo', d.data);
        }
      })
      .catch(() => {});

    // PWA Check
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone);
    
    // Check iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setIsIOS(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    window.location.href = '/login';
  };

  const handleInstallApp = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the A2HS prompt');
        }
        setDeferredPrompt(null);
      });
    } else if (isIOS) {
      alert("Trên iPhone/iPad:\n1. Bấm nút Chia sẻ (biểu tượng ô vuông có mũi tên lên) ở thanh dưới cùng của Safari.\n2. Chọn 'Thêm vào MH chính' (Add to Home Screen) để cài đặt App.");
    } else {
      alert("Trình duyệt của bạn không hỗ trợ cài đặt tự động. Vui lòng mở menu trình duyệt (dấu 3 chấm) và chọn 'Thêm vào Màn hình chính' (Add to Home Screen) để cài đặt App.");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.new !== pwdForm.confirm) {
      alert('Mật khẩu mới không khớp nhau');
      return;
    }
    if (pwdForm.new.length < 6) {
      alert('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }

    setPwdLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword: pwdForm.old,
          newPassword: pwdForm.new
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Đổi mật khẩu thành công!');
        setShowPwdModal(false);
        setPwdForm({ old: '', new: '', confirm: '' });
      } else {
        alert(data.error || 'Đổi mật khẩu thất bại');
      }
    } catch (err) {
      alert('Lỗi kết nối server');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      alert('Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        // Logo chỉ hiển thị ~40px — nén xuống 128px để tiết kiệm dung lượng
        const MAX_DIMENSION = 128;
        if (width > height) {
          if (width > MAX_DIMENSION) { height = Math.round((height * MAX_DIMENSION) / width); width = MAX_DIMENSION; }
        } else {
          if (height > MAX_DIMENSION) { width = Math.round((width * MAX_DIMENSION) / height); height = MAX_DIMENSION; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.85;
        const attemptCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) return;
            // Mục tiêu < 30KB để lưu được vào Google Sheets
            if (blob.size > 30 * 1024 && quality > 0.2) {
              quality -= 0.15;
              attemptCompress();
            } else {
              const readerBlob = new FileReader();
              readerBlob.readAsDataURL(blob);
              readerBlob.onloadend = () => {
                const base64data = readerBlob.result as string;
                // Hiển thị ngay
                setLogo(base64data);
                localStorage.setItem('company_logo', base64data);
                // Đồng bộ lên server để sync mobile/desktop
                fetch('/api/settings/logo', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ logo: base64data }),
                }).catch(() => {});
              };
            }
          }, 'image/webp', quality);
        };
        attemptCompress();
      };
    };
  };

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      {/* Logo */}
      <div className={styles.logo}>
        <div
          className={styles.logoIcon}
          onClick={() => isAdmin && fileInputRef.current?.click()}
          title={isAdmin ? "Thay đổi avatar công ty" : "VICTORY HOLDINGS"}
          style={{ cursor: isAdmin ? 'pointer' : 'default' }}
        >
          {logo ? (
            <img src={logo} alt="Company Logo" />
          ) : (
            <Building2 size={22} />
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleLogoUpload}
        />
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {/* DASHBOARD */}
        <div className={styles.navSection}>
          <Link
            href="/"
            className={`${styles.navItem} ${pathname === '/' ? styles.active : ''}`}
            title="Dashboard"
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>
        </div>

        {/* Dự án & Bảng hàng — standalone links */}
        {CRM_CATALOG.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <div key={item.href} className={styles.navSection}>
              <Link
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                title={item.label}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            </div>
          );
        })}

        {/* TASK MANAGEMENT */}
        <div className={styles.navSection}>
          <Link
            href="/quan-ly-cong-viec"
            className={`${styles.navItem} ${pathname.startsWith('/quan-ly-cong-viec') ? styles.active : ''}`}
            title="Quản lý công việc"
          >
            <ClipboardList size={20} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <span style={{ flex: 1 }}>Giao việc</span>
              {tmBadge > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  lineHeight: '16px', minWidth: 16, height: 16,
                  padding: '0 4px', borderRadius: 8, textAlign: 'center', flexShrink: 0,
                }}>
                  {tmBadge > 9 ? '9+' : tmBadge}
                </span>
              )}
            </span>
          </Link>
        </div>

        {/* BÁO CÁO — standalone link */}
        <div className={styles.navSection}>
          <Link
            href="/bao-cao-ban-hang"
            className={`${styles.navItem} ${pathname.startsWith('/bao-cao-ban-hang') ? styles.active : ''}`}
            title="Báo cáo bán hàng"
          >
            <BarChart3 size={20} />
            <span>Báo cáo bán hàng</span>
          </Link>
        </div>
        {isAdmin && (
          <div className={styles.navSection}>
            <Link
              href="/tai-chinh"
              className={`${styles.navItem} ${pathname.startsWith('/tai-chinh') ? styles.active : ''}`}
              title="Tài chính"
            >
              <TrendingUp size={20} />
              <span>Tài chính</span>
            </Link>
          </div>
        )}

        {/* HRM GROUP */}
        <div className={styles.navSection}>
          <button 
            className={styles.groupHeader} 
            onClick={() => setHrmOpen(!hrmOpen)}
          >
            <div className="flex items-center gap-3">
              <Briefcase size={18} />
              <span>HRM</span>
            </div>
            <ChevronDown size={14} className={`${styles.chevron} ${hrmOpen ? styles.open : ''}`} />
          </button>
          
          <div className={`${styles.groupContent} ${hrmOpen ? styles.open : ''}`}>
            {HRM_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href);
              const Icon = item.icon;
              const showBadge = item.href === '/cham-cong-ngoai' && pendingCount > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${isActive ? styles.active : ''} ${styles.subItem}`}
                  title={showBadge ? `${item.label} (${pendingCount} đơn chờ duyệt)` : item.label}
                >
                  <Icon size={18} />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {showBadge && (
                      <span style={{
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: '16px',
                        minWidth: 16,
                        height: 16,
                        padding: '0 4px',
                        borderRadius: 8,
                        textAlign: 'center',
                        flexShrink: 0,
                      }}>
                        {pendingCount}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* User section */}
      <div className={styles.userSection}>
        {/* Current user info */}
        {user && (
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>
              {user.ho_ten?.split(' ').pop()?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className={styles.userMeta}>
              <div className={styles.userName}>{user.ho_ten}</div>
              <div className={styles.userRole}>
                {user.vai_tro === 'Admin' ? (
                  <><Shield size={11} style={{ color: 'var(--primary)' }} /> Admin</>
                ) : user.vai_tro === 'HR' ? (
                  <><ShieldCheck size={11} style={{ color: '#6366f1' }} /> HR</>
                ) : (
                  <><Shield size={11} style={{ color: 'var(--success-text)' }} /> {user.employee_type || user.vai_tro}</>
                )}
              </div>
            </div>
          </div>
        )}
        {!isStandalone && (
          <button onClick={handleInstallApp} className={styles.installBtn}>
            <Download size={18} />
            <span>Cài đặt App</span>
          </button>
        )}
        <button onClick={() => setShowPwdModal(true)} className={styles.installBtn} style={{ marginTop: 4, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)' }}>
          <Key size={18} />
          <span>Đổi mật khẩu</span>
        </button>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={18} />
          <span>Đăng xuất</span>
        </button>
      </div>

      {/* Change Password Modal */}
      {showPwdModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Đổi mật khẩu</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowPwdModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Mật khẩu cũ</label>
                  <div className="search-wrapper">
                    <Lock size={16} className="search-icon" />
                    <input 
                      type={showOld ? "text" : "password"} 
                      className="form-input" 
                      required
                      value={pwdForm.old}
                      onChange={e => setPwdForm({...pwdForm, old: e.target.value})}
                    />
                    <button type="button" className="search-icon" style={{ right: 8, left: 'auto', pointerEvents: 'auto' }} onClick={() => setShowOld(!showOld)}>
                      {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Mật khẩu mới</label>
                  <div className="search-wrapper">
                    <Lock size={16} className="search-icon" />
                    <input 
                      type={showNew ? "text" : "password"} 
                      className="form-input" 
                      required
                      value={pwdForm.new}
                      onChange={e => setPwdForm({...pwdForm, new: e.target.value})}
                    />
                    <button type="button" className="search-icon" style={{ right: 8, left: 'auto', pointerEvents: 'auto' }} onClick={() => setShowNew(!showNew)}>
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Xác nhận mật khẩu mới</label>
                  <div className="search-wrapper">
                    <Lock size={16} className="search-icon" />
                    <input 
                      type="password" 
                      className="form-input" 
                      required
                      value={pwdForm.confirm}
                      onChange={e => setPwdForm({...pwdForm, confirm: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPwdModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={pwdLoading}>
                  {pwdLoading ? 'Đang xử lý...' : 'Cập nhật'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
