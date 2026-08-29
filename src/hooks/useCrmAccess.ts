import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useCrmAccess() {
  const { data, isLoading } = useSWR('/api/crm-access', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000, // cache 1 minute
  });

  // phanKhachIds: null = admin (all projects), [] = no access, [...] = specific project IDs
  const phanKhachIds: string[] | null | undefined = data?.phanKhachIds;
  // Fix: mục "CSKH" ở Sidebar trước đây chỉ hiện cho ai có dấu vết trong mô
  // hình Dự án cũ (phanKhachIds) — nhân viên CHỈ tham gia qua Campaign CSKH
  // (Sale CSKH/Leader) không có dấu vết đó nên bị ẩn hẳn, dù /phan-khach tự
  // nó vẫn cho họ vào (canAccessPage chỉ cần vai_tro === 'Sale'). Cộng thêm
  // hasCampaignCskhAccess (server tính từ CampaignMembership/Campaign.owner_*)
  // — không đổi ý nghĩa phanKhachIds (vẫn dùng riêng để lọc dropdown "Theo
  // Dự án", xem /phan-khach/page.tsx).
  const canPhanKhach =
    phanKhachIds === null
    || (Array.isArray(phanKhachIds) && phanKhachIds.length > 0)
    || Boolean(data?.hasCampaignCskhAccess);

  return {
    isLoading,
    canKH: (data?.canKH as boolean) ?? false,
    canPhanKhach,
    phanKhachIds, // use in page to filter project dropdown
    handoffCount: Number(data?.handoffCount || 0),
    canQualityDashboard: Boolean(data?.canQualityDashboard),
  };
}
