'use client';

// ADMIN_MODULE_MENU_MANAGER — Admin kéo-thả order + bật/tắt module/menu con
// của Sidebar, runtime, không cần deploy. Entry point này CỐ ĐỊNH ngoài
// MENU_REGISTRY (không phải 1 mục có thể ẩn/sắp xếp) — xem link "Quản lý
// Menu & Module" trong Sidebar.tsx, admin-only, không phụ thuộc CRM Module
// hay navigation_config_v1 — đây chính là recovery path bắt buộc (§8).
//
// Root 'crm' KHÔNG lưu enabled vào navigation_config_v1 — authority bật/tắt
// CRM vẫn là crm_module_enabled hiện có (useCrmModule/PUT /api/crm-module),
// tránh 2 authority song song (xem toPersistedConfig trong
// navigation-config-resolve.ts).
import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { AlertTriangle, GripVertical, LayoutGrid, RotateCcw, Save } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCrmModule } from '@/hooks/useCrmModule';
import { useNavigationConfig } from '@/hooks/useNavigationConfig';
import { MENU_REGISTRY } from '@/lib/menu-registry';
import {
  resolveNavigationConfig, toPersistedConfig, DEFAULT_NAVIGATION_CONFIG,
  type ResolvedNavigation,
} from '@/lib/navigation-config-resolve';

function ToggleButton({ enabled, onClick, disabled }: { enabled: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn btn-sm"
      style={{
        background: enabled ? 'rgba(5, 150, 105, 0.1)' : 'rgba(239, 68, 68, 0.1)',
        color: enabled ? 'var(--success-text)' : '#ef4444',
        border: 'none', minWidth: 60, opacity: disabled ? 0.6 : 1,
      }}
    >
      {enabled ? 'Bật' : 'Tắt'}
    </button>
  );
}

