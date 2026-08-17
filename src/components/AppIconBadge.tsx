'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/hooks/useAuth';

/**
 * Gắn số đơn "chờ duyệt" lên ICON của app đã cài (PWA) qua App Badging API.
 *
 * - Desktop (Windows/macOS, Chrome/Edge) khi đã "Cài ứng dụng": badge hiện trên
 *   icon thanh taskbar/dock. Hoạt động tốt.
 * - iOS 16.4+ khi "Thêm vào màn hình chính" + đã cấp quyền thông báo: có hỗ trợ.
 * - Android: Chrome KHÔNG hỗ trợ gắn số lên icon màn hình chính (giới hạn trình
 *   duyệt) — sẽ không thấy, đây không phải lỗi app.
 *
 * Badge cập nhật khi app đang mở/chạy. Muốn cập nhật cả khi app đã đóng thì cần
 * Web Push (server đẩy → service worker gọi setAppBadge) — chưa làm ở bản này.
 */

const fetcher = (url: string) => fetch(url).then(r => r.json());

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export default function AppIconBadge() {
  const { user } = useAuth();

  // Cùng key với Sidebar → SWR dùng chung, không gọi API thêm lần nữa.
  const { data } = useSWR(
    user ? '/api/cham-cong-ngoai/pending-count' : null,
    fetcher,
    { refreshInterval: 30_000 },
  );
  const count: number = data?.count ?? 0;

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as BadgeNavigator;
    if (!('setAppBadge' in nav)) return; // Trình duyệt không hỗ trợ → bỏ qua im lặng

    if (user && count > 0) {
      nav.setAppBadge?.(count).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [user, count]);

  // Xoá badge khi rời trang/đăng xuất
  useEffect(() => {
    return () => {
      if (typeof navigator === 'undefined') return;
      (navigator as BadgeNavigator).clearAppBadge?.().catch(() => {});
    };
  }, []);

  return null;
}
