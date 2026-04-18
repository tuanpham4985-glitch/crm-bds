/**
 * ============================================================
 * Google Apps Script — Avatar Sync cho CRM-BDS
 * ============================================================
 *
 * CÁCH CÀI ĐẶT:
 * 1. Mở Google Sheet CRM_BDS
 * 2. Vào menu: Extensions → Apps Script
 * 3. Tạo file mới (File → New → Script file) đặt tên: AvatarSync
 * 4. Dán toàn bộ code bên dưới vào
 * 5. Thay AVATAR_FOLDER_ID bằng ID folder Google Drive chứa ảnh avatar
 * 6. Nhấn Save (Ctrl+S)
 * 7. Reload Google Sheet → sẽ thấy menu "🖼️ Avatar" trên thanh menu
 *
 * CÁCH SỬ DỤNG:
 * - Menu "🖼️ Avatar" → "Sync Avatar" để tự động match & cập nhật
 * - Menu "🖼️ Avatar" → "Xem báo cáo" để xem kết quả match
 * - Menu "🖼️ Avatar" → "Xóa tất cả avatar_url" để reset
 *
 * AVATAR_MAPPING dùng file_id (không phải file_name) để tránh
 * xung đột khi có nhiều file trùng tên.
 * ============================================================
 */

// ⚠️ THAY BẰNG FOLDER ID CỦA BẠN
// Lấy từ URL: https://drive.google.com/drive/folders/XXXXX ← lấy phần XXXXX
const AVATAR_FOLDER_ID = 'YOUR_FOLDER_ID_HERE';

// Tên cột avatar_url trong sheet NHAN_VIEN (header chính xác)
const AVATAR_COL_HEADER = 'avatar_url';

// ============================================================
// MENU
// ============================================================

/**
 * Tạo custom menu khi mở Google Sheet
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🖼️ Avatar')
    .addItem('🔄 Sync Avatar', 'syncAvatars')
    .addItem('📊 Xem báo cáo', 'showSyncReport')
    .addItem('🔍 Quét nhân viên thiếu ảnh', 'scanMissingAvatars')
    .addSeparator()
    .addItem('📋 Tạo sheet AVATAR_MAPPING', 'createMappingSheet')
    .addItem('🗑️ Xóa tất cả avatar_url', 'clearAllAvatarUrls')
    .addToUi();
}

// ============================================================
// MAIN: SYNC AVATARS
// ============================================================

/**
 * Hàm chính: Sync avatar từ Google Drive folder → NHAN_VIEN sheet
 */
