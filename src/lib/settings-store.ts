// Generic key/value settings store — SETTINGS sheet tab (Google Sheets), tái
// dùng đúng cơ chế đã có trong /api/settings/logo (trước đây định nghĩa
// getJWT/getSettingsSheet riêng, trùng lặp). Đây là điểm dùng chung duy nhất
// cho mọi settings runtime nhỏ (key/value) — không phát minh feature-flag
// system mới, không thêm bảng Postgres cho một giá trị đơn lẻ.
//
// Root cause đã audit (GOOGLE_SHEETS_429_ROOT_CAUSE_PROVEN) — file này TRƯỚC
// ĐÂY tự dựng GoogleSpreadsheet + JWT + doc.loadInfo() RIÊNG (bỏ qua hoàn
// toàn cache 60s cachedDoc trong google-sheets.ts), dù dùng CHÍNH
// GOOGLE_SHEET_ID/credentials — mỗi 1 trong 4 consumer (crm-module,
// navigation-config, settings/logo, crm-access) gọi hàm ở đây đều tốn thêm 1
// loadInfo() thật KHÔNG CẦN THIẾT cho CÙNG 1 document đã có kết nối cache sẵn
// ở nơi khác. Dùng LẠI getDoc() (đã export riêng cho mục đích này) — loại bỏ
// hẳn việc tự dựng kết nối/JWT thứ 2, KHÔNG đổi bất kỳ giá trị/hành vi đọc-
// ghi SETTINGS nào (chỉ đổi CÁCH lấy được object `doc`).
import { getDoc } from './google-sheets';

const SETTINGS_SHEET = 'SETTINGS';

export async function getSettingsSheet() {
  const doc = await getDoc();

  let sheet = doc.sheetsByTitle[SETTINGS_SHEET];
  if (!sheet) {
    // Tạo sheet SETTINGS nếu chưa có
    sheet = await doc.addSheet({ title: SETTINGS_SHEET, headerValues: ['key', 'value'] });
  }
  await sheet.loadHeaderRow();
  return sheet;
}

export async function getSettingValue(key: string): Promise<string | null> {
  const sheet = await getSettingsSheet();
  const rows = await sheet.getRows();
  const row = rows.find(r => r.get('key') === key);
  return row ? (row.get('value') as string | null) : null;
}

export async function setSettingValue(key: string, value: string): Promise<void> {
  const sheet = await getSettingsSheet();
  const rows = await sheet.getRows();
  const existing = rows.find(r => r.get('key') === key);
  if (existing) {
    existing.set('value', value);
    await existing.save();
  } else {
    await sheet.addRow({ key, value });
  }
}
