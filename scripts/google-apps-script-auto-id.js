/**
 * ============================================================
 * Google Apps Script — Auto-generate ID cho CRM-BDS
 * ============================================================
 * 
 * CÁCH CÀI ĐẶT:
 * 1. Mở Google Sheet CRM_BDS
 * 2. Vào menu: Extensions (Tiện ích mở rộng) → Apps Script
 * 3. Xóa hết code mặc định, dán toàn bộ code bên dưới vào
 * 4. Nhấn Save (Ctrl+S)
 * 5. Chạy hàm `setupTriggers()` một lần (chọn hàm → nhấn Run)
 * 6. Cấp quyền khi được hỏi
 * 
 * LƯU Ý: Nếu dùng cùng Avatar Sync script, hãy tạo 2 file
 * riêng trong Apps Script editor (File → New → Script file)
 * Đặt tên: AutoId và AvatarSync
 * 
 * HỖ TRỢ:
 * - Nhập thủ công từng dòng  ✅
 * - Paste nhiều dòng cùng lúc ✅
 * - Import / nhập hàng loạt    ✅
 * ============================================================
 */

/**
 * Chạy hàm này MỘT LẦN để cài đặt tất cả triggers.
 * Sẽ tạo 2 triggers:
 *   1. onEdit  → bắt input thủ công + paste nhỏ
 *   2. onChange → bắt paste lớn, import, undo/redo
 */
function setupTriggers() {
  // Xóa tất cả trigger cũ liên quan
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'onEditAutoId' || fn === 'onChangeAutoId' || fn === 'createTrigger') {
      ScriptApp.deleteTrigger(t);
    }
  });

  const ss = SpreadsheetApp.getActive();

  // Trigger 1: onEdit — bắt chỉnh sửa trực tiếp + paste nhỏ
  ScriptApp.newTrigger('onEditAutoId')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // Trigger 2: onChange — bắt paste lớn, import, các thay đổi cấu trúc
  ScriptApp.newTrigger('onChangeAutoId')
    .forSpreadsheet(ss)
    .onChange()
    .create();

  Logger.log('✅ Đã cài đặt 2 triggers: onEdit + onChange');
  Logger.log('   → onEditAutoId:  xử lý edit & paste vùng cụ thể');
  Logger.log('   → onChangeAutoId: xử lý paste lớn & import');
}

// Legacy alias — giữ cho tương thích
function createTrigger() {
  setupTriggers();
}

/**
 * Map tên sheet → prefix ID và cột ID (cột A = 1)
 */
const SHEET_CONFIG = {
  'NHAN_VIEN':  { prefix: 'NV',  idCol: 1 },
  'KHACH_HANG': { prefix: 'KH',  idCol: 1 },
  'PIPELINE':   { prefix: 'PL',  idCol: 1 },
  'CONG_VIEC':  { prefix: 'CV',  idCol: 1 },
  'DU_AN':      { prefix: 'DA_', idCol: 1 },
};

// ============================================================
// TRIGGER HANDLERS
// ============================================================

/**
 * onEdit trigger — fires when user edits cells directly or pastes.
 * Attempts range-based detection first, falls back to full scan.
 */