function syncAvatars() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();

  // 1. Validate folder ID
  if (AVATAR_FOLDER_ID === 'YOUR_FOLDER_ID_HERE') {
    ui.alert(
      '⚠️ Chưa cấu hình',
      'Bạn cần thay AVATAR_FOLDER_ID trong script bằng ID folder Google Drive chứa ảnh avatar.\n\n' +
      'Lấy từ URL: https://drive.google.com/drive/folders/XXXXX',
      ui.ButtonSet.OK
    );
    return;
  }

  // 2. Lấy folder
  let folder;
  try {
    folder = DriveApp.getFolderById(AVATAR_FOLDER_ID);
  } catch (e) {
    ui.alert('❌ Lỗi', 'Không tìm thấy folder: ' + AVATAR_FOLDER_ID + '\n\n' + e.message, ui.ButtonSet.OK);
    return;
  }

  // 3. Lấy sheet NHAN_VIEN
  const sheet = ss.getSheetByName('NHAN_VIEN');
  if (!sheet) {
    ui.alert('❌ Lỗi', 'Không tìm thấy sheet "NHAN_VIEN"', ui.ButtonSet.OK);
    return;
  }

  // 4. Tìm cột avatar_url
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const avatarColIndex = headers.indexOf(AVATAR_COL_HEADER);
  if (avatarColIndex === -1) {
    ui.alert(
      '❌ Lỗi',
      'Không tìm thấy cột "' + AVATAR_COL_HEADER + '" trong sheet NHAN_VIEN.\n' +
      'Headers hiện tại: ' + headers.join(', '),
      ui.ButtonSet.OK
    );
    return;
  }

  // 5. Đọc dữ liệu nhân viên
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    ui.alert('ℹ️ Thông báo', 'Sheet NHAN_VIEN không có dữ liệu.', ui.ButtonSet.OK);
    return;
  }

  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  // 6. Đọc tất cả file ảnh từ Google Drive folder
  const imageFiles = getImageFiles_(folder);
  Logger.log('📁 Tìm thấy ' + imageFiles.length + ' file ảnh trong folder "' + folder.getName() + '"');

  // 7. Đọc manual mapping (nếu có) — dùng file_id
  const manualMapping = getManualMapping_(ss);

  // 8. Tìm cột ho_ten (cột B = index 1)
  const nameColIndex = 1; // Cột B

  // 9. Match & cập nhật
  let matched = 0;
  let skipped = 0;
  let failed = 0;
  let sharingWarnings = 0;
  const report = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const idNhanVien = String(row[0] || '').trim();
    const hoTen = String(row[nameColIndex] || '').trim();
    const currentAvatar = String(row[avatarColIndex] || '').trim();

    if (!idNhanVien || !hoTen) continue;

    // Nếu đã có avatar_url → bỏ qua
    if (currentAvatar) {
      skipped++;
      report.push({ name: hoTen, status: '⏭️ Đã có avatar', url: currentAvatar });
      continue;
    }

    // Tìm file ảnh phù hợp
    const matchedFile = findMatchingFile_(hoTen, idNhanVien, imageFiles, manualMapping);

    if (matchedFile) {
      // Tạo public URL
      const result = makeFilePublic_(matchedFile);

      // Ghi vào sheet
      sheet.getRange(i + 2, avatarColIndex + 1).setValue(result.url);
      matched++;
      if (!result.sharingOk) sharingWarnings++;
      report.push({
        name: hoTen,
        status: '✅ Đã match' + (result.sharingOk ? '' : ' ⚠️sharing'),
        url: result.url,
        file: matchedFile.getName(),
        fileId: matchedFile.getId(),
      });
      Logger.log('✅ ' + hoTen + ' → ' + matchedFile.getName() + ' (id:' + matchedFile.getId() + ')');
    } else {
      failed++;
      report.push({ name: hoTen, status: '❌ Không tìm thấy ảnh', url: '', file: '', fileId: '' });
      Logger.log('❌ Không tìm thấy ảnh cho: ' + hoTen);
    }
  }

  // 10. Lưu report
  saveSyncReport_(ss, report);

  // 11. Hiển thị kết quả
  let msg =
    '✅ Đã match: ' + matched + ' nhân viên\n' +
    '⏭️ Đã có sẵn: ' + skipped + ' nhân viên\n' +
    '❌ Không match: ' + failed + ' nhân viên\n\n' +
    'Tổng file ảnh trong folder: ' + imageFiles.length + '\n';

  if (sharingWarnings > 0) {
    msg += '\n⚠️ ' + sharingWarnings + ' file không thể set public sharing.\n' +
      'Nhờ chủ folder bật "Anyone with the link can view" để avatar hiển thị trên CRM.\n';
  }

  if (failed > 0) {
    msg += '\n💡 Với ' + failed + ' nhân viên chưa match:\n' +
      '1. Vào menu 🖼️ Avatar → 📋 Tạo sheet AVATAR_MAPPING\n' +
      '2. Copy file_id từ cột tham khảo → điền vào cột file_id\n' +
      '3. Chạy lại Sync Avatar';
  }

  ui.alert('🖼️ Kết quả Sync Avatar', msg, ui.ButtonSet.OK);
}

// ============================================================
// MATCHING LOGIC
// ============================================================

