import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useCrmAccess() {
  const { data, isLoading } = useSWR('/api/crm-access', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000, // cache 1 minute
  });

  // phanKhachIds: null = admin (all projects), [] = no access, [...] = specific project IDs
  const phanKhachIds: string[] | null | undefined = data?.phanKhachIds;
  const canPhanKhach =
    phanKhachIds === null || (Array.isArray(phanKhachIds) && phanKhachIds.length > 0);

  return {
    isLoading,
    canKH: (data?.canKH as boolean) ?? false,
    canPhanKhach,
    phanKhachIds, // use in page to filter project dropdown
    handoffCount: Number(data?.handoffCount || 0),
    canQualityDashboard: Boolean(data?.canQualityDashboard),
  };
}
