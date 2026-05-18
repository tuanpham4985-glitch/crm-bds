// ==========================================
// CẤU HÌNH API & DATABASE
// ==========================================
const CONFIG = {
  TOKEN: "CRM_BDS_SECURE_TOKEN_2026", // Token bảo mật kết nối với Next.js
  
  // ID file Google Sheet nguồn "TỔNG HỢP BÁO CÁO BÁN HÀNG - VICTORY"
  // Vui lòng điền ID thực tế của file Victory vào đây
  SOURCE_SPREADSHEET_ID: "YOUR_VICTORY_SOURCE_SPREADSHEET_ID_HERE", 
  SOURCE_SHEET_NAME: "Tổng hợp giao dịch chi tiết",
  
  // Tên sheet database đích nằm trong file CRM_BDS này
  TARGET_SHEET_NAME: "Transactions_DB"
};

// Hàm kiểm tra xác thực token
function checkAuth(token) {
  return token === CONFIG.TOKEN;
}

// ==========================================
// XỬ LÝ GET REQUEST (ĐỌC DỮ LIỆU)
// ==========================================
function doGet(e) {
  if (!e || !e.parameter) {
    return createJsonResponse({ error: "Invalid request" }, 400);
  }

  const token = e.parameter.token;
  if (!checkAuth(token)) {
    return createJsonResponse({ error: "Unauthorized" }, 401);
  }

  const action = e.parameter.action;

  try {
    let result = [];
    switch (action) {
      case 'getEmployees':
        result = getSheetData('Employees');
        break;
      case 'getAttendance':
        result = getSheetData('Attendance');
        break;
      case 'getPayroll':
        result = getSheetData('Payroll');
        break;
      case 'getSettings':
        result = getSheetData('Settings');
        break;
        
      // Đọc các giao dịch đã đồng bộ và chuẩn hóa từ CRM_BDS database cục bộ (rất nhanh và scale tốt)
      case 'getTransactions':
        result = getSheetData(CONFIG.TARGET_SHEET_NAME);
        break;
        
      default:
        return createJsonResponse({ error: "Invalid action" }, 400);
    }
    
    return createJsonResponse({ success: true, data: result });
  } catch (error) {
    return createJsonResponse({ error: error.message }, 500);
  }
}

// ==========================================
// XỬ LÝ POST REQUEST (GHI/SỬA/XOÁ & ĐỒNG BỘ)
// ==========================================
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return createJsonResponse({ error: "No data provided" }, 400);
  }
  
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch(err) {
    return createJsonResponse({ error: "Invalid JSON format" }, 400);
  }

  const token = request.token;
  if (!checkAuth(token)) {
    return createJsonResponse({ error: "Unauthorized" }, 401);
  }

  const action = request.action;
  const data = request.data;

  try {
    let result = null;
    switch (action) {
      // TRIGGER ĐỒNG BỘ THỦ CÔNG TỪ FILE NGUỒN VICTORY SANG DATABASE CRM_BDS
      case 'syncTransactions':
        result = syncSourceToCRM();
        break;

      // EMPLOYEES CRUD
      case 'createEmployee':
        result = appendRow('Employees', data);
        break;
      case 'updateEmployee':
        result = updateRow('Employees', data.idColumn, data.idValue, data.updateData);
        break;
      case 'deleteEmployee':
        result = deleteRow('Employees', data.idColumn, data.idValue);
        break;
      
      // ATTENDANCE CRUD
      case 'createAttendance':
        result = appendRow('Attendance', data);
        break;
      case 'updateAttendance':
        result = updateRow('Attendance', data.idColumn, data.idValue, data.updateData);
        break;
        
      // PAYROLL CRUD
      case 'createPayroll':
        result = appendRow('Payroll', data);
        break;
      case 'updatePayroll':
        result = updateRow('Payroll', data.idColumn, data.idValue, data.updateData);
        break;

      default:
        return createJsonResponse({ error: "Invalid action" }, 400);
    }
    
    return createJsonResponse({ success: true, data: result });
  } catch (error) {
    return createJsonResponse({ error: error.message }, 500);
  }
}

