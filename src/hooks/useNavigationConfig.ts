import useSWR from 'swr';
import type { PersistedNavigationConfig } from '@/lib/navigation-config-resolve';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// Trả về RAW persisted config (chỉ order/visible) — Sidebar/Menu Manager tự
// gọi resolveNavigationConfig(MENU_REGISTRY, config, ...) để merge với
// registry. dedupingInterval ngắn để Admin lưu xong phản ánh gần như ngay.
export function useNavigationConfig() {
  const { data, isLoading, mutate } = useSWR('/api/navigation-config', fetcher, {
    dedupingInterval: 10_000,
  });

  return {
    isLoading,
    config: (data?.data as PersistedNavigationConfig | undefined) ?? null,
    mutate,
  };
}
