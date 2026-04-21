/**
 * ============================================================
 * Simulation Test — Auto-ID Generation for CRM-BDS
 * ============================================================
 * 
 * This simulates the Google Apps Script behavior locally to verify:
 * 1. Single-row manual input → ID generated correctly
 * 2. Multi-row bulk paste   → ALL IDs generated correctly
 * 3. No duplicate IDs
 * 4. Empty name rows skipped
 * 5. Existing IDs preserved
 * 
 * Run: node scripts/test-auto-id-simulation.mjs
 * ============================================================
 */

// ── Simulate Google Sheets data structure ──
class MockSheet {
  constructor(name, headers, data) {
    this.name = name;
    this.rows = [headers, ...data]; // Row 1 = headers
  }

  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows[0]?.length || 0; }

  getRange(row, col, numRows = 1, numCols = 1) {
    const self = this;
    return {
      getRow: () => row,
      getLastRow: () => row + numRows - 1,
      getSheet: () => self,
      getValues() {
        const result = [];
        for (let r = row - 1; r < row - 1 + numRows; r++) {
          const rowData = [];
          for (let c = col - 1; c < col - 1 + numCols; c++) {
            rowData.push(self.rows[r]?.[c] ?? '');
          }
          result.push(rowData);
        }
        return result;
      },
      setValues(values) {
        for (let r = 0; r < values.length; r++) {
          for (let c = 0; c < values[r].length; c++) {
            if (!self.rows[row - 1 + r]) self.rows[row - 1 + r] = [];
            self.rows[row - 1 + r][col - 1 + c] = values[r][c];
          }
        }
      },
      getValue() {
        return self.rows[row - 1]?.[col - 1] ?? '';
      },
      setValue(val) {
        if (!self.rows[row - 1]) self.rows[row - 1] = [];
        self.rows[row - 1][col - 1] = val;
      },
    };
  }
}

// ── Replicate the core logic from google-apps-script-auto-id.js ──

const SHEET_CONFIG = {
  'NHAN_VIEN':  { prefix: 'NV',  idCol: 1 },
  'KHACH_HANG': { prefix: 'KH',  idCol: 1 },
  'PIPELINE':   { prefix: 'PL',  idCol: 1 },
  'CONG_VIEC':  { prefix: 'CV',  idCol: 1 },
  'DU_AN':      { prefix: 'DA_', idCol: 1 },
  'HOP_DONG':   { prefix: 'HD',  idCol: 1 },
};

function getNextIdNumber_(sheet, config) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;

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

function fillMissingIdsInRange_(sheet, config, startRow, endRow) {
  const numRows = endRow - startRow + 1;
  if (numRows <= 0) return 0;

  const nameCol = config.idCol + 1;
  const numCols = Math.max(config.idCol, nameCol);

  const range = sheet.getRange(startRow, 1, numRows, numCols);
  const values = range.getValues();

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
  range.setValues(values);
  return counter;
}

function fillMissingIds_(sheet, config) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const nameCol = config.idCol + 1;
  const numCols = Math.max(config.idCol, nameCol);
  const numRows = lastRow - 1;

  const range = sheet.getRange(2, 1, numRows, numCols);
  const values = range.getValues();

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
  range.setValues(values);
  return counter;
}

// ── Helper ──
function printSheet(sheet, label) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(60)}`);
  const colWidths = [16, 25, 20];
  for (let r = 0; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    const prefix = r === 0 ? 'HDR' : `R${r + 1} `;
    const cells = row.map((cell, i) => String(cell || '').padEnd(colWidths[i] || 15)).join(' │ ');
    console.log(`  ${prefix.padEnd(4)} │ ${cells}`);
    if (r === 0) console.log(`  ${'─'.repeat(4)}┼${'─'.repeat(cells.length + 2)}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

// ============================================================
// TEST CASES
// ============================================================

console.log('\n🧪 Auto-ID Generation — Simulation Tests\n');

// ── TEST 1: Single row manual input ──
console.log('\n📋 TEST 1: Single row manual input (KHACH_HANG)');
{
  const sheet = new MockSheet('KHACH_HANG',
    ['id_khach_hang', 'ho_ten', 'so_dien_thoai'],
    [
      ['KH00001', 'Nguyễn Văn A', '0901234567'],
      ['KH00002', 'Trần Thị B',   '0912345678'],
      ['',         'Lê Văn C',     '0923456789'], // ← NEW row, no ID
    ]
  );

  printSheet(sheet, 'BEFORE — 1 new row manually typed');

  const config = SHEET_CONFIG['KHACH_HANG'];
  // Simulate onEdit: e.range covers only row 4 (the new row)
  const count = fillMissingIdsInRange_(sheet, config, 4, 4);

  printSheet(sheet, 'AFTER — onEditAutoId fired');

  assert(count === 1, `Generated exactly 1 ID (got ${count})`);
  assert(sheet.rows[3][0] === 'KH00003', `ID = KH00003 (got "${sheet.rows[3][0]}")`);
  assert(sheet.rows[1][0] === 'KH00001', 'Existing KH00001 preserved');
  assert(sheet.rows[2][0] === 'KH00002', 'Existing KH00002 preserved');
}

