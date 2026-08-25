import test from 'node:test';
import assert from 'node:assert/strict';
import { isCrmAdmin, customerDeleteBlockReason } from '../../src/lib/crm-auth';
import { planBulkDelete } from '../../src/lib/khach-hang-bulk-delete';
import { isAllVisibleSelected, toggleSelectAllVisible, toggleSelection } from '../../src/lib/khach-hang-selection';
import type { KhachHang, Pipeline } from '../../src/lib/types';

function customer(overrides: Partial<KhachHang> = {}): KhachHang {
  return {
    id_khach_hang: 'KH1', ngay_tao: '2026-01-01', ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0901234567',
    email: '', nguon: '', nhu_cau: '', ghi_chu: '', sale_phu_trach: '', label_khach: 'A - 0901234567',
    trang_thai_ban_giao: 'Chưa bàn giao', so_lan_lien_he: 0, lich_su_cham_soc: '[]', lich_su_ban_giao: '[]',
    ...overrides,
  };
}

test('Admin bulk delete: record hợp lệ -> status ready, đủ điều kiện xóa', () => {
  const admin = { id_nhan_vien: 'NV1', ho_ten: 'Admin A', email: 'a@x.com', vai_tro: 'Admin' };
  assert.equal(isCrmAdmin(admin), true);

  const c = customer({ id_khach_hang: 'KH_OK' });
  const { ids, items } = planBulkDelete(['KH_OK'], [c], []);
  assert.deepEqual(ids, ['KH_OK']);
  assert.deepEqual(items, [{ id: 'KH_OK', ten_KH: 'Nguyễn Văn A', status: 'ready' }]);
});

test('non-admin (Telesale/nhân viên thường) không đủ quyền bulk delete -> 403 tại authorization gate', () => {
  const telesale = { id_nhan_vien: 'NV2', ho_ten: 'Telesale B', email: 'b@x.com', vai_tro: 'Telesale', employee_type: 'Telesale' };
  assert.equal(isCrmAdmin(telesale), false); // route trả 403 khi isCrmAdmin(user) === false
});

test('Chủ tịch (senior leadership, không phải vai_tro Admin) vẫn được coi là đủ quyền bulk delete', () => {
  const chairman = { id_nhan_vien: 'NV3', ho_ten: 'Chủ tịch C', email: 'c@x.com', vai_tro: 'User', employee_type: 'Chủ tịch' };
  assert.equal(isCrmAdmin(chairman), true);
});

test('record có CRM history (đã liên hệ) bị giữ lại, không cho xóa', () => {
  const c = customer({ id_khach_hang: 'KH_HISTORY', so_lan_lien_he: 2 });
  const reason = customerDeleteBlockReason(c, []);
  assert.ok(reason);
  const { items } = planBulkDelete(['KH_HISTORY'], [c], []);
  assert.deepEqual(items, [{ id: 'KH_HISTORY', ten_KH: 'Nguyễn Văn A', status: 'blocked', reason }]);
});

test('record đã handoff (trang_thai_ban_giao khác Chưa bàn giao) bị giữ lại', () => {
  const c = customer({ id_khach_hang: 'KH_HANDOFF', trang_thai_ban_giao: 'Đã nhận' });
  const { items } = planBulkDelete(['KH_HANDOFF'], [c], []);
  assert.equal(items[0].status, 'blocked');
});

test('record có deal trong Pipeline bị giữ lại', () => {
  const c = customer({ id_khach_hang: 'KH_PIPELINE' });
  const pipelines = [{ id_khach_hang: 'KH_PIPELINE' } as Pipeline];
  const { items } = planBulkDelete(['KH_PIPELINE'], [c], pipelines);
  assert.equal(items[0].status, 'blocked');
});

