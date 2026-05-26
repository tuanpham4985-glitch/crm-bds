'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const isLoginPage = pathname === '/login';

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Restore collapse state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved === 'true') setSidebarCollapsed(true);
  }, []);

  // Track mobile breakpoint — don't apply collapsed state on mobile
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  const handleToggleCollapse = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

  // On mobile, never apply collapsed — sidebar uses hamburger menu instead
  const effectivelyCollapsed = sidebarCollapsed && !isMobile;

  return (
    <div className={`app-layout${effectivelyCollapsed ? ' sidebar-is-collapsed' : ''}`}>
      {/* Mobile Top Header */}
      <div className="mobile-header">
        <div className="flex items-center gap-3">
          <button className="btn-icon" onClick={() => setMobileMenuOpen(true)}>
            <Menu size={24} style={{ color: 'var(--text-title)' }} />
          </button>
          <span style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-title)' }}>
            VICTORY HOLDINGS
          </span>
        </div>
      </div>

      {/* Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar Wrapper */}
      <div className={`sidebar-wrapper ${mobileMenuOpen ? 'open' : ''}`}>
        <Sidebar collapsed={effectivelyCollapsed} onToggleCollapse={handleToggleCollapse} />
      </div>

      {/* Desktop Collapse Toggle Button */}
      <button
        className="sidebar-toggle-btn"
        onClick={handleToggleCollapse}
        title={effectivelyCollapsed ? 'Mở rộng sidebar' : 'Thu hẹp sidebar'}
      >
        {effectivelyCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <main className="main-content">
        <div className="content-fluid">
          {children}
        </div>
      </main>
    </div>
  );
}
