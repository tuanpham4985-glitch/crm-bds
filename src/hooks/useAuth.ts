import useSWR from 'swr';
import type { NhanVien } from '@/lib/types';
import { SENIOR_EMPLOYEE_TYPES } from '@/lib/constants';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useAuth() {
  const { data, error, isLoading, mutate } = useSWR('/api/auth', fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false
  });

  const user: NhanVien | null = data?.success ? data.data : null;

  const isAdmin = user?.vai_tro === 'Admin' || (SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(user?.employee_type || '');
  const isHR = user?.vai_tro === 'HR';

  return {
    user,
    isLoading,
    isError: error || (data && !data.success),
    isAdmin,
    isHR,
    /** Có quyền chỉnh sửa dữ liệu HRM (Admin hoặc HR) */
    canEditHRM: isAdmin || isHR,
    mutate
  };
}
