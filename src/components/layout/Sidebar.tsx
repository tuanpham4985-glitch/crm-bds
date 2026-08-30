'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2, LogOut, Download, ShieldCheck, Shield, Key, Lock, Eye, EyeOff, X,
  ChevronDown, Power, LayoutGrid,
} from 'lucide-react';
import useSWR from 'swr';
import styles from './Sidebar.module.css';
import UserAvatar from './UserAvatar';
import { useAuth } from '@/hooks/useAuth';
import { useTmStore } from '@/stores/tmStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCrmAccess } from '@/hooks/useCrmAccess';
import { useCrmModule } from '@/hooks/useCrmModule';
import { useNavigationConfig } from '@/hooks/useNavigationConfig';
import { canAccessCrmModule } from '@/lib/crm-module-access';
import { MENU_REGISTRY, hasBusinessAccess, type MenuRootDef, type MenuChildDef } from '@/lib/menu-registry';
import { resolveNavigationConfig, DEFAULT_NAVIGATION_CONFIG } from '@/lib/navigation-config-resolve';

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

// Badge số (chờ duyệt/chưa đọc) gắn theo registry key — dữ liệu runtime,
// KHÔNG thuộc registry (registry chỉ tĩnh: route/icon/structure).
function navBadgeForKey(key: string, counts: { handoffCount: number; tmBadge: number; pendingCount: number }): number {
  if (key === 'crm.cskh') return counts.handoffCount;
  if (key === 'taskManagement') return counts.tmBadge;
  if (key === 'hrm.attendance') return counts.pendingCount;
  return 0;
}

