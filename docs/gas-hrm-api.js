// CẤU HÌNH API TOKEN
const CONFIG = {
  TOKEN: "CRM_BDS_SECURE_TOKEN_2026", // Thay đổi token này và copy vào biến môi trường của Next.js
};

// Hàm kiểm tra xác thực
function checkAuth(token) {
  return token === CONFIG.TOKEN;
}

// ==========================================
// XỬ LÝ GET REQUEST (ĐỌC DỮ LIỆU)
// ==========================================
function doGet(e) {
  // Fix CORS cho phép web app gọi API
  const headers = { "Access-Control-Allow-Origin": "*" };
  
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
      case 'getTransactions':
        result = getTransactionsData('Tổng hợp giao dịch chi tiết');
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
// XỬ LÝ POST REQUEST (GHI/SỬA/XOÁ DỮ LIỆU)
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
// CÁC HÀM TIỆN ÍCH TƯƠNG TÁC GOOGLE SHEET
// ==========================================

// Trả về JSON Response
function createJsonResponse(data, statusCode = 200) {
  // Apps Script không hỗ trợ HTTP status code trực tiếp cho Web App, 
  // nhưng ta có thể trả về một đối tượng JSON chuẩn để front-end tự parse
  data.statusCode = statusCode;
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lấy toàn bộ dữ liệu từ một sheet dưới dạng mảng JSON Objects
function getSheetData(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet '${sheetName}' not found`);
  
  const data = sheet.getDataRange().getValues(); // Lấy giá trị raw (bao gồm Date objects)
  if (data.length === 0) return [];
  
  const headers = data[0];
  const result = [];
  
  // Skip header (i=1)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Skip empty rows (kiểm tra cột đầu tiên)
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

// Lấy dữ liệu và tính toán tự động cho sheet "Tổng hợp giao dịch chi tiết"
function getTransactionsData(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet '${sheetName}' not found`);
  
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  
  const headers = data[0];
  const result = [];
  
  // Các cột bắt buộc cần trích xuất theo yêu cầu
  const requiredFields = [
    "Mã căn", "Dự án", "Sale bán", "Giá tính HH", "% Tỷ lệ HH", 
    "Tổng Phí HHMG", "Tổng Phí HHMG Có VAT", "Thưởng nóng", 
    "GDDA", "GDKD", "Phòng KD"
  ];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]).trim() === '') continue; 

    const obj = {};
    // 1. Trích xuất các trường được yêu cầu
    for (let j = 0; j < headers.length; j++) {
      if (headers[j] && requiredFields.includes(headers[j])) {
        obj[headers[j]] = row[j];
      }
    }
    
    // 2. Tự động tính toán
    // - Tỷ lệ hoa hồng (từ string/number sang float)
    let commissionRate = 0;
    const rateRaw = obj["% Tỷ lệ HH"];
    if (rateRaw !== undefined && rateRaw !== "") {
      if (typeof rateRaw === 'number') {
        commissionRate = rateRaw;
      } else {
        commissionRate = parseFloat(String(rateRaw).replace('%', '').replace(',', '.')) / 100;
        if (isNaN(commissionRate)) commissionRate = 0;
      }
    }
    
    // - Tổng commission theo từng giao dịch
    let totalCommission = 0;
    const feeVat = obj["Tổng Phí HHMG Có VAT"];
    const feeNoVat = obj["Tổng Phí HHMG"];
    
    if (typeof feeVat === 'number' && feeVat > 0) {
      totalCommission = feeVat;
    } else if (typeof feeNoVat === 'number' && feeNoVat > 0) {
      totalCommission = feeNoVat;
    } else {
      // Fallback parse từ string
      totalCommission = parseFloat(String(feeVat || feeNoVat || 0).replace(/[^0-9.-]+/g, ""));
      if (isNaN(totalCommission)) totalCommission = 0;
    }

    // - Tổng phí trả sale = Tổng commission * Tỷ lệ hoa hồng + Thưởng nóng
    let thuongNong = typeof obj["Thưởng nóng"] === 'number' ? obj["Thưởng nóng"] : 
                     parseFloat(String(obj["Thưởng nóng"] || 0).replace(/[^0-9.-]+/g, "")) || 0;
                     
    let tongPhiTraSale = (totalCommission * commissionRate) + thuongNong;
    
    // - Tổng phí trả khách (Tạm thời là 0, app có thể ghi đè nếu có công thức khác)
    let tongPhiTraKhach = 0; 
    
    obj["calculated_TyLeHoaHong"] = commissionRate;
    obj["calculated_TongCommission"] = totalCommission;
    obj["calculated_TongPhiTraSale"] = tongPhiTraSale;
    obj["calculated_TongPhiTraKhach"] = tongPhiTraKhach;

    result.push(obj);
  }
  
  return result;
}

// Thêm một dòng mới vào cuối sheet
function appendRow(sheetName, rowDataObj) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet '${sheetName}' not found`);
  
  const dataRange = sheet.getDataRange();
  const headers = dataRange.getValues()[0];
  const rowArray = [];
  
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    rowArray.push(rowDataObj[header] !== undefined ? rowDataObj[header] : '');
  }
  
  sheet.appendRow(rowArray);
  return { message: "Created successfully" };
}

// Cập nhật một dòng dựa vào Cột ID và Giá trị ID
function updateRow(sheetName, idColumnName, idValue, updateDataObj) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet '${sheetName}' not found`);
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) throw new Error("Sheet is empty");
  
  const headers = data[0];
  const idColIndex = headers.indexOf(idColumnName);
  if (idColIndex === -1) throw new Error(`ID column '${idColumnName}' not found`);
  
  let rowIndexToUpdate = -1;
  for (let i = 1; i < data.length; i++) {
    // So sánh dạng chuỗi để tránh lỗi sai kiểu dữ liệu
    if (String(data[i][idColIndex]) === String(idValue)) {
      rowIndexToUpdate = i + 1; // getRange 1-based index
      break;
    }
  }
  
  if (rowIndexToUpdate === -1) throw new Error(`Record with ID '${idValue}' not found`);
  
  // Cập nhật từng ô dữ liệu
  for (const key in updateDataObj) {
    const colIndex = headers.indexOf(key);
    if (colIndex !== -1) {
      sheet.getRange(rowIndexToUpdate, colIndex + 1).setValue(updateDataObj[key]);
    }
  }
  
  return { message: "Updated successfully" };
}

// Xóa một dòng dựa vào Cột ID và Giá trị ID
function deleteRow(sheetName, idColumnName, idValue) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet '${sheetName}' not found`);
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) throw new Error("Sheet is empty");
  
  const headers = data[0];
  const idColIndex = headers.indexOf(idColumnName);
  if (idColIndex === -1) throw new Error(`ID column '${idColumnName}' not found`);
  
  let rowIndexToDelete = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idColIndex]) === String(idValue)) {
      rowIndexToDelete = i + 1;
      break;
    }
  }
  
  if (rowIndexToDelete === -1) throw new Error(`Record with ID '${idValue}' not found`);
  
  sheet.deleteRow(rowIndexToDelete);
  return { message: "Deleted successfully" };
}