export default function AdminMenuPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { enabled: crmEnabled, mutate: mutateCrmModule } = useCrmModule();
  const { config, isLoading: configLoading, mutate: mutateConfig } = useNavigationConfig();

  const [draft, setDraft] = useState<ResolvedNavigation | null>(null);
  const [draftCrmEnabled, setDraftCrmEnabled] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Chỉ khởi tạo draft đúng 1 lần khi data load xong — tránh SWR revalidate
  // nền giữa chừng ghi đè edit dang dở của Admin.
  useEffect(() => {
    if (initialized || configLoading) return;
    setDraft(resolveNavigationConfig(MENU_REGISTRY, config ?? DEFAULT_NAVIGATION_CONFIG, { crm: crmEnabled }));
    setDraftCrmEnabled(crmEnabled);
    setInitialized(true);
  }, [initialized, configLoading, config, crmEnabled]);

  function toggleRoot(key: string) {
    setDraft(current => current && { roots: current.roots.map(r => r.key === key ? { ...r, enabled: !r.enabled } : r) });
  }
  function toggleChild(parentKey: string, childKey: string) {
    setDraft(current => current && {
      roots: current.roots.map(r => r.key !== parentKey ? r : {
        ...r, children: r.children.map(c => c.key === childKey ? { ...c, enabled: !c.enabled } : c),
      }),
    });
  }

  function onDragEnd(result: DropResult) {
    const { source, destination, type } = result;
    if (!destination) return;
    if (type === 'ROOT') {
      if (source.droppableId !== 'roots' || destination.droppableId !== 'roots') return;
      setDraft(current => {
        if (!current) return current;
        const roots = Array.from(current.roots);
        const [moved] = roots.splice(source.index, 1);
        roots.splice(destination.index, 0, moved);
        return { roots };
      });
      return;
    }
    // type là `child-<rootKey>` (unique/parent — @hello-pangea/dnd tự chặn
    // drop khác type ở tầng thư viện) — chỉ cho phép reorder TRONG chính
    // parent, không cho đổi parent (đúng yêu cầu milestone).
    if (source.droppableId !== destination.droppableId) return;
    const parentKey = source.droppableId.replace('child-', '');
    setDraft(current => {
      if (!current) return current;
      return {
        roots: current.roots.map(r => {
          if (r.key !== parentKey) return r;
          const children = Array.from(r.children);
          const [moved] = children.splice(source.index, 1);
          children.splice(destination.index, 0, moved);
          return { ...r, children };
        }),
      };
    });
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setNotice(null);
    try {
      if (draftCrmEnabled !== crmEnabled) {
        const res = await fetch('/api/crm-module', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: draftCrmEnabled }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Không thể lưu trạng thái CRM.');
        await mutateCrmModule();
      }
      const persisted = toPersistedConfig(draft);
      const res2 = await fetch('/api/navigation-config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persisted),
      });
      const data2 = await res2.json();
      if (!data2.success) throw new Error(data2.error || 'Không thể lưu cấu hình Menu.');
      await mutateConfig();
      setNotice({ type: 'ok', text: 'Đã lưu cấu hình Menu & Module.' });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể lưu cấu hình.' });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    // Reset chỉ áp dụng cho order/visible (navigation_config_v1) — KHÔNG đụng
    // trạng thái CRM Module thật (đó là authority riêng, không phải thứ Menu
    // Manager sở hữu để "reset về mặc định").
    setDraft(resolveNavigationConfig(MENU_REGISTRY, DEFAULT_NAVIGATION_CONFIG, { crm: crmEnabled }));
    setDraftCrmEnabled(crmEnabled);
    setNotice(null);
  }

  if (authLoading) return <div className="loading-spinner"><div className="spinner" /></div>;

  // Admin-only, KHÔNG phụ thuộc CRM Module hay navigation config — recovery
  // path phải luôn hoạt động bất kể trạng thái runtime nào khác.
  if (!isAdmin) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--text-secondary)' }}>
      <AlertTriangle size={40} style={{ color: '#ef4444', opacity: 0.7 }} />
      <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Bạn không có quyền truy cập trang này</p>
      <p style={{ fontSize: 13, margin: 0 }}>Chỉ Admin mới quản lý được Menu & Module</p>
    </div>
  );

  if (!draft) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1><LayoutGrid size={22} style={{ verticalAlign: -4, marginRight: 8 }} />Quản lý Menu & Module</h1>
          <p>Kéo-thả để sắp xếp, bật/tắt hiển thị — có hiệu lực ngay, không cần deploy. Không thay đổi quyền nghiệp vụ của từng người dùng.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleReset} disabled={saving}><RotateCcw size={15} /> Reset về mặc định</button>
          <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}><Save size={15} /> {saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>

      {notice && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: notice.type === 'ok' ? '#ecfdf5' : '#fef2f2', color: notice.type === 'ok' ? '#047857' : '#b91c1c', fontSize: 13 }}>
          {notice.text}
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="roots" type="ROOT">
          {(rootProvided) => (
            <div ref={rootProvided.innerRef} {...rootProvided.droppableProps} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {draft.roots.map((root, idx) => {
                const def = MENU_REGISTRY.find(r => r.key === root.key);
                if (!def) return null;
                const isCrmRoot = def.moduleAvailability === 'crm';
                const rootEnabled = isCrmRoot ? draftCrmEnabled : root.enabled;
                const Icon = def.icon;
                return (
                  <Draggable key={def.key} draggableId={def.key} index={idx}>
                    {(rootDrag) => (
                      <div ref={rootDrag.innerRef} {...rootDrag.draggableProps} className="card" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span {...rootDrag.dragHandleProps} style={{ cursor: 'grab', color: 'var(--text-muted)', display: 'flex' }} title="Kéo để sắp xếp">
                            <GripVertical size={16} />
                          </span>
                          <Icon size={18} />
                          <strong style={{ flex: 1 }}>{def.label}</strong>
                          <ToggleButton enabled={rootEnabled} onClick={() => isCrmRoot ? setDraftCrmEnabled(v => !v) : toggleRoot(root.key)} />
                        </div>
                        {isCrmRoot && (
                          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0 34px' }}>
                            Dùng chung công tắc CRM Module hiện có — không tạo trạng thái riêng.
                          </p>
                        )}
                        {root.children.length > 0 && (
                          <Droppable droppableId={`child-${root.key}`} type={`child-${root.key}`}>
                            {(childProvided) => (
                              <div ref={childProvided.innerRef} {...childProvided.droppableProps} style={{ marginTop: 10, paddingLeft: 26, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {root.children.map((child, cidx) => {
                                  const childDef = def.children?.find(c => c.key === child.key);
                                  if (!childDef) return null;
                                  const ChildIcon = childDef.icon;
                                  return (
                                    <Draggable key={child.key} draggableId={child.key} index={cidx}>
                                      {(childDrag) => (
                                        <div ref={childDrag.innerRef} {...childDrag.draggableProps} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-secondary, #f8fafc)' }}>
                                          <span {...childDrag.dragHandleProps} style={{ cursor: 'grab', color: 'var(--text-muted)', display: 'flex' }} title="Kéo để sắp xếp">
                                            <GripVertical size={14} />
                                          </span>
                                          <ChildIcon size={16} />
                                          <span style={{ flex: 1, fontSize: 13.5 }}>{childDef.label}</span>
                                          <ToggleButton enabled={child.enabled} onClick={() => toggleChild(root.key, child.key)} />
                                        </div>
                                      )}
                                    </Draggable>
                                  );
                                })}
                                {childProvided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {rootProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
