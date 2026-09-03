import { NextRequest, NextResponse } from 'next/server';
import {
  getStackingConfigs, addStackingConfig, updateStackingConfig, deleteStackingConfig,
  probeStackingSheet, getStackingListColumns, extractSheetId,
} from '@/lib/data-access';
import { reconcileVisibleColumns } from '@/lib/stacking-list';

// GET  /api/stacking/configs          — danh sách configs
// POST /api/stacking/configs          — thêm config mới
// DELETE /api/stacking/configs?id=xxx — xóa config
export async function GET() {
  try {
    const data = await getStackingConfigs();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking/configs GET]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ten_hien_thi, sheet_id, project_code, loai, sheet_tab, visible_columns } = body;

    if (!ten_hien_thi || !sheet_id) {
      return NextResponse.json(
        { success: false, error: 'Thiếu ten_hien_thi hoặc sheet_id' },
        { status: 400 }
      );
    }
    if (loai === 'list' && !sheet_tab) {
      return NextResponse.json(
        { success: false, error: 'Chế độ Danh sách cần chọn tab chứa bảng hàng' },
        { status: 400 }
      );
    }

    const created = await addStackingConfig({ ten_hien_thi, sheet_id, project_code, loai, sheet_tab, visible_columns });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking/configs POST]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, project_code, ten_hien_thi, sheet_id, sheet_tab, visible_columns } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Thiếu id' }, { status: 400 });
    }
    if (!project_code && !ten_hien_thi && !sheet_id && !sheet_tab && visible_columns === undefined) {
      return NextResponse.json({ success: false, error: 'Cần ít nhất project_code, ten_hien_thi, sheet_id, sheet_tab hoặc visible_columns' }, { status: 400 });
    }

    let cleanSheetId: string | undefined;
    let removedColumns: string[] | undefined;
    let autoVisibleColumns: string[] | undefined;

    // Đổi Google Sheet backing 1 nguồn đã đăng ký — PHẢI validate truy cập
    // được (+ đúng tab tồn tại nếu chế độ Danh sách) TRƯỚC KHI ghi bất kỳ gì
    // xuống config, KHÔNG tin client đã tự "Kiểm tra". Update CHÍNH config
    // này (cùng id) — không bao giờ tạo nguồn mới để giả lập đổi Sheet.
    if (typeof sheet_id === 'string' && sheet_id.trim()) {
      const configs = await getStackingConfigs();
      const current = configs.find(c => c.id === id);
      if (!current) {
        return NextResponse.json({ success: false, error: 'Không tìm thấy nguồn' }, { status: 404 });
      }

      const probe = await probeStackingSheet(sheet_id);
      if (!probe.ok) {
        return NextResponse.json({ success: false, error: probe.error }, { status: 400 });
      }
      cleanSheetId = extractSheetId(sheet_id);

      if (current.loai === 'list') {
        const effectiveTab = (typeof sheet_tab === 'string' && sheet_tab.trim() ? sheet_tab : current.sheet_tab || '').trim();
        if (!effectiveTab) {
          return NextResponse.json({ success: false, error: 'Sheet mới cần chọn tab chứa bảng hàng trước khi lưu' }, { status: 400 });
        }
        if (!probe.allTabs.includes(effectiveTab)) {
          return NextResponse.json({
            success: false,
            error: `Tab "${effectiveTab}" không tồn tại trong Sheet mới (file có ${probe.allTabs.length} tab: ${probe.allTabs.join(', ')}). Vui lòng chọn lại tab hợp lệ.`,
          }, { status: 400 });
        }

        // Cột hiển thị: nếu client đã tự gửi lựa chọn mới (đã đối chiếu ở bước
        // "Kiểm tra" phía UI) thì dùng đúng lựa chọn đó; nếu không, tự đối
        // chiếu ở đây (giữ cột cũ còn tồn tại trong Sheet mới, âm thầm bỏ cột
        // không còn) — không để trang bảng hàng crash vì cột đã đổi tên/xoá.
        const currentVisibleColumns = current.visible_columns ?? [];
        if (visible_columns === undefined && currentVisibleColumns.length > 0) {
          const newHeaders = await getStackingListColumns(cleanSheetId, effectiveTab);
          const { kept, removed } = reconcileVisibleColumns(currentVisibleColumns, newHeaders);
          autoVisibleColumns = kept;
          removedColumns = removed;
        }
      }
    }

    const ok = await updateStackingConfig(id, {
      project_code, ten_hien_thi, sheet_id, sheet_tab,
      visible_columns: visible_columns !== undefined ? visible_columns : autoVisibleColumns,
    });
    return NextResponse.json({ success: ok, sheet_id: cleanSheetId, removedColumns });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Thiếu id' }, { status: 400 });

    const ok = await deleteStackingConfig(id);
    return NextResponse.json({ success: ok });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API /stacking/configs DELETE]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
