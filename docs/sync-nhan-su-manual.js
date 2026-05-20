// =====================================================================
// SCRIPT ĐỒNG BỘ NHÂN SỰ - CHẠY THỦ CÔNG TỪ APPS SCRIPT EDITOR
// =====================================================================
// CÁCH DÙNG:
//   1. Mở Google Sheet CRM_BDS → Tiện ích mở rộng → Apps Script
//   2. Tạo file mới (nút "+") đặt tên là "SyncNhanSu"
//   3. Dán toàn bộ code này vào, Ctrl+S để lưu
//   4. Chọn hàm "CHAY_DONG_BO_NHAN_SU" trong dropdown
//   5. Bấm nút ▶ Run
// =====================================================================

// === CẤU HÌNH ===
var SOURCE_EMPLOYEE_SPREADSHEET_ID = "1jbrf9uC6K_k-VRQyFwMzFk8qiU845wsqSszNXdnyJZw";
var SOURCE_EMPLOYEE_SHEET_NAME     = "DATA NHÂN SỰ";
var TARGET_SHEET_NAME              = "NHAN_VIEN";

// QUAN TRỌNG: Dòng tiêu đề cột thực sự trong DATA NHÂN SỰ
// (3 dòng đầu là logo/tiêu đề/trống, dòng 4 mới là header: STT | MNV | Họ và tên | ...)
var HEADER_ROW = 4;

