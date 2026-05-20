// ==========================================
// CẤU HÌNH API & DATABASE
// ==========================================
const CONFIG = {
  TOKEN: "CRM_BDS_SECURE_TOKEN_2026", // Token bảo mật kết nối với Next.js

  // ID file Google Sheet nguồn "TỔNG HỢP BÁO CÁO BÁN HÀNG - VICTORY"
  // Vui lòng điền ID thực tế của file Victory vào đây
  SOURCE_SPREADSHEET_ID: "1I9eSfdDddketrRlbrkhN2UIvHHwvaFgs9a8pWUuZfDU",
  SOURCE_SHEET_NAME: "Tổng hợp giao dịch chi tiết",

  // ID file Google Sheet nguồn "VIC_DATA NHÂN SỰ VICTORY HOLDINGS"
  // Vui lòng điền ID thực tế của file nhân sự Victory vào đây
  SOURCE_EMPLOYEE_SPREADSHEET_ID: "1jbrf9uC6K_k-VRQyFwMzFk8qiU845wsqSszNXdnyJZw",
  SOURCE_EMPLOYEE_SHEET_NAME: "DATA NHÂN SỰ"
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


      // Đọc dữ liệu Pipeline đã đồng bộ từ Victory
      case 'getPipeline':
        result = getSheetData('Pipeline');
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
  } catch (err) {
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

      // TRIGGER ĐỒNG BỘ DỮ LIỆU VICTORY VÀO PIPELINE
      case 'syncPipeline':
        result = syncPipeline();
        break;

      // TRIGGER ĐỒNG BỘ DANH SÁCH NHÂN SỰ TỪ VICTORY
      case 'syncEmployees':
        result = syncEmployees();
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

// -----------------------------------------------
// Hàm helper tự động phát hiện dòng Header thực tế trong file nguồn Victory
// (Bỏ qua các dòng trống, dòng tiêu đề to, dòng gộp màu vàng...)
// -----------------------------------------------
function findHeaderAndData(sourceData, sourceDisplayData) {
  let headerRowIndex = 0;

  // Duyệt qua 10 dòng đầu để tìm dòng chứa tiêu đề
  for (let i = 0; i < Math.min(sourceData.length, 10); i++) {
    const rowStr = sourceData[i].map(cell => String(cell).toLowerCase()).join("|");
    // Nhận diện dòng header dựa trên các cột đặc trưng của file Victory
    if (rowStr.indexOf("stt") !== -1 || rowStr.indexOf("mã căn") !== -1 || rowStr.indexOf("dự án") !== -1 || rowStr.indexOf("ngày cọc") !== -1) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = sourceData[headerRowIndex].map(h => String(h).replace(/\s+/g, " ").trim());
  const dataRows = [];
  const displayRows = [];

  for (let i = headerRowIndex + 1; i < sourceData.length; i++) {
    // Chỉ lấy những dòng không rỗng hoàn toàn
    if (sourceData[i].join("").trim() !== "") {
      dataRows.push(sourceData[i]);
      if (sourceDisplayData && sourceDisplayData[i]) {
        displayRows.push(sourceDisplayData[i]);
      }
    }
  }

  return {
    headers: headers,
    data: dataRows,
    displayData: displayRows
  };
}

// -----------------------------------------------
// Đồng bộ dữ liệu từ Victory vào sheet PIPELINE
// -----------------------------------------------
function syncPipeline() {
  if (!CONFIG.SOURCE_SPREADSHEET_ID || CONFIG.SOURCE_SPREADSHEET_ID === "YOUR_VICTORY_SOURCE_SPREADSHEET_ID_HERE") {
    throw new Error("Vui lòng cấu hình SOURCE_SPREADSHEET_ID của file Victory.");
  }

  // 1. Đọc dữ liệu từ file nguồn Victory
  const sourceSpreadsheet = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID);
  const sourceSheet = sourceSpreadsheet.getSheetByName(CONFIG.SOURCE_SHEET_NAME);
  if (!sourceSheet) throw new Error(`Không tìm thấy sheet nguồn '${CONFIG.SOURCE_SHEET_NAME}'`);

  const sourceRawData = sourceSheet.getDataRange().getValues();
  const sourceDisplayData = sourceSheet.getDataRange().getDisplayValues();
  if (sourceRawData.length === 0) return { message: "Sheet nguồn rỗng." };

  // Tự động phát hiện Header và tách Data
  const parsedSource = findHeaderAndData(sourceRawData, sourceDisplayData);
  const sourceHeaders = parsedSource.headers;
  const sourceData = parsedSource.data;
  const sourceDisplayRows = parsedSource.displayData;

  // 2. Mở sheet Pipeline trong CRM_BDS
  const targetSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const pipelineSheet = targetSpreadsheet.getSheetByName("Pipeline");
  if (!pipelineSheet) throw new Error("Không tìm thấy sheet 'Pipeline' trong CRM_BDS.");

  let targetData = pipelineSheet.getDataRange().getValues();
  let targetHeaders = targetData[0].map(h => String(h).trim());

  // Tự động kiểm tra và thêm cột "thuong_nong" nếu chưa có
  if (targetHeaders.indexOf("thuong_nong") === -1) {
    const lastCol = pipelineSheet.getLastColumn();
    pipelineSheet.getRange(1, lastCol + 1).setValue("thuong_nong");
  }

  // Tự động kiểm tra và thêm cột "tkkd" và "phi_tkkd" nếu chưa có
  if (targetHeaders.indexOf("tkkd") === -1) {
    const lastCol = pipelineSheet.getLastColumn();
    pipelineSheet.getRange(1, lastCol + 1).setValue("tkkd");
  }
  if (targetHeaders.indexOf("phi_tkkd") === -1) {
    const lastCol = pipelineSheet.getLastColumn();
    pipelineSheet.getRange(1, lastCol + 1).setValue("phi_tkkd");
  }

  // Reload lại headers sau khi thêm cột
  targetData = pipelineSheet.getDataRange().getValues();
  targetHeaders = targetData[0].map(h => String(h).trim());

  // Cột ID dùng để Upsert: ma_can + ten_du_an tạo thành khóa duy nhất
  const idColName = "id_pipeline";
  const idColIndex = targetHeaders.indexOf(idColName);
  const maCanColIndex = targetHeaders.indexOf("ma_can");

  // Tạo lookup map theo ma_can (key duy nhất từ Victory)
  const targetMap = {}; // { ma_can: rowIndex_1based }
  for (let i = 1; i < targetData.length; i++) {
    const maCan = String(targetData[i][maCanColIndex] || "").trim();
    if (maCan) targetMap[maCan] = i + 1;
  }

  // 2b. Lấy map Dự án từ sheet 'DU_AN' để lookup tự động id_du_an theo ten_du_an
  const duAnSheet = targetSpreadsheet.getSheetByName("DU_AN");
  const duAnMap = {}; // { "vinhomes cần giờ": "DA-001" }
  if (duAnSheet) {
    const duAnData = duAnSheet.getDataRange().getValues();
    if (duAnData.length > 1) {
      const daHeaders = duAnData[0].map(h => String(h).trim());
      const daIdCol = daHeaders.indexOf("id_du_an");
      const daNameCol = daHeaders.indexOf("ten_du_an");
      if (daIdCol !== -1 && daNameCol !== -1) {
        for (let k = 1; k < duAnData.length; k++) {
          const name = String(duAnData[k][daNameCol] || "").trim().toLowerCase();
          const id = String(duAnData[k][daIdCol] || "").trim();
          if (name && id) {
            duAnMap[name] = id;
          }
        }
      }
    }
  }

  // Helper lấy giá trị số từ ô sheet (xử lý cả string lẫn number)
  function toNum(val) {
    if (typeof val === "number") return val;
    const parsed = parseFloat(String(val || 0).replace(/[^0-9.-]+/g, ""));
    return isNaN(parsed) ? 0 : parsed;
  }

  // Helper lấy giá trị % (xử lý dạng "50%" hoặc 0.5 hoặc 50)
  function toPct(val) {
    if (typeof val === "number") return val <= 1 ? val : val / 100;
    const str = String(val || "").replace(/[^0-9.,-]+/g, "").replace(",", ".");
    const parsed = parseFloat(str);
    if (isNaN(parsed)) return 0;
    return parsed > 1 ? parsed / 100 : parsed;
  }

  let insertCount = 0;
  let updateCount = 0;
  const now = new Date();

  // 3. Duyệt từng dòng nguồn, chuẩn hoá và upsert vào Pipeline
  for (let i = 0; i < sourceData.length; i++) {
    const row = sourceData[i];
    const displayRow = sourceDisplayRows[i];
    if (row.join("").trim() === "") continue;

    // Map dòng thành Object theo header nguồn
    const src = {};
    const srcDisplay = {};
    for (let j = 0; j < sourceHeaders.length; j++) {
      if (sourceHeaders[j]) {
        src[sourceHeaders[j]] = row[j];
        if (displayRow) {
          srcDisplay[sourceHeaders[j]] = displayRow[j];
        }
      }
    }

    // --- Trích xuất & chuẩn hoá ---
    const maCan = String(src["Mã Căn"] || src["Mã căn"] || "").trim();
    const loaiCan = String(src["Loại căn"] || src["Loại Căn"] || "").trim();
    const duAn = String(src["Dự Án"] || src["Dự án"] || "").trim();
    const saleBan = String(src["Sale bán"] || src["Sale Bán"] || "").trim();
    const gdda = String(src["GDDA"] || "").trim();
    const gdkd = String(src["GĐKD"] || src["GDKD"] || "").trim();
    const phongKd = String(src["Phòng KD"] || "").trim();

    // Trích xuất Ngày ký bằng Display Value để giữ nguyên định dạng chuỗi do người dùng nhập (tránh lỗi locale ngược ngày/tháng)
    const ngayKyRaw = srcDisplay["Ngày ký TTĐC/VBTT"] || srcDisplay["Ngày ký TTĐC/ VBTT"] || srcDisplay["Ngày ký VBTT"] || srcDisplay["Ngày ký TTĐC"] || src["Ngày ký TTĐC/VBTT"] || "";
    if (!ngayKyRaw || String(ngayKyRaw).trim() === "") {
      continue; // Bỏ qua vì chưa ký hợp đồng (chưa được tính doanh số)
    }

    let ngayKyDate = null;
    const dateStr = String(ngayKyRaw).trim();

    // Ưu tiên parse thủ công chuỗi định dạng DD/MM/YYYY
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const yearPart = parts[2].trim().split(/\s+/)[0];
      const year = parseInt(yearPart, 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        ngayKyDate = new Date(year, month, day);
      }
    }

    // Nếu không parse được theo cấu trúc DD/MM/YYYY, thử dùng fallback Date.parse
    if (!ngayKyDate || isNaN(ngayKyDate.getTime())) {
      if (ngayKyRaw instanceof Date) {
        ngayKyDate = ngayKyRaw;
      } else {
        const parsed = Date.parse(dateStr);
        if (!isNaN(parsed)) ngayKyDate = new Date(parsed);
      }
    }

    if (!ngayKyDate || isNaN(ngayKyDate.getTime())) {
      ngayKyDate = now;
    }

    if (!maCan || !duAn) continue; // Bỏ qua dòng thiếu định danh

    const giaTinhHH = toNum(src["Giá tính HH (Chưa gồm VAT & KPBT)"] || src["Giá tính HH"]);
    const tyLeHH = toPct(src["% Tỷ lệ HH"]);
    const tongPhiHHMG = toNum(src["Tổng Phí HHMG (Chưa VAT)"] || src["Tổng Phí HHMG"]);

    const tyLeTraSale = toPct(src["% Trả sale"]);
    const tyLeKH = toPct(src["% KH (nếu có)"] || src["% KH"]);
    const tyLeGDDA = toPct(src["% GDDA"]);
    const tyLeGDKD = toPct(src["%GDKD"] || src["% GDKD"]);
    const tyLeMKT = toPct(src["%MKT"] || src["% MKT"]);

    const phiTraSale = toNum(src["Tổng Phí HHMG trả sale"] || src["Tổng phí trả sale"]);
    const phiTraKH = toNum(src["Tổng phí trả KH"]);
    const phiTraGDDA = toNum(src["Tổng phí trả GDDA"]);
    const phiTraGDKD = toNum(src["Tổng phí trả GĐKD"] || src["Tổng phí trả GDKD"]);
    const phiTraMKT = toNum(src["Tổng phí trả MKT"]);
    const phiAdmin = toNum(src["Phí admin"]);
    const loiNhuan = toNum(src["Lợi nhuận"]);
    const thuongNongRaw = src["Thưởng nóng (Gồm VAT)"] || src["Thưởng nóng"] || src["thuong_nong"] || "";
    let thuongNong = 0;
    if (thuongNongRaw) {
      const rawStr = String(thuongNongRaw).trim();
      // Nếu không chứa ký tự % và bắt đầu bằng số (sau khi lọc dấu cách/dấu chấm/phẩy)
      if (rawStr.indexOf("%") === -1 && /^\d+/.test(rawStr.replace(/[.,\s]/g, ""))) {
        thuongNong = toNum(rawStr);
      }
    }
    if (thuongNong < 10000) {
      thuongNong = 0;
    }

    const tkkd = String(src["TKKD"] || "").trim();
    const phiTkkd = toNum(src["Phí TKKD"] || src["phí TKKD"] || 0);
    // Tạo id_pipeline ổn định từ Mã Căn
    const pipelineId = "PL-" + Math.abs(
      (function (str) {
        let hash = 0;
        for (let k = 0; k < str.length; k++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(k);
          hash = hash & hash;
        }
        return hash;
      })(maCan + "_" + duAn)
    ).toString(36).toUpperCase();

    // Dò tìm id_du_an tự động dựa trên tên dự án
    const resolvedDuAnId = duAnMap[duAn.toLowerCase()] || "";

    // Build object ghi xuống Pipeline theo đúng thứ tự header
    const writeObj = {
      "id_pipeline": pipelineId,
      "id_khach_hang": "",         // Không có trong Victory, giữ nguyên nếu đã có
      "giai_doan": "Ký HĐ",    // Victory là giao dịch thực tế đã ký cọc/thành công
      "id_du_an": resolvedDuAnId,
      "ten_du_an": duAn,
      "ma_can": maCan,
      "loai_can": loaiCan,
      "gia_tri_thuc_te": giaTinhHH,
      "hoa_hong": tyLeHH,
      "tien_hoa_hong": tongPhiHHMG,
      "sale_phu_trach": saleBan,
      "gdda": gdda,
      "gdkd": gdkd,
      "phong_kd": phongKd,
      "ty_le_tra_sale": tyLeTraSale,
      "ty_le_kh": tyLeKH,
      "ty_le_gdda": tyLeGDDA,
      "ty_le_gdkd": tyLeGDKD,
      "ty_le_mkt": tyLeMKT,
      "phi_tra_sale": phiTraSale,
      "phi_tra_kh": phiTraKH,
      "phi_tra_gdda": phiTraGDDA,
      "phi_tra_gdkd": phiTraGDKD,
      "phi_tra_mkt": phiTraMKT,
      "phi_admin": phiAdmin,
      "loi_nhuan": loiNhuan,
      "thuong_nong": thuongNong,
      "tkkd": tkkd,
      "phi_tkkd": phiTkkd,
      "ngay_cap_nhat": ngayKyDate,
      "thang": Utilities.formatDate(ngayKyDate, Session.getScriptTimeZone(), "yyyy-MM")
    };

    const rowValues = targetHeaders.map(h => writeObj[h] !== undefined ? writeObj[h] : "");
    const existingRowIndex = targetMap[maCan];

    if (existingRowIndex) {
      // Upsert: Cập nhật, nhưng giữ nguyên các trường CRM (id_khach_hang, giai_doan, id_du_an)
      const existingRow = targetData[existingRowIndex - 1];
      const preservedCols = ["id_khach_hang", "giai_doan", "id_du_an"];
      preservedCols.forEach(col => {
        const ci = targetHeaders.indexOf(col);
        if (ci !== -1 && String(existingRow[ci] || "").trim() !== "") {
          rowValues[ci] = existingRow[ci];
        }
      });
      pipelineSheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      updateCount++;
    } else {
      pipelineSheet.appendRow(rowValues);
      insertCount++;
    }
  }

  return {
    message: "Đồng bộ Pipeline thành công!",
    inserted: insertCount,
    updated: updateCount,
    timestamp: now.toISOString()
  };
}

