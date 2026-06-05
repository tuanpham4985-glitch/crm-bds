// ============================================================
//  STACKING — Auto info on selection  (GAS container-bound)
// ============================================================

// ─── Menu ────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ Stacking')
    .addItem('🏠 Xem thông tin căn', 'showSelectedCellInfo')
    .addToUi();
}

// ─── Auto toast khi chọn ô ───────────────────────────────────────────────────

function onSelectionChange(e) {
  try {
    var sheet     = e.range.getSheet();
    var sheetName = sheet.getName();
    if (!sheetName.match(/^(MCCN|MCC|MPP)\s+.+$/)) return;

    var row    = e.range.getRow();
    var col    = e.range.getColumn();
    var numVal = parsePrice(e.range.getValue());
    if (!numVal || numVal <= 0) return;

    var floorRaw = sheet.getRange(row, 1).getValue().toString().trim();
    var SKIP = ['TẦNG/CĂN','LOẠI CĂN','DTTT','DTT T','HƯỚNG','VIEW','TÒA',''];
    if (SKIP.some(function(s) { return floorRaw.toUpperCase() === s.toUpperCase(); })) return;

    var headerRow = 3;
    for (var r = row - 1; r >= 1; r--) {
      if (sheet.getRange(r, 1).getValue().toString().trim() === 'TẦNG/CĂN') {
        headerRow = r; break;
      }
    }
    var unitRaw = sheet.getRange(headerRow, col).getValue().toString().trim();
    if (!unitRaw) return;

    var match   = sheetName.match(/^(MCCN|MCC|MPP)\s+(.+)$/);
    var maCan   = match[2] + '-' + padId(floorRaw) + '-' + padId(unitRaw);

    var masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(match[1]);
    if (!masterSheet) return;

    var rows  = masterSheet.getDataRange().getValues();
    var found = rows.slice(1).find(function(r) { return r[1].toString().trim() === maCan; });
    if (!found) return;

    function fmt(v) { var n = parsePrice(v); return n ? n.toLocaleString('vi-VN') : (v || '—'); }

    SpreadsheetApp.getActiveSpreadsheet().toast(
      '📐 ' + (found[5] || '—') +
      '  |  DT: ' + fmt(found[6]) + ' m²' +
      '  |  Hướng: ' + (found[8] || '—') +
      '  |  View: ' + (found[9] || '—') +
      '\n💰 Giá KS: ' + fmt(found[10]) + ' đ',
      '🏠 ' + maCan,
      8
    );

  } catch (err) {}
}

// ─── Dialog đầy đủ (menu trigger) ────────────────────────────────────────────

function showSelectedCellInfo() {
  var sheet     = SpreadsheetApp.getActiveSheet();
  var range     = SpreadsheetApp.getActiveRange();
  var sheetName = sheet.getName();
  var match     = sheetName.match(/^(MCCN|MCC|MPP)\s+(.+)$/);

  if (!match) { SpreadsheetApp.getUi().alert('Hãy chọn ô trong sheet Stacking'); return; }

  var row = range.getRow(), col = range.getColumn();
  var numVal = parsePrice(range.getValue());
  if (!numVal || numVal <= 0) {
    SpreadsheetApp.getUi().alert('Hãy chọn ô có giá trị căn.'); return;
  }

  var floorRaw = sheet.getRange(row, 1).getValue().toString().trim();
  var SKIP = ['TẦNG/CĂN','LOẠI CĂN','DTTT','DTT T','HƯỚNG','VIEW','TÒA',''];
  if (SKIP.some(function(s) { return floorRaw.toUpperCase() === s.toUpperCase(); })) {
    SpreadsheetApp.getUi().alert('Hãy chọn ô ở dòng tầng.'); return;
  }

  var headerRow = 3;
  for (var r = row - 1; r >= 1; r--) {
    if (sheet.getRange(r, 1).getValue().toString().trim() === 'TẦNG/CĂN') { headerRow = r; break; }
  }
  var unitRaw = sheet.getRange(headerRow, col).getValue().toString().trim();
  if (!unitRaw) return;

  var maCan = match[2] + '-' + padId(floorRaw) + '-' + padId(unitRaw);

  var cache  = CacheService.getScriptCache();
  var cached = cache.get('M_' + match[1]);
  var rows;
  if (cached) {
    rows = JSON.parse(cached);
  } else {
    var master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(match[1]);
    if (!master) { SpreadsheetApp.getUi().alert('Không tìm thấy sheet: ' + match[1]); return; }
    rows = master.getDataRange().getValues();
    cache.put('M_' + match[1], JSON.stringify(rows), 300);
  }

  var found = rows.slice(1).find(function(r) { return r[1].toString().trim() === maCan; });
  function fmt(v) { var n = parsePrice(v); return n ? n.toLocaleString('vi-VN') : (v || '—'); }

  var content = found
    ? '<table>' +
      '<tr><td>Loại căn</td><td>' + (found[5] || '—') + '</td></tr>' +
      '<tr><td>DT Tim</td><td>' + fmt(found[6]) + ' m²</td></tr>' +
      '<tr><td>DTT T</td><td>' + fmt(found[7]) + ' m²</td></tr>' +
      '<tr><td>Hướng</td><td>' + (found[8] || '—') + '</td></tr>' +
      '<tr><td>View</td><td>' + (found[9] || '—') + '</td></tr>' +
      '<tr class="p"><td>Giá KS</td><td>' + fmt(found[10]) + ' đ</td></tr>' +
      '</table>'
    : '<p style="color:#dc2626">Không tìm thấy <b>' + maCan + '</b></p>';

  SpreadsheetApp.getUi().showModelessDialog(
    HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head><style>' +
      'body{font-family:"Google Sans",Arial,sans-serif;margin:0;padding:14px 16px;font-size:19px;color:#111827}' +
      'h3{margin:0 0 12px;color:#1d4ed8;font-size:22px}' +
      'table{width:100%;border-collapse:collapse}td{padding:7px 10px}' +
      'td:first-child{color:#6b7280;width:95px}td:last-child{font-weight:600}' +
      'tr:nth-child(even){background:#f9fafb}' +
      'tr.p td:last-child{color:#dc2626;font-size:21px}' +
      '</style></head><body><h3>🏠 ' + maCan + '</h3>' + content + '</body></html>'
    ).setWidth(350).setHeight(320), 'Thông tin căn hộ'
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parsePrice(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  var n = parseFloat(val.toString().replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function padId(val) {
  var s = val.toString().trim();
  return /^\d+$/.test(s) ? s.padStart(2, '0') : s;
}