// =====================================================================
// HÀM CHÍNH
// =====================================================================
function CHAY_DONG_BO_NHAN_SU() {
  try {
    var result = dongBoNhanSu();
    SpreadsheetApp.getUi().alert(
      "✅ Đồng bộ thành công!\n\n" +
      "📥 Thêm mới: " + result.inserted + " nhân viên\n" +
      "🔄 Cập nhật: " + result.updated + " nhân viên\n" +
      "⏭️ Bỏ qua:   " + result.skipped + " dòng trống/không hợp lệ"
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert("❌ Lỗi đồng bộ:\n\n" + e.message);
    Logger.log("Lỗi: " + e.message + "\n" + e.stack);
  }
}

// =====================================================================
// LOGIC ĐỒNG BỘ
// =====================================================================
function dongBoNhanSu() {
  // 1. Mở file nguồn
  var srcSS = SpreadsheetApp.openById(SOURCE_EMPLOYEE_SPREADSHEET_ID);
  var srcSheet = srcSS.getSheetByName(SOURCE_EMPLOYEE_SHEET_NAME);
  if (!srcSheet) {
    throw new Error("Không tìm thấy sheet '" + SOURCE_EMPLOYEE_SHEET_NAME + "'!");
  }

  var lastRow = srcSheet.getLastRow();
  var lastCol = srcSheet.getLastColumn();

  if (lastRow < HEADER_ROW) {
    throw new Error("Sheet nguồn có ít hơn " + HEADER_ROW + " dòng, không tìm thấy dòng tiêu đề!");
  }

  // Đọc từ HEADER_ROW trở đi (bỏ qua logo/tiêu đề ở trên)
  var numDataRows = lastRow - HEADER_ROW + 1; // bao gồm cả dòng header
  var srcRange = srcSheet.getRange(HEADER_ROW, 1, numDataRows, lastCol);
  var srcAllData    = srcRange.getValues();
  var srcDisplayAll = srcRange.getDisplayValues();

  var srcHeaders    = srcAllData[0].map(function(h) { return String(h || "").trim(); });
  var srcData       = srcAllData.slice(1);       // bỏ dòng header
  var srcDisplayData = srcDisplayAll.slice(1);

  // Log headers để debug
  Logger.log("=== HEADERS NGUỒN (hàng " + HEADER_ROW + ") ===");
  srcHeaders.forEach(function(h, i) {
    if (h) Logger.log("[Cột " + (i + 1) + "] " + h);
  });

  // 2. Mở sheet đích
  var crmSS = SpreadsheetApp.getActiveSpreadsheet();
  var targetSheet = crmSS.getSheetByName(TARGET_SHEET_NAME);
  if (!targetSheet) {
    throw new Error("Không tìm thấy sheet '" + TARGET_SHEET_NAME + "' trong file CRM!");
  }

  var targetAllData = targetSheet.getDataRange().getValues();
  if (targetAllData.length < 1) {
    throw new Error("Sheet NHAN_VIEN chưa có dòng tiêu đề!");
  }

  var targetHeaders = targetAllData[0].map(function(h) { return String(h || "").trim(); });
  Logger.log("=== HEADERS ĐÍCH (NHAN_VIEN) ===");
  Logger.log(targetHeaders.join(" | "));

  var idColIdx = targetHeaders.indexOf("id_nhan_vien");
  if (idColIdx === -1) {
    throw new Error("Không tìm thấy cột 'id_nhan_vien' trong sheet NHAN_VIEN!");
  }

  // Tạo lookup map
  var targetMap = {};
  for (var i = 1; i < targetAllData.length; i++) {
    var existId = String(targetAllData[i][idColIdx] || "").trim();
    if (existId) targetMap[existId] = i + 1;
  }

  // 3. Hàm tìm cột nguồn theo alias
  function findSrcCol(fieldName) {
    // Bảng alias: key = tên cột CRM, value = danh sách tên cột có thể có trong nguồn
    var ALIASES = {
      // Cột B "MNV" = Mã nhân viên → id_nhan_vien
      "id_nhan_vien": [
        "mnv", "mã nv", "mãnv",
        "mã nhân sự", "mãnhânsự",
        "mã nhân viên", "mãnhânviên",
        "manhanvien", "manv",
        "id_nhan_vien", "idnhânviên"
      ],
      // Cột C "Họ và tên"
      "ho_ten": [
        "họ và tên", "họvàtên", "họ tên", "họtên",
        "hoten", "ho_ten", "tên nhân viên", "tênnhânviên"
      ],
      // Cột U "Điện thoại di động"
      "so_dien_thoai": [
        "điện thoại di động", "điệnthoạidiđộng",
        "số điện thoại", "sốđiệnthoại",
        "sđt", "sdt", "sodienthoai", "so_dien_thoai",
        "di động", "diđộng", "phone", "đtdđ"
      ],
      "email": [
        "email", "mail", "thư điện tử", "thưđiệntử", "email cá nhân"
      ],
      "employee_type": [
        "chức danh", "chứcdanh", "vị trí", "vịtrí",
        "employee_type", "chức vụ", "chứcvụ", "loại nhân viên"
      ],
      "trang_thai": [
        "trạng thái", "trạngthái", "tình trạng", "tìnhtrạng",
        "trang_thai", "trangthai"
      ],
      // Cột P "Số CMTND" hoặc "CCCD"
      "so_cccd": [
        "số cmtnd", "sốcmtnd", "cmtnd", "socmtnd",
        "số cmnd", "sốcmnd", "cmnd", "socmnd",
        "số cccd", "sốcccd", "cccd", "socccd",
        "cmnd/cccd", "số cmnd/cccd"
      ],
      // Cột Q "Ngày cấp"
      "ngay_cap": [
        "ngày cấp", "ngàycấp", "ngay_cap", "ngaycap",
        "ngày cấp cmt", "ngày cấp cccd"
      ],
      // Cột R "Nơi cấp"
      "noi_cap": [
        "nơi cấp", "nơicấp", "noi_cap", "noicap",
        "nơi cấp cmt", "nơi cấp cccd"
      ],
      // Cột S "HKTT / Thường trú"
      "HKTT": [
        "hktt", "hộ khẩu thường trú", "hộkhẩuthườngtrú",
        "địa chỉ thường trú", "địachỉthườngtrú",
        "thường trú", "thườngtrú", "thuongtru"
      ],
      "ngay_sinh": [
        "ngày sinh", "ngàysinh", "ngay_sinh", "ngaysinh",
        "sinh nhật", "sinhnhật", "ngày tháng năm sinh"
      ],
      "gioi_tinh": [
        "giới tính", "giớitính", "gioi_tinh", "gioitinh",
        "nam/nữ", "phái", "phai"
      ],
      "ma_so_thue": [
        "mã số thuế", "mãsốthuế", "ma_so_thue", "masothue",
        "mst", "tax code", "taxcode"
      ],
      "so_tk_ngan_hang": [
        "số tài khoản", "sốtàikhoản", "stk", "số tk",
        "so_tk", "so_tk_ngan_hang", "sotk"
      ],
      "ten_ngan_hang_thu_huong": [
        "ngân hàng", "ngânhàng", "tên ngân hàng", "tênngânhàng",
        "ten_ngan_hang", "ten_ngan_hang_thu_huong"
      ],
      "vai_tro":             ["vai trò", "vaitrò", "vai_tro", "quyền", "vaitro"],
      "khu_vuc":             ["khu vực", "khuvực", "khu_vuc", "chi nhánh", "chinánh", "vùng"],
      "phong_KD":            ["phòng kd", "phòngkd", "phong_kd", "phòng ban", "bộ phận", "nhóm", "team"],
      "so_nguoi_phu_thuoc":  ["số người phụ thuộc", "sốngườiphụthuộc", "số npt", "sốnpt", "npt"],
      "mat_khau":            ["mật khẩu", "mậtkhẩu", "mat_khau", "password", "matkhau"]
    };

    var aliasList = ALIASES[fieldName] || [fieldName.replace(/\s+/g, "").toLowerCase()];

    // Bước 1: Exact-match (so sánh sau khi bỏ khoảng trắng + lowercase)
    for (var ci = 0; ci < srcHeaders.length; ci++) {
      var cleanH = srcHeaders[ci].replace(/\s+/g, "").toLowerCase();
      for (var ai = 0; ai < aliasList.length; ai++) {
        var cleanA = aliasList[ai].replace(/\s+/g, "").toLowerCase();
        if (cleanH === cleanA) return ci;
      }
    }

    // Bước 2: Includes — chỉ với alias đủ dài (>= 4 ký tự) để tránh khớp nhầm
    for (var ci2 = 0; ci2 < srcHeaders.length; ci2++) {
      var cleanH2 = srcHeaders[ci2].replace(/\s+/g, "").toLowerCase();
      for (var ai2 = 0; ai2 < aliasList.length; ai2++) {
        var cleanA2 = aliasList[ai2].replace(/\s+/g, "").toLowerCase();
        if (cleanA2.length >= 4 && cleanH2.indexOf(cleanA2) !== -1) return ci2;
      }
    }

    return -1;
  }

  // Khởi tạo mapping và log để debug
  var colMap = {};
  Logger.log("=== MAPPING CỘT ===");
  targetHeaders.forEach(function(th) {
    var idx = findSrcCol(th);
    colMap[th] = idx;
    Logger.log(th + " → " + (idx !== -1
      ? "[Cột " + (idx + 1) + "] \"" + srcHeaders[idx] + "\""
      : "⚠️ KHÔNG TÌM THẤY"));
  });

  // 4. Upsert từng dòng
  var now = new Date();
  var inserted = 0, updated = 0, skipped = 0;
  var currentTargetData = targetAllData;

  for (var ri = 0; ri < srcData.length; ri++) {
    var row = srcData[ri];
    var dispRow = srcDisplayData[ri];

    // Lấy MNV làm id_nhan_vien (KHÔNG tự sinh ID)
    var idIdx = colMap["id_nhan_vien"];
    var maNV = idIdx !== -1 ? String(dispRow[idIdx] || row[idIdx] || "").trim() : "";
    if (!maNV || maNV === "0") { skipped++; continue; }

    // Lấy họ tên
    var tenIdx = colMap["ho_ten"];
    var hoTen = tenIdx !== -1 ? String(row[tenIdx] || "").trim() : "";
    if (!hoTen) { skipped++; continue; }

    // Build dòng ghi
    var obj = {};
    obj["id_nhan_vien"] = maNV;
    obj["ho_ten"] = hoTen;
    obj["trang_thai"] = "Đang làm";
    obj["vai_tro"] = "Sale";
    obj["mat_khau"] = "123456";
    obj["ngay_tao"] = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

    targetHeaders.forEach(function(th) {
      if (th === "id_nhan_vien" || th === "ho_ten") return;
      var ci = colMap[th];
      if (ci === -1) return;

      var val = row[ci];
      var dVal = dispRow[ci];

      if (th === "ngay_sinh" || th === "ngay_cap") {
        var ds = String(dVal || val || "").trim();
        if (ds) {
          var parts = ds.split("/");
          if (parts.length === 3) {
            var dd = parseInt(parts[0], 10);
            var mm = parseInt(parts[1], 10) - 1;
            var yy = parseInt(parts[2].split(" ")[0], 10);
            if (!isNaN(dd) && !isNaN(mm) && !isNaN(yy)) {
              obj[th] = Utilities.formatDate(new Date(yy, mm, dd), Session.getScriptTimeZone(), "yyyy-MM-dd");
              return;
            }
          }
          if (val instanceof Date && !isNaN(val.getTime())) {
            obj[th] = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
            return;
          }
          obj[th] = ds;
        } else {
          obj[th] = "";
        }
      } else if (th === "so_nguoi_phu_thuoc") {
        obj[th] = parseInt(String(val || "").replace(/[^0-9]/g, ""), 10) || 0;
      } else if (th === "so_dien_thoai" || th === "so_cccd" || th === "so_tk_ngan_hang") {
        // Dùng display value để giữ đúng định dạng số (tránh bị chuyển sang số thập phân)
        obj[th] = String(dVal || val || "").trim();
      } else {
        obj[th] = String(val === null || val === undefined ? "" : val).trim();
      }
    });

    var rowValues = targetHeaders.map(function(h) {
      return obj[h] !== undefined ? obj[h] : "";
    });

    var existingRow = targetMap[maNV];
    if (existingRow) {
      // CẬP NHẬT: giữ lại mật khẩu và quyền đã thiết lập trên CRM
      var pwIdx = targetHeaders.indexOf("mat_khau");
      if (pwIdx !== -1 && currentTargetData[existingRow - 1]) {
        var oldPw = String(currentTargetData[existingRow - 1][pwIdx] || "").trim();
        if (oldPw && oldPw !== "123456") rowValues[pwIdx] = oldPw;
      }
      var roleIdx = targetHeaders.indexOf("vai_tro");
      if (roleIdx !== -1 && currentTargetData[existingRow - 1]) {
        var oldRole = String(currentTargetData[existingRow - 1][roleIdx] || "").trim();
        if (oldRole && oldRole !== "Sale") rowValues[roleIdx] = oldRole;
      }
      targetSheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
      updated++;
    } else {
      // THÊM MỚI
      targetSheet.appendRow(rowValues);
      inserted++;
      currentTargetData = targetSheet.getDataRange().getValues();
      targetMap[maNV] = currentTargetData.length;
    }
  }

  return { inserted: inserted, updated: updated, skipped: skipped };
}
