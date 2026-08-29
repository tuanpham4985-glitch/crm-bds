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
  // hình Dự án cũ (phanKhachIds) — Sale CHỈ tham gia qua Campaign (kể cả
  // chưa được gán data nào) bị ẩn hẳn, dù /phan-khach tự nó vẫn cho MỌI
  // vai_tro==='Sale' vào (canAccessPage). Với Admin (phanKhachIds === null)
  // giữ nguyên bypass cũ; với non-admin, server (route.ts) đã tự tính đủ 3
  // tín hiệu (Dự án cũ / Campaign CSKH / vai_tro Sale) vào field
  // "canPhanKhach" — dùng thẳng, không tự suy diễn lại ở client.
  const canPhanKhach = phanKhachIds === null || Boolean(data?.canPhanKhach);

  return {
    isLoading,
    canKH: (data?.canKH as boolean) ?? false,
    canPhanKhach,
    phanKhachIds, // use in page to filter project dropdown
    handoffCount: Number(data?.handoffCount || 0),
    canQualityDashboard: Boolean(data?.canQualityDashboard),
  };
}