test('mixed batch: record hợp lệ được đánh dấu xóa, record protected được giữ lại, báo cáo đúng từng record', () => {
  const customers = [
    customer({ id_khach_hang: 'KH_OK', ten_KH: 'Khách sạch' }),
    customer({ id_khach_hang: 'KH_PROTECTED', ten_KH: 'Khách có lịch sử', so_lan_lien_he: 3 }),
  ];
  const { ids, items } = planBulkDelete(['KH_OK', 'KH_PROTECTED', 'KH_KHONG_TON_TAI'], customers, []);
  assert.deepEqual(ids, ['KH_OK', 'KH_PROTECTED', 'KH_KHONG_TON_TAI']);
  assert.equal(items.find(i => i.id === 'KH_OK')?.status, 'ready');
  assert.equal(items.find(i => i.id === 'KH_PROTECTED')?.status, 'blocked');
  assert.equal(items.find(i => i.id === 'KH_KHONG_TON_TAI')?.status, 'not_found');
});

test('empty selection hoặc toàn id không hợp lệ -> không có gì để xóa (không phải mass deletion)', () => {
  const customers = [customer({ id_khach_hang: 'KH_OK' })];
  assert.deepEqual(planBulkDelete([], customers, []), { ids: [], items: [] });
  assert.deepEqual(planBulkDelete(undefined, customers, []), { ids: [], items: [] });
  assert.deepEqual(planBulkDelete(null, customers, []), { ids: [], items: [] });
  assert.deepEqual(planBulkDelete('KH_OK', customers, []), { ids: [], items: [] }); // không phải mảng -> bỏ qua, không suy diễn
  assert.deepEqual(planBulkDelete([123, null, '', '   '], customers, []), { ids: [], items: [] }); // lọc hết id không hợp lệ
});

test('planBulkDelete không tự "xóa tất cả" — chỉ xử lý đúng id client gửi, id trùng lặp chỉ tính 1 lần', () => {
  const customers = [customer({ id_khach_hang: 'KH_OK' }), customer({ id_khach_hang: 'KH_OTHER', ten_KH: 'Khách khác' })];
  const { ids, items } = planBulkDelete(['KH_OK', 'KH_OK', 'KH_OK'], customers, []);
  assert.deepEqual(ids, ['KH_OK']); // dedupe
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'KH_OK');
  // KH_OTHER tồn tại trong DB nhưng không được chọn -> không xuất hiện trong kế hoạch xóa
  assert.equal(items.some(i => i.id === 'KH_OTHER'), false);
});

test('UI: chọn từng dòng (toggleSelection) hoạt động đúng cả 2 chiều', () => {
  let selected = new Set<string>();
  selected = toggleSelection(selected, 'A');
  assert.deepEqual([...selected], ['A']);
  selected = toggleSelection(selected, 'B');
  assert.deepEqual([...selected].sort(), ['A', 'B']);
  selected = toggleSelection(selected, 'A');
  assert.deepEqual([...selected], ['B']);
});

test('UI: chọn tất cả header chỉ áp dụng cho danh sách đang hiển thị (trang hiện tại)', () => {
  const visibleIds = ['A', 'B', 'C'];
  let selected = new Set<string>(['Z']); // đã chọn 1 khách ở trang khác trước đó
  assert.equal(isAllVisibleSelected(selected, visibleIds), false);

  selected = toggleSelectAllVisible(selected, visibleIds);
  assert.deepEqual([...selected].sort(), ['A', 'B', 'C', 'Z']);
  assert.equal(isAllVisibleSelected(selected, visibleIds), true);

  // Bấm lại -> bỏ chọn đúng các dòng đang hiển thị, giữ nguyên lựa chọn ở trang khác (Z)
  selected = toggleSelectAllVisible(selected, visibleIds);
  assert.deepEqual([...selected], ['Z']);
  assert.equal(isAllVisibleSelected(selected, visibleIds), false);
});

test('UI: header checkbox không "chọn tất cả" khi danh sách hiển thị rỗng', () => {
  assert.equal(isAllVisibleSelected(new Set(), []), false);
});
