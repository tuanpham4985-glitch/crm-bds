import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// CRM Module Toggle — module availability gate (độc lập M1B.2 business
// authority). dedupingInterval ngắn để Admin bật/tắt phản ánh gần như ngay,
// không cần đợi focus lại tab (revalidateOnFocus true — khác useCrmAccess).
export function useCrmModule() {
  const { data, isLoading, mutate } = useSWR('/api/crm-module', fetcher, {
    dedupingInterval: 10_000,
  });

  return {
    isLoading,
    enabled: Boolean(data?.data?.enabled ?? true),
    mutate,
  };
}