// ==========================================
// CORE LOGIC: ĐỒNG BỘ & CHUẨN HOÁ DỮ LIỆU
// ==========================================
function syncSourceToCRM() {
  if (CONFIG.SOURCE_SPREADSHEET_ID === "YOUR_VICTORY_SOURCE_SPREADSHEET_ID_HERE" || !CONFIG.SOURCE_SPREADSHEET_ID) {
    throw new Error("Vui lòng cấu hình SOURCE_SPREADSHEET_ID thực tế của file Victory trong Apps Script.");
  }
  
  // 1. Mở file nguồn Victory và lấy dữ liệu
  const sourceSpreadsheet = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID);
  const sourceSheet = sourceSpreadsheet.getSheetByName(CONFIG.SOURCE_SHEET_NAME);
  if (!sourceSheet) throw new Error(`Không tìm thấy sheet nguồn '${CONFIG.SOURCE_SHEET_NAME}'`);
  
  const sourceData = sourceSheet.getDataRange().getValues();
  if (sourceData.length <= 1) return { message: "Sheet nguồn rỗng hoặc chỉ có dòng tiêu đề." };
  
  const sourceHeaders = sourceData[0].map(h => String(h).trim());
  
  // 2. Chuẩn bị file đích CRM_BDS database
  const targetSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let targetSheet = targetSpreadsheet.getSheetByName(CONFIG.TARGET_SHEET_NAME);
  
  const headers = [
    "transaction_id", "Mã căn", "Dự án", "Sale bán", "Giá tính HH", "% Tỷ lệ HH", 
    "Tổng Phí HHMG", "Tổng Phí HHMG Có VAT", "Thưởng nóng", "GDDA", "GDKD", "Phòng KD",
    "calculated_TyLeHoaHong", "calculated_TongCommission", "calculated_TongPhiTraSale", 
    "calculated_TongPhiTraKhach", "last_synced"
  ];
  
  // Tự động khởi tạo sheet đích nếu chưa tồn tại
  if (!targetSheet) {
    targetSheet = targetSpreadsheet.insertSheet(CONFIG.TARGET_SHEET_NAME);
    targetSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    // Freeze dòng đầu tiên
    targetSheet.setFrozenRows(1);
  }
  
  const targetDataRange = targetSheet.getDataRange();
  const targetData = targetDataRange.getValues();
  const targetHeaders = targetData[0].map(h => String(h).trim());
  
  const txnIdColIndex = targetHeaders.indexOf("transaction_id");
  
  // Tạo map tra cứu dòng đích hiện có theo transaction_id để cập nhật (O(N) thay vì O(N^2))
  const targetMap = {};
  for (let i = 1; i < targetData.length; i++) {
    const txnId = targetData[i][txnIdColIndex];
    if (txnId) {
      targetMap[txnId] = i + 1; // Lưu chỉ số dòng (1-based)
    }
  }
  
  let insertCount = 0;
  let updateCount = 0;
  const now = new Date();
  
  // 3. Tiến hành đồng bộ và chuẩn hoá từng dòng
  for (let i = 1; i < sourceData.length; i++) {
    const sourceRow = sourceData[i];
    
    // Loại bỏ các dòng hoàn toàn rỗng
    if (sourceRow.join("").trim() === "") continue;
    
    // Map dòng hiện tại thành Object dựa trên headers nguồn
    const rowObj = {};
    for (let j = 0; j < sourceHeaders.length; j++) {
      if (sourceHeaders[j]) {
        rowObj[sourceHeaders[j]] = sourceRow[j];
      }
    }
    
    const maCan = String(rowObj["Mã căn"] || "").trim();
    const duAn = String(rowObj["Dự án"] || "").trim();
    const saleBan = String(rowObj["Sale bán"] || "").trim();
    
    // Loại bỏ dòng rỗng/thiếu thông tin định danh cốt lõi
    if (!maCan || !duAn || !saleBan) continue;
    
    // Tạo mã định danh duy nhất ổn định (Idempotent Transaction ID)
    const signature = maCan + "_" + duAn + "_" + saleBan;
    const txnId = generateTxnId(signature);
    
    // --- CHUẨN HOÁ VÀ TÍNH TOÁN DỮ LIỆU ---
    
    // 1. Chuẩn hoá Tỷ lệ hoa hồng (%)
    let commissionRate = 0;
    const rateRaw = rowObj["% Tỷ lệ HH"];
    if (rateRaw !== undefined && rateRaw !== "") {
      if (typeof rateRaw === 'number') {
        commissionRate = rateRaw;
      } else {
        commissionRate = parseFloat(String(rateRaw).replace('%', '').replace(',', '.')) / 100;
        if (isNaN(commissionRate)) commissionRate = 0;
      }
    }
    
    // 2. Chuẩn hoá và tính toán Tổng Commission nhận được
    let totalCommission = 0;
    const feeVat = rowObj["Tổng Phí HHMG Có VAT"];
    const feeNoVat = rowObj["Tổng Phí HHMG"];
    if (typeof feeVat === 'number' && feeVat > 0) {
      totalCommission = feeVat;
    } else if (typeof feeNoVat === 'number' && feeNoVat > 0) {
      totalCommission = feeNoVat;
    } else {
      totalCommission = parseFloat(String(feeVat || feeNoVat || 0).replace(/[^0-9.-]+/g, ""));
      if (isNaN(totalCommission)) totalCommission = 0;
    }
    
    // 3. Chuẩn hoá Thưởng nóng
    let thuongNong = typeof rowObj["Thưởng nóng"] === 'number' ? rowObj["Thưởng nóng"] : 
                     parseFloat(String(rowObj["Thưởng nóng"] || 0).replace(/[^0-9.-]+/g, "")) || 0;
                     
    // 4. Tính toán phí trả cho Sale
    let tongPhiTraSale = (totalCommission * commissionRate) + thuongNong;
    
    // 5. Tính toán phí trả cho Khách (nếu có công thức chiết khấu riêng)
    let tongPhiTraKhach = 0; 
    
    // Tạo đối tượng ghi xuống CRM_BDS
    const writeObj = {
      "transaction_id": txnId,
      "Mã căn": maCan,
      "Dự án": duAn,
      "Sale bán": saleBan,
      "Giá tính HH": typeof rowObj["Giá tính HH"] === 'number' ? rowObj["Giá tính HH"] : (parseFloat(String(rowObj["Giá tính HH"] || 0).replace(/[^0-9.-]+/g, "")) || 0),
      "% Tỷ lệ HH": rowObj["% Tỷ lệ HH"] || "",
      "Tổng Phí HHMG": typeof rowObj["Tổng Phí HHMG"] === 'number' ? rowObj["Tổng Phí HHMG"] : (parseFloat(String(rowObj["Tổng Phí HHMG"] || 0).replace(/[^0-9.-]+/g, "")) || 0),
      "Tổng Phí HHMG Có VAT": typeof rowObj["Tổng Phí HHMG Có VAT"] === 'number' ? rowObj["Tổng Phí HHMG Có VAT"] : (parseFloat(String(rowObj["Tổng Phí HHMG Có VAT"] || 0).replace(/[^0-9.-]+/g, "")) || 0),
      "Thưởng nóng": thuongNong,
      "GDDA": String(rowObj["GDDA"] || "").trim(),
      "GDKD": String(rowObj["GDKD"] || "").trim(),
      "Phòng KD": String(rowObj["Phòng KD"] || "").trim(),
      "calculated_TyLeHoaHong": commissionRate,
      "calculated_TongCommission": totalCommission,
      "calculated_TongPhiTraSale": tongPhiTraSale,
      "calculated_TongPhiTraKhach": tongPhiTraKhach,
      "last_synced": now
    };
    
    const rowValues = targetHeaders.map(header => writeObj[header] !== undefined ? writeObj[header] : "");
    const existingRowIndex = targetMap[txnId];
    
    if (existingRowIndex) {
      // Upsert: Cập nhật dòng đã tồn tại nếu có thay đổi
      targetSheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      updateCount++;
    } else {
      // Upsert: Thêm mới dòng nếu chưa tồn tại
      targetSheet.appendRow(rowValues);
      insertCount++;
    }
  }
  
  return { 
    message: "Đồng bộ dữ liệu thành công!", 
    inserted: insertCount, 
    updated: updateCount,
    timestamp: now.toISOString()
  };
}