// -----------------------------------------------
// Đồng bộ danh sách nhân sự từ file Nhân sự Victory vào sheet NHAN_VIEN
// -----------------------------------------------
function syncEmployees() {
  if (!CONFIG.SOURCE_EMPLOYEE_SPREADSHEET_ID || CONFIG.SOURCE_EMPLOYEE_SPREADSHEET_ID === "YOUR_VIC_DATA_NHAN_SU_SPREADSHEET_ID_HERE") {
    throw new Error("Vui lòng cấu hình SOURCE_EMPLOYEE_SPREADSHEET_ID của file VIC_DATA NHÂN SỰ VICTORY HOLDINGS.");
  }

  // 1. Đọc dữ liệu từ file nguồn
  const sourceSpreadsheet = SpreadsheetApp.openById(CONFIG.SOURCE_EMPLOYEE_SPREADSHEET_ID);
  const sourceSheet = sourceSpreadsheet.getSheetByName(CONFIG.SOURCE_EMPLOYEE_SHEET_NAME || "DATA NHÂN SỰ");
  if (!sourceSheet) throw new Error(`Không tìm thấy sheet nguồn '${CONFIG.SOURCE_EMPLOYEE_SHEET_NAME || "DATA NHÂN SỰ"}'`);

  const sourceRawData = sourceSheet.getDataRange().getValues();
  const sourceDisplayData = sourceSheet.getDataRange().getDisplayValues();
  if (sourceRawData.length === 0) return { message: "Sheet nguồn rỗng." };

  // Tìm dòng tiêu đề chứa các từ khóa đặc trưng nhân sự
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(sourceRawData.length, 15); i++) {
    const rowStr = sourceRawData[i].map(cell => String(cell).toLowerCase()).join("|");
    if (rowStr.indexOf("mnv") !== -1 || rowStr.indexOf("mã nv") !== -1 || rowStr.indexOf("họ tên") !== -1 || rowStr.indexOf("họ và tên") !== -1 || rowStr.indexOf("sđt") !== -1) {
      headerRowIndex = i;
      break;
    }
  }

  const sourceHeaders = sourceRawData[headerRowIndex].map((h, colIdx) => {
    let headerStr = String(h).replace(/\s+/g, " ").trim();
    // Xử lý Merge Cells: Nếu ô tiêu đề bị rỗng (do merge với dòng trên), lấy giá trị của dòng trên (row 3)
    if (!headerStr && headerRowIndex > 0) {
      headerStr = String(sourceRawData[headerRowIndex - 1][colIdx] || "").replace(/\s+/g, " ").trim();
    }
    return headerStr;
  });
  const sourceData = [];
  const sourceDisplayRows = [];

  for (let i = headerRowIndex + 1; i < sourceRawData.length; i++) {
    if (sourceRawData[i].join("").trim() !== "") {
      sourceData.push(sourceRawData[i]);
      sourceDisplayRows.push(sourceDisplayData[i]);
    }
  }

  // 2. Mở sheet NHAN_VIEN trong CRM_BDS
  const targetSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const employeeSheet = targetSpreadsheet.getSheetByName("NHAN_VIEN");
  if (!employeeSheet) throw new Error("Không tìm thấy sheet 'NHAN_VIEN' trong CRM_BDS.");

  let targetData = employeeSheet.getDataRange().getValues();
  let targetHeaders = targetData[0].map(h => String(h).trim());

  // Đảm bảo có cột mã nhân viên
  const idColIndex = targetHeaders.indexOf("id_nhan_vien");
  if (idColIndex === -1) {
    throw new Error("Không tìm thấy cột 'id_nhan_vien' trong sheet NHAN_VIEN của CRM.");
  }

  // Helper đồng nhất ID: nếu là chuỗi toàn số, đưa về số nguyên (xóa số 0 ở đầu) để tránh lỗi '0001' khác '1'
  function normalizeId(idStr) {
    const str = String(idStr).trim();
    if (/^\d+$/.test(str)) return String(parseInt(str, 10));
    return str;
  }

  // Tạo lookup map
  let targetMap = {};
  for (let i = 1; i < targetData.length; i++) {
    const id = normalizeId(targetData[i][idColIndex]);
    if (id) targetMap[id] = i + 1;
  }

  // Hàm chuẩn hóa chuỗi: xóa khoảng trắng, đưa về chữ thường, và xóa dấu tiếng Việt
  function normalizeStr(str) {
    if (!str) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Xóa dấu
      .replace(/đ/g, "d").replace(/Đ/g, "d")
      .replace(/\s+/g, "") // Xóa khoảng trắng
      .toLowerCase();
  }

  // Helper hàm tìm index của cột nguồn khớp với header đích bằng bí danh (aliases)
  // Chiến lược: exact-match trước, rồi mới includes (chỉ với alias dài >= 4 ký tự)
  // để tránh alias ngắn như "id" khớp nhầm vào "diđộng" hoặc các cột không liên quan
  function findSourceColIndex(targetHeaderName) {
    const aliases = {
      // Mã nhân viên - KHÔNG dùng alias "id" vì quá chung chung
      id_nhan_vien: [
        "mnv", "mãnv", "mãnhânsự", "mãnhânviên", "manhanvien", "manv",
        "idnhânviên", "idnhansu", "id_nhan_vien", "manhansự"
      ],
      ho_ten: [
        "họtên", "họvàtên", "hoten", "ho_ten", "tênnhânviên",
        "hovaten", "hten"
      ],
      so_dien_thoai: [
        "sốđiệnthoại", "sđt", "sdt", "sodienthoai", "so_dien_thoai",
        "phone", "diđộng", "điệnthoạidiđộng", "đtdiđộng", "đtdđ"
      ],
      email: ["email", "mail", "thưđiệntử", "emailcánhân"],
      employee_type: [
        "chứcdanh", "vịtrí", "chucdanh", "employee_type",
        "loạinhânviên", "chucvu", "chứcvụ"
      ],
      trang_thai: ["trạngthái", "trang_thai", "tìnhtrạng", "trangthai"],
      // Cột P "Số CMTND" / "CCCD" trong DATA NHÂN SỰ
      so_cccd: [
        "sốcmtnd", "cmtnd", "socmtnd", "số cmtnd",
        "sốcmnd", "cmnd", "socmnd",
        "sốcccd", "cccd", "socccd",
        "cmnd/cccd", "sốcmnd/cccd", "cccd/cmnd"
      ],
      // Cột Q "Ngày cấp" trong DATA NHÂN SỰ
      ngay_cap: [
        "ngàycấp", "ngay_cap", "ngaycap",
        "ngàycấpcmt", "ngàycấpcccd", "ngaycapcmt",
        "ngàycấpthẻ", "ngaycapthe"
      ],
      // Cột R "Nơi cấp" trong DATA NHÂN SỰ
      noi_cap: [
        "nơicấp", "noi_cap", "noicap",
        "nơicấpcmt", "nơicấpcccd", "noicapcmt",
        "nơicấpthẻ", "noicapthe"
      ],
      // Cột S "Địa chỉ thường trú / HKTT" trong DATA NHÂN SỰ
      HKTT: [
        "hktt", "hộkhẩuthườngtrú", "địachỉthườngtrú",
        "hokhauthruongtru", "diachihuongtru", "thườngtrú",
        "thuongtru", "địachỉhktt", "hộkhẩu"
      ],
      ngay_sinh: [
        "ngàysinh", "ngay_sinh", "sinhnhật", "ngaysinh",
        "ngàythángnămsinh", "ngaythangnamsinh"
      ],
      gioi_tinh: [
        "giớitính", "gioi_tinh", "gioitinh", "nam/nữ",
        "phai", "phái"
      ],
      ma_so_thue: [
        "mãsốthuế", "masothue", "ma_so_thue", "mst",
        "mãsốthuếcánhân", "taxcode"
      ],
      so_tk_ngan_hang: [
        "sốtàikhoản", "stk", "sốtk", "so_tk", "so_tk_ngan_hang", "sotk"
      ],
      ten_ngan_hang_thu_huong: [
        "ngânhàng", "tênngânhàng", "ten_ngan_hang", "ten_ngan_hang_thu_huong",
        "tennganhang", "ngânhàngthụhưởng"
      ],
      vai_tro: ["vaitrò", "vai_tro", "quyền", "vaitro"],
      khu_vuc: ["khuvực", "khu_vuc", "khuvuc", "chinánh", "vùng"],
      phong_KD: [
        "phòngkd", "phong_kd", "phongkd", "phòngban",
        "bộphận", "bophan", "nhóm", "team", "phong/donvi", "phongdonvi", "phòng/đơnvị"
      ],
      so_nguoi_phu_thuoc: [
        "sốngườiphụthuộc", "songuoiphuthuoc", "so_nguoi_phu_thuoc",
        "sốnpt", "npt"
      ],
      mat_khau: ["mậtkhẩu", "mat_khau", "password", "matkhau"]
    };

    // Chuẩn hóa toàn bộ alias về dạng không dấu
    const normalizedAliases = (aliases[targetHeaderName] || [targetHeaderName])
      .map(alias => normalizeStr(alias));

    // Bước 1: Tìm exact-match trước (an toàn nhất)
    for (let colIdx = 0; colIdx < sourceHeaders.length; colIdx++) {
      const cleanSrc = normalizeStr(sourceHeaders[colIdx]);
      if (normalizedAliases.some(alias => cleanSrc === alias)) {
        // Tránh nhầm cột Số CCCD với cột Checkbox CCCD (TT HỒ SƠ) ở tận cột AK
        if (targetHeaderName === "so_cccd" && colIdx > 25) continue;
        return colIdx;
      }
    }

    // Bước 2: Tìm includes, nhưng chỉ với alias đủ dài (>= 4 ký tự)
    for (let colIdx = 0; colIdx < sourceHeaders.length; colIdx++) {
      const cleanSrc = normalizeStr(sourceHeaders[colIdx]);
      if (normalizedAliases.some(alias => alias.length >= 4 && cleanSrc.includes(alias))) {
        // Tránh nhầm cột Số CCCD với cột Checkbox CCCD (TT HỒ SƠ) ở tận cột AK
        if (targetHeaderName === "so_cccd" && colIdx > 25) continue;
        return colIdx;
      }
    }

    return -1;
  }

  // Khởi tạo bản đồ index cột
  const colMappings = {};
  targetHeaders.forEach(th => {
    colMappings[th] = findSourceColIndex(th);
  });

  // --- DEBUG MAPPING ---
  targetHeaders.forEach(th => {
    if (["ngay_cap", "noi_cap", "HKTT", "ngay_sinh", "gioi_tinh", "so_dien_thoai"].includes(th)) {
      Logger.log(`Mapping cho '${th}': ${colMappings[th] !== -1 ? 'TÌM THẤY ở cột ' + colMappings[th] + ' (' + sourceHeaders[colMappings[th]] + ')' : 'THẤT BẠI (-1)'}`);
    }
  });
  Logger.log("Tất cả sourceHeaders: " + JSON.stringify(sourceHeaders));
  // ---------------------

  let insertCount = 0;
  let updateCount = 0;
  const now = new Date();

  // 3. Duyệt từng dòng nguồn để upsert
  for (let i = 0; i < sourceData.length; i++) {
    const row = sourceData[i];
    const displayRow = sourceDisplayRows[i];

    // Lấy mã nhân viên từ cột nguồn (nếu tìm thấy)
    const idSrcIndex = colMappings["id_nhan_vien"];
    let idNhanVien = "";
    if (idSrcIndex !== -1) {
      idNhanVien = normalizeId(displayRow[idSrcIndex] || row[idSrcIndex] || "");
    }
    // Nếu không tìm được mã NV từ cột nguồn hoặc cột trống, bỏ qua dòng này
    // (không tự sinh ID vì sẽ tạo bản sao mỗi lần sync)
    if (!idNhanVien || idNhanVien === "0") continue;

    const nameSrcIndex = colMappings["ho_ten"];
    const hoTen = nameSrcIndex !== -1 ? String(row[nameSrcIndex] || "").trim() : "";
    if (!hoTen) continue;

    const writeObj = {};

    // Thiết lập giá trị mặc định cho cột CRM
    writeObj["ngay_tao"] = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    writeObj["trang_thai"] = "Đang làm";
    writeObj["vai_tro"] = "Sale";
    writeObj["mat_khau"] = "123456";

    targetHeaders.forEach(th => {
      const srcColIdx = colMappings[th];
      if (srcColIdx !== -1) {
        let val = row[srcColIdx];
        let displayVal = displayRow ? displayRow[srcColIdx] : "";

        if (th === "ngay_sinh" || th === "ngay_cap") {
          let dateObj = null;
          const dateStr = String(displayVal || val).trim();
          if (dateStr) {
            const parts = dateStr.split("/");
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const yearPart = parts[2].trim().split(/\s+/)[0];
              const year = parseInt(yearPart, 10);
              if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                dateObj = new Date(year, month, day);
              }
            }
            if (!dateObj && val instanceof Date) {
              dateObj = val;
            }
            if (dateObj && !isNaN(dateObj.getTime())) {
              writeObj[th] = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
            } else {
              writeObj[th] = dateStr;
            }
          } else {
            writeObj[th] = "";
          }
        } else if (th === "so_nguoi_phu_thuoc") {
          writeObj[th] = parseInt(String(val).replace(/[^0-9]/g, ""), 10) || 0;
        } else if (th === "so_dien_thoai" || th === "so_cccd" || th === "so_tk_ngan_hang") {
          writeObj[th] = String(displayVal || val || "").trim();
        } else {
          writeObj[th] = String(val === null || val === undefined ? "" : val).trim();
        }
      }
    });

    writeObj["id_nhan_vien"] = idNhanVien;
    writeObj["ho_ten"] = hoTen;

    const targetRowIndex = targetMap[idNhanVien];

    if (targetRowIndex) {
      // Cập nhật dòng hiện tại: Đọc giá trị cũ để tránh đè trống các trường CRM-only (như avatar_url, vai_tro, mat_khau...)
      const existingRow = targetData[targetRowIndex - 1];
      const updatedRowValues = [...existingRow];

      targetHeaders.forEach((th, thIdx) => {
        if (writeObj[th] !== undefined) {
          updatedRowValues[thIdx] = writeObj[th];
        }
      });

      // Bảo lưu mật khẩu đã có trên hệ thống nếu không được định nghĩa mới từ file nguồn
      const currentPasswordColIdx = targetHeaders.indexOf("mat_khau");
      if (currentPasswordColIdx !== -1) {
        const curPass = String(existingRow[currentPasswordColIdx] || "").trim();
        const newPass = String(writeObj["mat_khau"] || "").trim();
        if (curPass && (!newPass || newPass === "123456")) {
          updatedRowValues[currentPasswordColIdx] = curPass;
        }
      }

      employeeSheet.getRange(targetRowIndex, 1, 1, updatedRowValues.length).setValues([updatedRowValues]);
      updateCount++;
    } else {
      // Thêm mới: Điền giá trị mới hoặc rỗng nếu không được map
      const rowValues = targetHeaders.map(h => writeObj[h] !== undefined ? writeObj[h] : "");
      employeeSheet.appendRow(rowValues);
      insertCount++;
      // Cập nhật targetData và map để phục vụ các dòng tiếp theo
      targetData = employeeSheet.getDataRange().getValues();
      targetMap[idNhanVien] = targetData.length;
    }
  }

  return {
    message: "Đồng bộ danh sách nhân sự thành công!",
    inserted: insertCount,
    updated: updateCount,
    timestamp: now.toISOString()
  };
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
