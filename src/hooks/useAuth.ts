import useSWR from 'swr';
import type { NhanVien } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useAuth() {
  const { data, error, isLoading, mutate } = useSWR('/api/auth', fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false
  });

  const user: NhanVien | null = data?.success ? data.data : null;

  return {
    user,
    isLoading,
    isError: error || (data && !data.success),
    isAdmin: user?.vai_tro === 'Admin',
    mutate
  };
}