// Thuật toán tạo ID duy nhất ổn định từ Signature
function generateTxnId(signature) {
  let hash = 0;
  for (let i = 0; i < signature.length; i++) {
    const char = signature.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert thành 32bit integer
  }
  // Convert sang dạng ký tự Base36 viết hoa sang định dạng: TXN-XXXX
  return "TXN-" + Math.abs(hash).toString(36).toUpperCase();
}

// ==========================================
// CÁC HÀM TIỆN ÍCH TƯƠNG TÁC GOOGLE SHEET
// ==========================================

// Trả về JSON Response
function createJsonResponse(data, statusCode = 200) {
  data.statusCode = statusCode;
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lấy toàn bộ dữ liệu từ một sheet dưới dạng mảng JSON Objects
function getSheetData(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Không tìm thấy sheet '${sheetName}' trong database.`);
  
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  
  const headers = data[0];
  const result = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]).trim() === '') continue; 

    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        obj[headers[j]] = row[j];
      }
    }
    result.push(obj);
  }
  
  return result;
}

// Thêm một dòng mới vào cuối sheet
function appendRow(sheetName, rowDataObj) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Không tìm thấy sheet '${sheetName}'`);
  
  const dataRange = sheet.getDataRange();
  const headers = dataRange.getValues()[0];
  const rowArray = [];
  
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    rowArray.push(rowDataObj[header] !== undefined ? rowDataObj[header] : '');
  }
  
  sheet.appendRow(rowArray);
  return { message: "Tạo thành công!" };
}