/**
 * Tìm file ảnh phù hợp với nhân viên
 * Ưu tiên: Manual mapping (file_id) → Exact name → Normalized name → Partial match
 */
function findMatchingFile_(hoTen, idNhanVien, imageFiles, manualMapping) {
  // 1. Kiểm tra manual mapping trước (theo id_nhan_vien → file_id)
  if (manualMapping[idNhanVien]) {
    const mappedFileId = manualMapping[idNhanVien];
    const file = imageFiles.find(f => f.getId() === mappedFileId);
    if (file) return file;
  }

  // 2. Kiểm tra manual mapping theo tên (lowercase) → file_id
  const hoTenLower = hoTen.toLowerCase();
  if (manualMapping[hoTenLower]) {
    const mappedFileId = manualMapping[hoTenLower];
    const file = imageFiles.find(f => f.getId() === mappedFileId);
    if (file) return file;
  }

  // 3. Exact match (tên file = tên nhân viên, không dấu)
  const normalizedName = normalizeVietnamese_(hoTen);

  for (const file of imageFiles) {
    const fileName = getFileNameWithoutExt_(file.getName());
    const normalizedFileName = normalizeVietnamese_(fileName);

    if (normalizedFileName === normalizedName) return file;
  }

  // 4. Flexible match (bỏ khoảng trắng, dấu gạch, v.v.)
  const compactName = normalizedName.replace(/[\s\-_.]/g, '');

  for (const file of imageFiles) {
    const fileName = getFileNameWithoutExt_(file.getName());
    const compactFileName = normalizeVietnamese_(fileName).replace(/[\s\-_.]/g, '');

    if (compactFileName === compactName) return file;
  }

  // 5. Word-based partial match
  //    Tách tên thành từng từ, yêu cầu TẤT CẢ từ trong tên nhân viên
  //    phải khớp CHÍNH XÁC với một từ trong tên file (hoặc ngược lại).
  //    Tránh nhầm lẫn giữa "Ha" và "Hang", "Hoa" và "Hoan", v.v.
  const nameWords = normalizedName.split(/[\s\-_.]+/).filter(w => w.length > 0);

  for (const file of imageFiles) {
    const fileName = getFileNameWithoutExt_(file.getName());
    const fileWords = normalizeVietnamese_(fileName).split(/[\s\-_.]+/).filter(w => w.length > 0);

    // Bỏ qua nếu một trong hai không đủ từ
    if (nameWords.length < 2 || fileWords.length < 2) continue;

    // Kiểm tra tất cả từ của tên nhân viên đều xuất hiện chính xác trong tên file
    const allNameWordsInFile = nameWords.every(nw => fileWords.includes(nw));
    // Hoặc ngược lại: tất cả từ của tên file đều xuất hiện trong tên nhân viên
    const allFileWordsInName = fileWords.every(fw => nameWords.includes(fw));

    if (allNameWordsInFile || allFileWordsInName) {
      return file;
    }
  }

  return null;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Lấy tất cả file ảnh từ folder Google Drive
 */
function getImageFiles_(folder) {
  const files = [];
  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  const iterator = folder.getFiles();

  while (iterator.hasNext()) {
    const file = iterator.next();
    if (imageTypes.includes(file.getMimeType())) {
      files.push(file);
    }
  }

  return files;
}

/**
 * Tạo public URL cho file Google Drive
 * Thử set "Anyone with the link can view" → nếu không có quyền thì bỏ qua
 * Trả về { url, sharingOk }
 */
function makeFilePublic_(file) {
  const fileId = file.getId();
  let sharingOk = false;

  // Thử set sharing (có thể thất bại nếu file do người khác sở hữu)
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    sharingOk = true;
  } catch (e) {
    Logger.log(
      '⚠️ Không thể set sharing cho "' + file.getName() + '": ' + e.message + '\n' +
      '   → Nhờ chủ file bật "Anyone with the link".'
    );
  }

  // Nếu set sharing thất bại → kiểm tra file đã public chưa
  if (!sharingOk) {
    try {
      const access = file.getSharingAccess();
      if (access === DriveApp.Access.ANYONE || access === DriveApp.Access.ANYONE_WITH_LINK) {
        Logger.log('ℹ️ File "' + file.getName() + '" đã public sẵn → OK.');
        sharingOk = true;
      } else {
        Logger.log('⚠️ File "' + file.getName() + '" chưa public → avatar có thể không hiển thị.');
      }
    } catch (e) {
      // Ignore
    }
  }

  return {
    url: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400',
    sharingOk: sharingOk,
  };
}