// ── TEST 2: Bulk paste — 5 rows at once ──
console.log('\n\n📋 TEST 2: Bulk paste — 5 customer rows (KHACH_HANG)');
{
  const sheet = new MockSheet('KHACH_HANG',
    ['id_khach_hang', 'ho_ten', 'so_dien_thoai'],
    [
      ['KH00001', 'Nguyễn Văn A',   '0901234567'],
      ['KH00002', 'Trần Thị B',     '0912345678'],
      // ↓ Pasted 5 rows (no IDs)
      ['',         'Phạm Quốc Tuấn', '0934567890'],
      ['',         'Hoàng Minh Đức', '0945678901'],
      ['',         'Vũ Thị Mai',     '0956789012'],
      ['',         'Đặng Hữu Phúc', '0967890123'],
      ['',         'Bùi Thanh Hà',   '0978901234'],
    ]
  );

  printSheet(sheet, 'BEFORE — 5 rows pasted without IDs');

  const config = SHEET_CONFIG['KHACH_HANG'];
  // Simulate onEdit: e.range covers rows 4-8
  const count = fillMissingIdsInRange_(sheet, config, 4, 8);

  printSheet(sheet, 'AFTER — onEditAutoId fired for paste range');

  assert(count === 5, `Generated exactly 5 IDs (got ${count})`);
  assert(sheet.rows[3][0] === 'KH00003', `Row 4 = KH00003 (got "${sheet.rows[3][0]}")`);
  assert(sheet.rows[4][0] === 'KH00004', `Row 5 = KH00004 (got "${sheet.rows[4][0]}")`);
  assert(sheet.rows[5][0] === 'KH00005', `Row 6 = KH00005 (got "${sheet.rows[5][0]}")`);
  assert(sheet.rows[6][0] === 'KH00006', `Row 7 = KH00006 (got "${sheet.rows[6][0]}")`);
  assert(sheet.rows[7][0] === 'KH00007', `Row 8 = KH00007 (got "${sheet.rows[7][0]}")`);

  // Check for duplicates
  const ids = sheet.rows.slice(1).map(r => r[0]).filter(Boolean);
  const uniqueIds = new Set(ids);
  assert(ids.length === uniqueIds.size, `No duplicate IDs (${ids.length} ids, ${uniqueIds.size} unique)`);
}

// ── TEST 3: onChange full scan (paste doesn't give range) ──
console.log('\n\n📋 TEST 3: onChange full-sheet scan (KHACH_HANG)');
{
  const sheet = new MockSheet('KHACH_HANG',
    ['id_khach_hang', 'ho_ten', 'so_dien_thoai'],
    [
      ['KH00001', 'Nguyễn Văn A',   '0901234567'],
      ['',         'Trần Thị B',     '0912345678'], // missing ID!
      ['KH00003', 'Lê Văn C',       '0923456789'],
      ['',         'Phạm Thị D',     '0934567890'], // missing ID!
      ['',         'Hoàng Văn E',    '0945678901'], // missing ID!
      ['KH00010', 'Vũ Thị F',       '0956789012'],
      ['',         'Đặng Văn G',     '0967890123'], // missing ID!
    ]
  );

  printSheet(sheet, 'BEFORE — scattered missing IDs');

  const config = SHEET_CONFIG['KHACH_HANG'];
  // Simulate onChange: no range info, full scan
  const count = fillMissingIds_(sheet, config);

  printSheet(sheet, 'AFTER — onChangeAutoId full scan');

  assert(count === 4, `Generated exactly 4 IDs (got ${count})`);
  assert(sheet.rows[2][0] === 'KH00011', `Row 3 = KH00011 (continues from max KH00010) (got "${sheet.rows[2][0]}")`);
  assert(sheet.rows[4][0] === 'KH00012', `Row 5 = KH00012 (got "${sheet.rows[4][0]}")`);
  assert(sheet.rows[5][0] === 'KH00013', `Row 6 = KH00013 (got "${sheet.rows[5][0]}")`);
  assert(sheet.rows[7][0] === 'KH00014', `Row 8 = KH00014 (got "${sheet.rows[7][0]}")`);

  // Existing IDs preserved
  assert(sheet.rows[1][0] === 'KH00001', 'KH00001 preserved');
  assert(sheet.rows[3][0] === 'KH00003', 'KH00003 preserved');
  assert(sheet.rows[6][0] === 'KH00010', 'KH00010 preserved');

  // No duplicates
  const ids = sheet.rows.slice(1).map(r => r[0]).filter(Boolean);
  assert(new Set(ids).size === ids.length, `No duplicates (${ids.length} ids)`);
}