function onEditAutoId(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const config = SHEET_CONFIG[sheetName];
  if (!config) return;

  // Use a lock to prevent concurrent ID generation (onEdit + onChange racing)
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // Wait up to 5s

  try {
    const startRow = e.range.getRow();
    const endRow = e.range.getLastRow();

    // Skip header
    if (endRow <= 1) return;

    const effectiveStart = Math.max(startRow, 2);

    // Try range-based fill first (fast path)
    const count = fillMissingIdsInRange_(sheet, config, effectiveStart, endRow);

    // If paste might have landed outside the detected range,
    // do a full scan as safety net
    if (count === 0) {
      fillMissingIds_(sheet, config);
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * onChange trigger — fires on paste, import, structure changes.
 * Always does a full-sheet scan since we don't have precise range info.
 */
function onChangeAutoId(e) {
  if (!e) return;

  // Only process EDIT and INSERT_ROW change types
  // (EDIT covers paste; INSERT_ROW covers inserted rows)
  if (e.changeType !== 'EDIT' && e.changeType !== 'INSERT_ROW') return;

  const ss = SpreadsheetApp.getActive();
  const activeSheet = ss.getActiveSheet();
  const sheetName = activeSheet.getName();
  const config = SHEET_CONFIG[sheetName];
  if (!config) return;

  // Use a lock to prevent concurrent ID generation
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  try {
    fillMissingIds_(activeSheet, config);
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// CORE: BATCH ID GENERATION
// ============================================================

/**
 * Fill missing IDs for a specific row range (fast path for onEdit).
 * Uses batch read/write — a single getValues() + setValues() call.
 * Returns number of IDs generated.
 */
function fillMissingIdsInRange_(sheet, config, startRow, endRow) {
  const numRows = endRow - startRow + 1;
  if (numRows <= 0) return 0;

  const nameCol = config.idCol + 1; // Column B (name/data column)
  const numCols = Math.max(config.idCol, nameCol);

  // Batch read: get cols A-B for the entire range in ONE call
  const range = sheet.getRange(startRow, 1, numRows, numCols);
  const values = range.getValues();

  // Find the next available ID number
  const nextNum = getNextIdNumber_(sheet, config);

  // Identify rows needing IDs
  const updates = [];
  let counter = 0;

  for (let i = 0; i < values.length; i++) {
    const idValue = String(values[i][config.idCol - 1] || '').trim();
    const nameValue = String(values[i][nameCol - 1] || '').trim();

    // Skip if already has ID or no data in name column
    if (idValue !== '' || nameValue === '') continue;

    // Generate new ID: PREFIX + zero-padded number
    const newId = config.prefix + String(nextNum + counter).padStart(5, '0');
    values[i][config.idCol - 1] = newId;
    counter++;
  }

  if (counter === 0) return 0;

  // Batch write: write ALL changes in ONE call
  range.setValues(values);

  Logger.log('✅ [Range] Auto-generated ' + counter + ' IDs in ' + sheet.getName() +
    ' (rows ' + startRow + '-' + endRow + ')');

  return counter;
}

/**
 * Full-sheet scan: fill ALL missing IDs in the entire sheet.
 * Used as fallback for onChange and when range-based detection misses rows.
 * Uses batch read/write for performance.
 */
function fillMissingIds_(sheet, config) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const nameCol = config.idCol + 1;
  const numCols = Math.max(config.idCol, nameCol);
  const numRows = lastRow - 1; // Exclude header

  // Batch read: entire data range in ONE call
  const range = sheet.getRange(2, 1, numRows, numCols);
  const values = range.getValues();

  // Find the next available ID number
  const nextNum = getNextIdNumber_(sheet, config);

  let counter = 0;

  for (let i = 0; i < values.length; i++) {
    const idValue = String(values[i][config.idCol - 1] || '').trim();
    const nameValue = String(values[i][nameCol - 1] || '').trim();

    if (idValue !== '' || nameValue === '') continue;

    const newId = config.prefix + String(nextNum + counter).padStart(5, '0');
    values[i][config.idCol - 1] = newId;
    counter++;
  }

  if (counter === 0) return 0;

  // Batch write: ONE call for all updates
  range.setValues(values);

  Logger.log('✅ [FullScan] Auto-generated ' + counter + ' IDs in ' + sheet.getName());

  return counter;
}

/**
 * Get the next available ID number by scanning existing IDs.
 * Finds the highest existing number and returns highest + 1.
 * This ensures no duplicates even if rows are deleted/reordered.
 */
function getNextIdNumber_(sheet, config) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;

  // Read all existing IDs in ONE call
  const idValues = sheet.getRange(2, config.idCol, lastRow - 1, 1).getValues();
  const prefix = config.prefix;

  let maxNum = 0;

  for (let i = 0; i < idValues.length; i++) {
    const id = String(idValues[i][0] || '').trim();
    if (!id.startsWith(prefix)) continue;

    const numPart = id.substring(prefix.length);
    const num = parseInt(numPart, 10);

    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }

  return maxNum + 1;
}

// ============================================================
// BACKFILL: Manual run for existing data
// ============================================================

/**
 * Hàm backfill: Tạo ID cho TẤT CẢ row đang thiếu ID.
 * Chạy thủ công khi cần (chọn hàm này → Run).
 * Sử dụng batch operations — nhanh hơn version cũ ~100x.
 */
function backfillAllMissingIds() {
  const ss = SpreadsheetApp.getActive();

  Object.keys(SHEET_CONFIG).forEach(sheetName => {
    const config = SHEET_CONFIG[sheetName];
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('⏩ Sheet "' + sheetName + '" not found, skipping');
      return;
    }

    const count = fillMissingIds_(sheet, config);
    Logger.log('✅ ' + sheetName + ': Generated ' + count + ' missing IDs');
  });

  Logger.log('\n🎉 Backfill hoàn tất!');
}
