// Chọn nhiều trên bảng Khách hàng — pure Set helpers, tách khỏi component để
// test độc lập, không phụ thuộc React render. Client-safe (không import
// crm-auth/next-headers), dùng được cả trong Client Component.

export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

export function isAllVisibleSelected(selected: ReadonlySet<string>, visibleIds: readonly string[]): boolean {
  return visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
}

/** Bấm checkbox header: nếu tất cả dòng đang hiển thị đã được chọn -> bỏ chọn hết; ngược lại chọn hết. */
export function toggleSelectAllVisible(selected: ReadonlySet<string>, visibleIds: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (isAllVisibleSelected(selected, visibleIds)) visibleIds.forEach(id => next.delete(id));
  else visibleIds.forEach(id => next.add(id));
  return next;
}