function NavBadge({ count }: { count: number }) {
  return (
    <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '16px', minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, textAlign: 'center', flexShrink: 0 }}>
      {count > 9 ? '9+' : count}
    </span>
  );
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { user, isAdmin, canEditHRM } = useAuth();
  const { canPhanKhach, handoffCount, canQualityDashboard } = useCrmAccess();
  const { enabled: crmEnabled, mutate: mutateCrmModule } = useCrmModule();
  const { config: navConfigRaw } = useNavigationConfig();

  const { data: pendingData } = useSWR(
    user ? '/api/cham-cong-ngoai/pending-count' : null,
    swrFetcher,
    { refreshInterval: 30_000 },
  );
  const pendingCount: number = pendingData?.count ?? 0;

  // Badge từ Zustand store (được set bởi useNotifications khi ở trang TM)
  // Khi không ở trang TM: fetch 1 lần lúc mount, không auto-refresh
  const tmBadge: number = useTmBadge(!!user, pathname.startsWith('/quan-ly-cong-viec'));
  const { logo, setLogo } = useSettingsStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // Menu Manager (ADMIN_MODULE_MENU_MANAGER) — pipeline: registry (route/
  // icon/structure/business rule) -> runtime order/visible (navConfigRaw) ->
  // module availability (crm root: authority DUY NHẤT vẫn là crm_module_
  // enabled qua useCrmModule, KHÔNG đọc từ navConfigRaw.disabledRoots cho
  // key 'crm' — resolveNavigationConfig tự override qua externalAvailability)
  // -> business authorization hiện có (canPhanKhach/canQualityDashboard/
  // canEditHRM/isAdmin) -> render. Business authorization LUÔN là bước cuối,
  // Menu Manager bật 1 mục không tự cấp quyền truy cập.
  const resolvedNav = resolveNavigationConfig(MENU_REGISTRY, navConfigRaw ?? DEFAULT_NAVIGATION_CONFIG, { crm: crmEnabled });
  const businessAccessCtx = { isAdmin, canPhanKhach, canQualityDashboard, canEditHRM };
  const visibleRoots = resolvedNav.roots
    .map(root => {
      const def = MENU_REGISTRY.find(r => r.key === root.key);
      if (!def) return null;
      // 'crm' giữ nguyên Admin bypass hiện có (canAccessCrmModule) — root
      // khác không có bypass này (không mở rộng ngoài scope milestone).
      const rootEnabled = def.moduleAvailability === 'crm' ? canAccessCrmModule(isAdmin, root.enabled) : root.enabled;
      if (!rootEnabled || !hasBusinessAccess(def.businessAccess, businessAccessCtx)) return null;
      const children = root.children
        .map(child => {
          const childDef = def.children?.find(c => c.key === child.key);
          if (!childDef || !child.enabled || !hasBusinessAccess(childDef.businessAccess, businessAccessCtx)) return null;
          return childDef;
        })
        .filter((c): c is MenuChildDef => Boolean(c));
      return { def, children };
    })
    .filter((r): r is { def: MenuRootDef; children: MenuChildDef[] } => Boolean(r));

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isGroupOpen = (key: string) => openGroups[key] ?? true;

  // Auto-expand group nếu path hiện tại nằm trong 1 child của nó
  useEffect(() => {
    for (const { def, children } of visibleRoots) {
      if (children.length && children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))) {
        setOpenGroups(current => current[def.key] ? current : { ...current, [def.key]: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Force mở tất cả group khi collapsed (để icon vẫn thấy được)
  useEffect(() => {
    if (!collapsed) return;
    setOpenGroups(current => {
      const next = { ...current };
      for (const { def } of visibleRoots) if (def.children) next[def.key] = true;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  // Password Modal State
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ old: '', new: '', confirm: '' });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // CRM Module Toggle Modal State (Admin-only)
  const [showCrmModuleModal, setShowCrmModuleModal] = useState(false);
  const [crmModulePending, setCrmModulePending] = useState(crmEnabled);
  const [crmModuleSaving, setCrmModuleSaving] = useState(false);
  const [crmModuleNotice, setCrmModuleNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  async function handleSaveCrmModule() {
    setCrmModuleSaving(true);
    setCrmModuleNotice(null);
    try {
      const res = await fetch('/api/crm-module', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: crmModulePending }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Không thể lưu cấu hình.');
      await mutateCrmModule();
      setCrmModuleNotice({ type: 'ok', text: `Đã ${crmModulePending ? 'bật' : 'tắt'} module CRM.` });
    } catch (error) {
      setCrmModuleNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể lưu cấu hình.' });
    } finally {
      setCrmModuleSaving(false);
    }
  }

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
        // Giữ ảnh đủ lớn để sắc nét khi hiển thị ở sidebar (~260px) và retina (2x)
        // MAX_DIMENSION = 512 đảm bảo logo không bị mờ khi scale lên
        const MAX_DIMENSION = 512;
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

        let quality = 0.82;
        const attemptCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) return;
            // Giới hạn ~36KB để base64 nằm dưới 50,000 ký tự (Google Sheets cell limit)
            if (blob.size > 36 * 1024 && quality > 0.15) {
              quality -= 0.12;
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
                })
                  .then(r => r.json())
                  .then(d => {
                    if (!d.success) alert('Lưu logo thất bại: ' + (d.error ?? 'Lỗi server'));
                  })
                  .catch(() => alert('Không thể kết nối server để lưu logo. Vui lòng thử lại.'));
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

      {/* Navigation — data-driven từ MENU_REGISTRY (route/icon/structure/
          business rule) + runtime navigation_config_v1 (order/visible) qua
          resolveNavigationConfig(), xem visibleRoots ở trên. Quản lý order/
          bật-tắt tại "Quản lý Menu & Module" (Admin-only, cố định ngoài
          registry — xem cuối component). */}
      <nav className={styles.nav}>
        {visibleRoots.map(({ def, children }) => {
          const Icon = def.icon;
          const badge = navBadgeForKey(def.key, { handoffCount, tmBadge, pendingCount });

          if (!def.children) {
            const isActive = def.href === '/' ? pathname === '/' : (pathname === def.href || pathname.startsWith(def.href!));
            return (
              <div key={def.key} className={styles.navSection}>
                <Link href={def.href!} className={`${styles.navItem} ${isActive ? styles.active : ''}`} title={def.label}>
                  <Icon size={20} />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <span style={{ flex: 1 }}>{def.label}</span>
                    {badge > 0 && <NavBadge count={badge} />}
                  </span>
                </Link>
              </div>
            );
          }

          const open = isGroupOpen(def.key);
          return (
            <div key={def.key} className={styles.navSection}>
              <button className={styles.groupHeader} onClick={() => setOpenGroups(current => ({ ...current, [def.key]: !open }))}>
                <div className="flex items-center gap-3">
                  <Icon size={18} />
                  <span>{def.label}</span>
                </div>
                <ChevronDown size={14} className={`${styles.chevron} ${open ? styles.open : ''}`} />
              </button>
              <div className={`${styles.groupContent} ${open ? styles.open : ''}`}>
                {children.map(child => {
                  const ChildIcon = child.icon;
                  const childBadge = navBadgeForKey(child.key, { handoffCount, tmBadge, pendingCount });
                  const isActive = pathname.startsWith(child.href);
                  return (
                    <Link key={child.key} href={child.href} className={`${styles.navItem} ${styles.subItem} ${isActive ? styles.active : ''}`} title={child.label}>
                      <ChildIcon size={18} />
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                        <span style={{ flex: 1 }}>{child.label}</span>
                        {childBadge > 0 && <NavBadge count={childBadge} />}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User section */}
      <div className={styles.userSection}>
        {/* Current user info */}
        {user && (
          <div className={styles.userInfo}>
            <UserAvatar className={styles.userAvatar} name={user.ho_ten} src={user.avatar_url} size={40} />
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
        {isAdmin && (
          <button
            onClick={() => { setCrmModulePending(crmEnabled); setCrmModuleNotice(null); setShowCrmModuleModal(true); }}
            className={styles.installBtn}
            style={{ marginTop: 4, background: crmEnabled ? 'rgba(5, 150, 105, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: crmEnabled ? 'var(--success-text)' : '#ef4444' }}
          >
            <Power size={18} />
            <span>CRM Module: {crmEnabled ? 'Bật' : 'Tắt'}</span>
          </button>
        )}
        {/* Quản lý Menu & Module — Admin-only, CỐ ĐỊNH NGOÀI registry (không
            phải 1 mục trong MENU_REGISTRY) nên Admin KHÔNG THỂ tự ẩn/khoá
            khỏi chính control này bằng drag/drop hay tắt module, và CRM OFF
            cũng không ảnh hưởng — đây là entry point recovery bắt buộc. */}
        {isAdmin && (
          <Link href="/admin/menu" className={styles.installBtn} style={{ marginTop: 4, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)' }}>
            <LayoutGrid size={18} />
            <span>Quản lý Menu & Module</span>
          </Link>
        )}
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

      {/* CRM Module Toggle Modal — Admin-only. Module availability gate độc
          lập với business authorization (isCrmAdmin/canManageCampaign/...
          không đổi bởi toggle này). */}
      {showCrmModuleModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">CRM Module</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCrmModuleModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
                Ẩn/hiện module CRM đối với người dùng. Không thay đổi quyền nghiệp vụ.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-secondary, #f8fafc)', borderRadius: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={crmModulePending}
                  onChange={e => setCrmModulePending(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontWeight: 600 }}>Trạng thái: {crmModulePending ? 'Bật' : 'Tắt'}</span>
              </label>
              {crmModuleNotice && (
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: crmModuleNotice.type === 'ok' ? '#ecfdf5' : '#fef2f2', color: crmModuleNotice.type === 'ok' ? '#047857' : '#b91c1c' }}>
                  {crmModuleNotice.text}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCrmModuleModal(false)}>Hủy</button>
              <button type="button" className="btn btn-primary" disabled={crmModuleSaving} onClick={() => void handleSaveCrmModule()}>
                {crmModuleSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