// ── TEST 4: Empty name rows should be skipped ──
console.log('\n\n📋 TEST 4: Rows with empty name skipped');
{
  const sheet = new MockSheet('KHACH_HANG',
    ['id_khach_hang', 'ho_ten', 'so_dien_thoai'],
    [
      ['',  '',              ''],            // empty row — should skip
      ['',  'Nguyễn Văn A',  '0901234567'],  // has name — should get ID
      ['',  '',              '0912345678'],   // no name — should skip
      ['',  'Trần Thị B',   ''],             // has name — should get ID
    ]
  );

  printSheet(sheet, 'BEFORE — mix of empty and valid rows');

  const count2 = fillMissingIds_(sheet, SHEET_CONFIG['KHACH_HANG']);

  printSheet(sheet, 'AFTER — empty names skipped');

  assert(count2 === 2, `Generated exactly 2 IDs (skipped empty names) (got ${count2})`);
  assert(sheet.rows[1][0] === '', 'Empty row stays empty');
  assert(sheet.rows[2][0] === 'KH00001', 'Row with name gets ID');
  assert(sheet.rows[3][0] === '', 'Row without name stays empty');
  assert(sheet.rows[4][0] === 'KH00002', 'Row with name gets ID');
}

// ── TEST 5: NHAN_VIEN (employee) still works ──
console.log('\n\n📋 TEST 5: NHAN_VIEN sheet — backward compatibility');
{
  const sheet = new MockSheet('NHAN_VIEN',
    ['id_nhan_vien', 'ho_ten', 'email'],
    [
      ['NV00001', 'Nguyễn Admin',  'admin@company.com'],
      ['NV00002', 'Trần Manager',  'manager@company.com'],
      ['',         'Lê Employee',  'new@company.com'],  // new
    ]
  );

  const count = fillMissingIdsInRange_(sheet, SHEET_CONFIG['NHAN_VIEN'], 4, 4);

  assert(count === 1, `Generated 1 NV ID (got ${count})`);
  assert(sheet.rows[3][0] === 'NV00003', `ID = NV00003 (got "${sheet.rows[3][0]}")`);
}

// ── TEST 6: Large bulk paste — 50 rows ──
console.log('\n\n📋 TEST 6: Large bulk paste — 50 rows (performance test)');
{
  const existingData = [
    ['KH00001', 'Customer 1', '0901111111'],
    ['KH00005', 'Customer 5', '0905555555'],
  ];
  // Generate 50 new rows with no IDs
  const newRows = [];
  for (let i = 0; i < 50; i++) {
    newRows.push(['', `New Customer ${i + 1}`, `09${String(i).padStart(8, '0')}`]);
  }

  const sheet = new MockSheet('KHACH_HANG',
    ['id_khach_hang', 'ho_ten', 'so_dien_thoai'],
    [...existingData, ...newRows]
  );

  const start = performance.now();
  const count = fillMissingIdsInRange_(sheet, SHEET_CONFIG['KHACH_HANG'], 4, 53);
  const elapsed = (performance.now() - start).toFixed(2);

  assert(count === 50, `Generated all 50 IDs (got ${count})`);
  assert(sheet.rows[3][0] === 'KH00006', `First new ID = KH00006 (continues from max 5) (got "${sheet.rows[3][0]}")`);
  assert(sheet.rows[52][0] === 'KH00055', `Last new ID = KH00055 (got "${sheet.rows[52][0]}")`);

  // No duplicates
  const allIds = sheet.rows.slice(1).map(r => r[0]).filter(Boolean);
  assert(new Set(allIds).size === allIds.length, `No duplicates among ${allIds.length} IDs`);

  console.log(`  ⏱️  Execution time: ${elapsed}ms (local sim)`);
}

// ── TEST 7: Idempotency — running twice shouldn't create extra IDs ──
console.log('\n\n📋 TEST 7: Idempotency — running twice');
{
  const sheet = new MockSheet('KHACH_HANG',
    ['id_khach_hang', 'ho_ten', 'so_dien_thoai'],
    [
      ['',  'Customer A', '0901234567'],
      ['',  'Customer B', '0912345678'],
    ]
  );

  const config = SHEET_CONFIG['KHACH_HANG'];

  // First run
  const count1 = fillMissingIds_(sheet, config);
  assert(count1 === 2, `First run: generated 2 IDs (got ${count1})`);

  // Second run (should be no-op since IDs are already filled)
  const count2 = fillMissingIds_(sheet, config);
  assert(count2 === 0, `Second run: generated 0 IDs (got ${count2})`);

  assert(sheet.rows[1][0] === 'KH00001', 'IDs unchanged after second run');
  assert(sheet.rows[2][0] === 'KH00002', 'IDs unchanged after second run');
}

// ── SUMMARY ──
console.log('\n' + '═'.repeat(60));
console.log('  🏁 All tests completed!');
console.log('═'.repeat(60) + '\n');