/**
 * Bỏ extension khỏi tên file
 */
function getFileNameWithoutExt_(fileName) {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
}

/**
 * Chuẩn hóa tiếng Việt: bỏ dấu, lowercase, trim
 * "Phạm Quốc Tuấn" → "pham quoc tuan"
 */
function normalizeVietnamese_(str) {
  if (!str) return '';

  const map = {
    'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
    'đ': 'd',
    'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
    'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
  };

  let result = str.toLowerCase().trim();
  result = result.split('').map(c => map[c] || c).join('');
  result = result.replace(/[^a-z0-9\s\-_.]/g, '');

  return result;
}

/**
 * Đọc manual mapping từ sheet AVATAR_MAPPING
 * Cột: id_nhan_vien | ho_ten | file_id
 * Returns: { id_or_name: file_id }
 */
function getManualMapping_(ss) {
  const mapping = {};
  const sheet = ss.getSheetByName('AVATAR_MAPPING');

  if (!sheet) return mapping;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return mapping;

  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  for (const row of data) {
    const idNhanVien = String(row[0] || '').trim();
    const hoTen = String(row[1] || '').trim().toLowerCase();
    const fileId = String(row[2] || '').trim();

    if (!fileId) continue;

    if (idNhanVien) mapping[idNhanVien] = fileId;
    if (hoTen) mapping[hoTen] = fileId;
  }

  Logger.log('📋 Đọc ' + Object.keys(mapping).length + ' manual mapping từ AVATAR_MAPPING');
  return mapping;
}

// ============================================================
// AVATAR_MAPPING SHEET (dùng file_id)
// ============================================================

/**
 * Tạo sheet AVATAR_MAPPING với format sẵn
 * Cột: id_nhan_vien | ho_ten | file_id
 * Cột tham khảo: file_name | file_id (tất cả files trong folder)
 */
