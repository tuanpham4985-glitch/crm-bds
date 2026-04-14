'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, GitBranch, CheckSquare,
  Building2, UserCog, LogOut, Download, ShieldCheck, Shield
} from 'lucide-react';
import styles from './Sidebar.module.css';
import { useAuth } from '@/hooks/useAuth';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/khach-hang', label: 'Khách hàng', icon: Users },
  { href: '/pipeline', label: 'Pipeline', icon: GitBranch },
  { href: '/cong-viec', label: 'Công việc', icon: CheckSquare },
  { href: '/du-an', label: 'Dự án', icon: Building2 },
  { href: '/nhan-vien', label: 'Nhân viên', icon: UserCog },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [logo, setLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const savedLogo = localStorage.getItem('company_logo');
    if (savedLogo) {
      setLogo(savedLogo);
    }

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
      alert("Trình duyệt của bạn không hỗ trợ cài đặt tự động. Vui lòng mở menu trình duyệt (dấu 3 chấm) và chọn 'Thêm vào Màn hình chính' để cài đặt App.");
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
        const MAX_DIMENSION = 800;

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
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.9;
        const attemptCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) return;
            // Target format is < 500KB for Logo
            if (blob.size > 500 * 1024 && quality > 0.1) {
              quality -= 0.1;
              attemptCompress();
            } else {
              const readerBlob = new FileReader();
              readerBlob.readAsDataURL(blob);
              readerBlob.onloadend = () => {
                const base64data = readerBlob.result as string;
                setLogo(base64data);
                localStorage.setItem('company_logo', base64data);
              };
            }
          }, 'image/webp', quality);
        };
        attemptCompress();
      };
    };
  };

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logo}>
        <div
          className={styles.logoIcon}
          onClick={() => fileInputRef.current?.click()}
          title="Thay đổi avatar công ty"
        >
          {logo ? (
            <img src={logo} alt="Company Logo" />
          ) : (
            <Building2 size={22} />
          )}
        </div>
        <div>
          <div className={styles.logoTitle}>CRM BĐS</div>
          <div className={styles.logoSubtitle}>Quản lý bất động sản</div>
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
        <div className={styles.navSection}>
          <span className={styles.navLabel}>Menu chính</span>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
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
                  <><ShieldCheck size={11} /> Admin</>
                ) : (
                  <><Shield size={11} /> {user.vai_tro}</>
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
        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={18} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}