// Cập nhật một dòng dựa vào Cột ID và Giá trị ID
function updateRow(sheetName, idColumnName, idValue, updateDataObj) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Không tìm thấy sheet '${sheetName}'`);
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) throw new Error("Database rỗng");
  
  const headers = data[0];
  const idColIndex = headers.indexOf(idColumnName);
  if (idColIndex === -1) throw new Error(`Không tìm thấy cột ID '${idColumnName}'`);
  
  let rowIndexToUpdate = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idColIndex]) === String(idValue)) {
      rowIndexToUpdate = i + 1;
      break;
    }
  }
  
  if (rowIndexToUpdate === -1) throw new Error(`Không tìm thấy dữ liệu có ID '${idValue}'`);
  
  for (const key in updateDataObj) {
    const colIndex = headers.indexOf(key);
    if (colIndex !== -1) {
      sheet.getRange(rowIndexToUpdate, colIndex + 1).setValue(updateDataObj[key]);
    }
  }
  
  return { message: "Cập nhật thành công!" };
}

// Xóa một dòng dựa vào Cột ID và Giá trị ID
function deleteRow(sheetName, idColumnName, idValue) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Không tìm thấy sheet '${sheetName}'`);
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) throw new Error("Database rỗng");
  
  const headers = data[0];
  const idColIndex = headers.indexOf(idColumnName);
  if (idColIndex === -1) throw new Error(`Không tìm thấy cột ID '${idColumnName}'`);
  
  let rowIndexToDelete = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idColIndex]) === String(idValue)) {
      rowIndexToDelete = i + 1;
      break;
    }
  }
  
  if (rowIndexToDelete === -1) throw new Error(`Không tìm thấy dữ liệu có ID '${idValue}'`);
  
  sheet.deleteRow(rowIndexToDelete);
  return { message: "Xóa thành công!" };
}