function createMappingSheet() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();

  // Kiểm tra đã tồn tại chưa
  let sheet = ss.getSheetByName('AVATAR_MAPPING');
  if (sheet) {
    ui.alert('ℹ️ Thông báo', 'Sheet "AVATAR_MAPPING" đã tồn tại.', ui.ButtonSet.OK);
    ss.setActiveSheet(sheet);
    return;
  }

  // Tạo sheet mới
  sheet = ss.insertSheet('AVATAR_MAPPING');

  // Headers chính
  const headers = ['id_nhan_vien', 'ho_ten', 'file_id'];
  sheet.getRange(1, 1, 1, 3).setValues([headers]);

  // Format header
  const headerRange = sheet.getRange(1, 1, 1, 3);
  headerRange.setBackground('#4285f4');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  // Set column widths
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 350);

  // Đọc nhân viên hiện tại và điền sẵn
  const nvSheet = ss.getSheetByName('NHAN_VIEN');
  if (nvSheet && nvSheet.getLastRow() > 1) {
    const nvHeaders = nvSheet.getRange(1, 1, 1, nvSheet.getLastColumn()).getValues()[0];
    const nvData = nvSheet.getRange(2, 1, nvSheet.getLastRow() - 1, nvHeaders.length).getValues();

    const mappingData = [];
    for (const row of nvData) {
      const id = String(row[0] || '').trim();
      const name = String(row[1] || '').trim();
      if (id && name) {
        mappingData.push([id, name, '']); // file_id để trống cho user điền
      }
    }

    if (mappingData.length > 0) {
      sheet.getRange(2, 1, mappingData.length, 3).setValues(mappingData);
    }
  }

  // Liệt kê files trong folder (cột E-F: file_name | file_id)
  if (AVATAR_FOLDER_ID !== 'YOUR_FOLDER_ID_HERE') {
    try {
      const folder = DriveApp.getFolderById(AVATAR_FOLDER_ID);
      const files = getImageFiles_(folder);

      if (files.length > 0) {
        // Header cột tham khảo
        sheet.getRange(1, 5).setValue('📁 file_name');
        sheet.getRange(1, 6).setValue('🔑 file_id (copy cột này)');
        sheet.getRange(1, 5, 1, 2).setBackground('#fbbc04').setFontWeight('bold');
        sheet.setColumnWidth(5, 250);
        sheet.setColumnWidth(6, 350);

        const fileData = files.map(f => [f.getName(), f.getId()]);
        sheet.getRange(2, 5, fileData.length, 2).setValues(fileData);
      }
    } catch (e) {
      Logger.log('⚠️ Không thể đọc folder: ' + e.message);
    }
  }

  // Hướng dẫn
  sheet.getRange(1, 8).setValue('💡 HƯỚNG DẪN');
  sheet.getRange(1, 8).setBackground('#34a853').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setColumnWidth(8, 450);
  sheet.getRange(2, 8).setValue('1. Xem cột E (file_name) để nhận biết ảnh nào của ai');
  sheet.getRange(3, 8).setValue('2. Copy file_id từ cột F → dán vào cột C (file_id) tương ứng');
  sheet.getRange(4, 8).setValue('3. Vào menu 🖼️ Avatar → 🔄 Sync Avatar');
  sheet.getRange(5, 8).setValue('⚠️ Dùng file_id (không phải file_name) để tránh trùng tên file');

  ss.setActiveSheet(sheet);
  ui.alert(
    '✅ Đã tạo sheet AVATAR_MAPPING',
    'Cách sử dụng:\n\n' +
    '1. Xem cột E để biết file ảnh nào trong folder\n' +
    '2. Copy file_id từ cột F → dán vào cột C cho nhân viên tương ứng\n' +
    '3. Vào menu 🖼️ Avatar → 🔄 Sync Avatar\n\n' +
    '💡 Dùng file_id thay vì file_name để tránh xung đột khi trùng tên.',
    ui.ButtonSet.OK
  );
}

// ============================================================
// REPORT
// ============================================================

/**
 * Lưu report vào PropertiesService
 */
function saveSyncReport_(ss, report) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('AVATAR_SYNC_REPORT', JSON.stringify({
    timestamp: new Date().toISOString(),
    report: report,
  }));
}

/**
 * Hiển thị báo cáo sync gần nhất
 */
function showSyncReport() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('AVATAR_SYNC_REPORT');

  if (!raw) {
    ui.alert('ℹ️ Thông báo', 'Chưa có báo cáo. Hãy chạy "Sync Avatar" trước.', ui.ButtonSet.OK);
    return;
  }

  const data = JSON.parse(raw);
  const report = data.report;

  let message = '🕐 Lần sync gần nhất: ' + data.timestamp + '\n\n';

  const matched = report.filter(r => r.status.includes('✅'));
  const existing = report.filter(r => r.status.includes('⏭️'));
  const failed = report.filter(r => r.status.includes('❌'));

  message += '✅ Đã match (' + matched.length + '):\n';
  matched.forEach(r => { message += '  • ' + r.name + ' → ' + (r.file || '') + '\n'; });

  message += '\n⏭️ Đã có sẵn (' + existing.length + '):\n';
  existing.forEach(r => { message += '  • ' + r.name + '\n'; });

  if (failed.length > 0) {
    message += '\n❌ Chưa match (' + failed.length + '):\n';
    failed.forEach(r => { message += '  • ' + r.name + '\n'; });
  }

  ui.alert('📊 Báo cáo Sync Avatar', message, ui.ButtonSet.OK);
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Xóa tất cả avatar_url → cho phép re-sync từ đầu
 */
