/**
 * Script: Seed tài khoản demo vào sheet chính của CRM
 * Tạo 4 tài khoản: Admin, Manager, Team Leader, Nhân viên
 * Mật khẩu mặc định: Victory@2026
 *
 * Chạy: npx ts-node scripts/task-management/seed-demo-accounts.ts
 */
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config({ path: '.env.local' });

const SHEET_ID    = process.env.GOOGLE_SHEET_ID!;
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL!;
const PRIVATE_KEY  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const DEFAULT_PASSWORD = 'Victory@2026';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'crm-bds-salt').digest('hex');
}

const DEMO_ACCOUNTS = [
  {
    id_nhan_vien:  'DEMO-ADMIN-001',
    ho_ten:        'Nguyễn Văn Admin',
    email:         'admin@victoryholdings.vn',
    mat_khau:      hashPassword(DEFAULT_PASSWORD),
    vai_tro:       'Admin',
    phong_ban:     'Ban Giám Đốc',
    chuc_vu:       'Giám Đốc',
    employee_type: 'Ban Giám Đốc',
    trang_thai:    'Đang làm việc',
    ngay_vao_lam:  '2020-01-01',
    so_dien_thoai: '0900000001',
    avatar_url:    '',
  },
  {
    id_nhan_vien:  'DEMO-MGR-001',
    ho_ten:        'Trần Thị Manager',
    email:         'manager@victoryholdings.vn',
    mat_khau:      hashPassword(DEFAULT_PASSWORD),
    vai_tro:       'Nhân viên',
    phong_ban:     'Kinh Doanh BĐS',
    chuc_vu:       'Trưởng phòng',
    employee_type: 'Trưởng phòng',
    trang_thai:    'Đang làm việc',
    ngay_vao_lam:  '2021-03-01',
    so_dien_thoai: '0900000002',
    avatar_url:    '',
  },
  {
    id_nhan_vien:  'DEMO-LEAD-001',
    ho_ten:        'Lê Văn Leader',
    email:         'leader@victoryholdings.vn',
    mat_khau:      hashPassword(DEFAULT_PASSWORD),
    vai_tro:       'Nhân viên',
    phong_ban:     'Kinh Doanh BĐS',
    chuc_vu:       'Team Leader',
    employee_type: 'Leader',
    trang_thai:    'Đang làm việc',
    ngay_vao_lam:  '2022-06-01',
    so_dien_thoai: '0900000003',
    avatar_url:    '',
  },
  {
    id_nhan_vien:  'DEMO-STAFF-001',
    ho_ten:        'Phạm Thị Nhân Viên',
    email:         'staff1@victoryholdings.vn',
    mat_khau:      hashPassword(DEFAULT_PASSWORD),
    vai_tro:       'Nhân viên',
    phong_ban:     'Kinh Doanh BĐS',
    chuc_vu:       'Chuyên viên',
    employee_type: 'Nhân viên',
    trang_thai:    'Đang làm việc',
    ngay_vao_lam:  '2023-01-15',
    so_dien_thoai: '0900000004',
    avatar_url:    '',
  },
];

async function main() {
  console.log('👤 Seeding tài khoản demo vào CRM sheet...\n');

  if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error('❌ Thiếu environment variables!');
    process.exit(1);
  }

  const auth = new JWT({
    email:  CLIENT_EMAIL,
    key:    PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(SHEET_ID, auth);
  await doc.loadInfo();

  // Tìm sheet Nhân Sự (sheet chứa tài khoản nhân viên)
  const sheet = doc.sheetsByTitle['Nhan_Su'] || doc.sheetsByTitle['NhanVien'] || doc.sheetsByTitle['Employees'];

  if (!sheet) {
    console.log('⚠  Không tìm thấy sheet Nhân Sự. Danh sách sheets:');
    Object.keys(doc.sheetsByTitle).forEach(t => console.log('   -', t));
    console.log('\n📋 Tài khoản sẽ cần thêm thủ công với mật khẩu hash:');
    DEMO_ACCOUNTS.forEach(a => {
      console.log(`\n   Email: ${a.email}`);
      console.log(`   Password hash: ${a.mat_khau}`);
    });
    return;
  }

  for (const account of DEMO_ACCOUNTS) {
    const rows = await sheet.getRows();
    const existing = rows.find((r: { get: (k: string) => string }) => r.get('email') === account.email);
    if (existing) {
      console.log(`⚠  Tài khoản ${account.email} đã tồn tại — bỏ qua`);
    } else {
      await sheet.addRow(account as never);
      console.log(`✅ Tạo tài khoản: ${account.email} (${account.employee_type})`);
    }
  }

  console.log(`\n🎉 Hoàn thành! Mật khẩu mặc định: ${DEFAULT_PASSWORD}`);
  console.log('\n📋 Tài khoản demo:');
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│ Email                          │ Role        │ Mật khẩu     │');
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log('│ admin@victoryholdings.vn       │ Admin/BGĐ   │ Victory@2026 │');
  console.log('│ manager@victoryholdings.vn     │ Trưởng P.   │ Victory@2026 │');
  console.log('│ leader@victoryholdings.vn      │ Team Leader │ Victory@2026 │');
  console.log('│ staff1@victoryholdings.vn      │ Nhân viên   │ Victory@2026 │');
  console.log('└──────────────────────────────────────────────────────────────┘');
}

main().catch(err => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
