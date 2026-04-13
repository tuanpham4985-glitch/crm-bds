import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';

const creds = JSON.parse(readFileSync('D:\\Work\\CRM_Mini\\crm-mini-492604-f45461c93f8f.json', 'utf-8'));
const jwt = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1S5VUfqtZ_nPeSHP85CLm8ojhhJh6-GGHxGwzbIlb3QI', jwt);
await doc.loadInfo();

const sheet = doc.sheetsByTitle['NHAN_VIEN'];
console.log('rowCount:', sheet.rowCount, '| columnCount:', sheet.columnCount);
await sheet.loadHeaderRow();
console.log('headerValues:', JSON.stringify(sheet.headerValues));
console.log('headerValues length:', sheet.headerValues?.length);

// Test gọi WebApp thay vì addRow
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxUf__Ht9g8iIv_WmyMa7-aoNY0uJCmnJGcvlFVnbclOmjfDV0cdEblvXkxYbquhKuWxA/exec";

const h = sheet.headerValues;

if (h && h.length > 0) {
  console.log('\nHeaders OK! Calling WebApp...');

  try {
    // ===== 1. TẠO NHÂN VIÊN QUA API =====
    const res = await fetch(WEBAPP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sheet: "NHAN_VIEN",
        ten: "Test User",
        sdt: "0999000111",
        email: "test@test.com",
        vai_tro: "Sale",
        trang_thai: "Đang làm"
      })
    });

    const data = await res.json();

    console.log("✅ API RESPONSE:", data);

  } catch (e) {
    console.log('❌ API FAILED:', e.message);
  }

} else {
  console.log('❌ headerValues is empty or undefined!');
}

// ================= TEST KHACH_HANG =================
async function testCreateKhachHang() {
  try {
    const res = await fetch(WEBAPP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sheet: "KHACH_HANG",
        ten: "Test KH",
        sdt: "0900000000",
        giai_doan: "NEW",
        sale: "NV001"
      })
    });

    const data = await res.json();
    console.log("🚀 KH CREATED:", data);

  } catch (e) {
    console.log("❌ KH ERROR:", e.message);
  }
}

// GỌI TEST
await testCreateKhachHang();