function clearAllAvatarUrls() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ Xác nhận',
    'Bạn có chắc muốn xóa TẤT CẢ avatar_url trong sheet NHAN_VIEN?\n' +
    'Sau đó bạn có thể chạy lại "Sync Avatar" để re-sync.',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('NHAN_VIEN');
  if (!sheet) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const avatarColIndex = headers.indexOf(AVATAR_COL_HEADER);
  if (avatarColIndex === -1) return;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  sheet.getRange(2, avatarColIndex + 1, lastRow - 1, 1).clearContent();

  ui.alert('✅ Hoàn tất', 'Đã xóa tất cả avatar_url. Chạy lại "Sync Avatar" để re-sync.', ui.ButtonSet.OK);
}

/**
 * Hàm test: kiểm tra kết nối folder
 */
function testFolderConnection() {
  if (AVATAR_FOLDER_ID === 'YOUR_FOLDER_ID_HERE') {
    Logger.log('❌ Chưa cấu hình AVATAR_FOLDER_ID');
    return;
  }

  try {
    const folder = DriveApp.getFolderById(AVATAR_FOLDER_ID);
    Logger.log('✅ Kết nối folder thành công: "' + folder.getName() + '"');

    const files = getImageFiles_(folder);
    Logger.log('📁 Tìm thấy ' + files.length + ' file ảnh:');
    files.forEach(f => {
      Logger.log('  📸 ' + f.getName() + ' | id: ' + f.getId() + ' (' + f.getMimeType() + ')');
    });
  } catch (e) {
    Logger.log('❌ Lỗi: ' + e.message);
  }
}

/**
 * XUẤT DANH SÁCH NHÂN VIÊN CHƯA CÓ ẢNH
 */
function scanMissingAvatars() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('NHAN_VIEN');
  
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    ui.alert('ℹ️ Thông báo', 'Sheet NHAN_VIEN không có dữ liệu.', ui.ButtonSet.OK);
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const avatarColIndex = headers.indexOf(AVATAR_COL_HEADER);
  const nameColIndex = 1; // Cột B (ho_ten)
  const statusColIndex = 5; // Cột F (trang_thai) là index 5 (0-indexed)

  if (avatarColIndex === -1) return;

  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const missingAvatars = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const hoTen = String(row[nameColIndex] || '').trim();
    const avatar = String(row[avatarColIndex] || '').trim();
    const trangThai = String(row[statusColIndex] || '').trim();

    // Bỏ qua những dòng trống hoặc những người đã "Nghỉ việc"
    if (hoTen && !avatar && trangThai.toLowerCase() !== 'nghỉ việc') {
      missingAvatars.push(hoTen);
    }
  }

  if (missingAvatars.length === 0) {
    ui.alert('🎉 Tuyệt vời!', 'Tất cả nhân viên (đang làm việc) đều đã có ảnh đại diện.', ui.ButtonSet.OK);
  } else {
    const displayLimit = 20;
    let message = '🚨 Hiện có ' + missingAvatars.length + ' nhân viên ĐANG THIẾU ảnh đại diện:\n\n';
    
    for (let i = 0; i < Math.min(missingAvatars.length, displayLimit); i++) {
        message += (i + 1) + '. ' + missingAvatars[i] + '\n';
    }

    if (missingAvatars.length > displayLimit) {
        message += '\n... và ' + (missingAvatars.length - displayLimit) + ' người khác.';
    }

    message += '\n\n💡 Vui lòng yêu cầu các nhân viên này gửi ảnh, tải lên Drive và chạy lại Sync Avatar!';
    ui.alert('🔍 Báo cáo thiếu ảnh', message, ui.ButtonSet.OK);
  }
}

