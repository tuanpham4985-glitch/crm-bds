/**
 * Script: Đồng bộ nhân viên từ sheet NHAN_VIEN → TM_Users + TM_Departments
 * Chạy: npx tsx scripts/task-management/sync-employees.ts
 */
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const CRM_SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const TM_SHEET_ID  = process.env.TM_GOOGLE_SHEET_ID || process.env.GOOGLE_SHEET_ID!;
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL!;
const PRIVATE_KEY  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const now = new Date().toISOString();

// ─── Role mapping ──────────────────────────────────────────
// Khớp chính xác với toRbacContext() trong src/lib/task-management/auth.ts
function getRole(vai_tro: string, employee_type: string): string {
  const vt  = (vai_tro || '').trim();
  const etL = (employee_type || '').trim().toLowerCase();

  if (
    vt === 'Admin' ||
    etL.startsWith('gđ') || etL.startsWith('gd') ||
    etL.startsWith('giám đốc') || etL.startsWith('giam doc') ||
    etL.startsWith('chủ tịch') || etL.startsWith('chu tich') || etL === 'ct' ||
    etL.startsWith('tổng') || etL.startsWith('tong') ||
    etL.startsWith('tgđ') || etL.startsWith('tgd') ||
    etL.startsWith('pgđ') || etL.startsWith('pgd') ||
    etL.startsWith('phó giám') || etL.startsWith('pho giam')
  ) return 'director';
  if (etL.startsWith('tp') || etL.includes('trưởng phòng') || etL.includes('truong phong') || etL.includes('tkkd') || vt === 'manager') return 'manager';
  if (etL.includes('leader') || etL.includes('team lead') || vt === 'leader') return 'team_leader';
  return 'staff';
}

// Chủ động hiểu trạng thái — không active nếu rõ ràng nghỉ việc
function getIsActive(trang_thai: string): string {
  const inactive = ['nghỉ việc', 'nghi viec', 'off', 'inactive', 'nghỉ', 'thôi việc', 'thoi viec'];
  const tt = (trang_thai || '').toLowerCase().trim();
  if (!tt) return 'TRUE'; // Không có trạng thái → coi là còn làm
  return inactive.some(s => tt.includes(s)) ? 'FALSE' : 'TRUE';
}

// ─── MAIN ──────────────────────────────────────────────────

async function main() {
  console.log('🔄 Đồng bộ nhân viên NHAN_VIEN → TM_Users...\n');

  if (!CRM_SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error('❌ Thiếu env vars');
    process.exit(1);
  }

  const auth = new JWT({
    email:  CLIENT_EMAIL,
    key:    PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const crmDoc = new GoogleSpreadsheet(CRM_SHEET_ID, auth);
  await crmDoc.loadInfo();
  console.log(`📊 CRM Sheet: "${crmDoc.title}"`);

  const nvSheet = crmDoc.sheetsByTitle['NHAN_VIEN'];
  if (!nvSheet) {
    console.error('❌ Không tìm thấy sheet NHAN_VIEN.');
    process.exit(1);
  }

  const rows = await nvSheet.getRows();
  const rawData = rows.map(r => r.toObject() as Record<string, string>);

  // In mẫu dữ liệu thực tế để debug
  const sample = rawData.find(r => r.id_nhan_vien && r.email);
  if (sample) {
    console.log('🔍 Mẫu 1 dòng dữ liệu (các trường quan trọng):');
    ['id_nhan_vien','ho_ten','email','vai_tro','employee_type','trang_thai','phong_KD','khu_vuc'].forEach(k => {
      if (sample[k] !== undefined) console.log(`   ${k.padEnd(18)}: "${sample[k]}"`);
    });
    console.log();
  }

  // Thống kê giá trị thực tế
  const vaiTroValues = [...new Set(rawData.map(r => r.vai_tro || '(trống)'))].slice(0, 10);
  const etValues     = [...new Set(rawData.map(r => r.employee_type || '(trống)'))].slice(0, 15);
  const ttValues     = [...new Set(rawData.map(r => r.trang_thai || '(trống)'))].slice(0, 10);

  console.log(`📋 vai_tro gặp được: ${vaiTroValues.join(' | ')}`);
  console.log(`📋 employee_type  : ${etValues.join(' | ')}`);
  console.log(`📋 trang_thai     : ${ttValues.join(' | ')}\n`);

  // Lọc nhân viên hợp lệ
  const employees = rawData.filter(r => r.email && r.id_nhan_vien);
  console.log(`✅ ${employees.length} nhân viên hợp lệ (có email + id)\n`);

  // Tạo phòng ban từ phong_KD
  const deptMap = new Map<string, string>();
  employees.forEach(nv => {
    const dept = (nv.phong_KD || nv.khu_vuc || 'Chưa phân công').trim();
    if (!deptMap.has(dept)) {
      const slug = dept.toLowerCase().replace(/[^\w]/g, '-').slice(0, 20).replace(/-+$/, '');
      deptMap.set(dept, `dept-${slug}`);
    }
  });

  const tmDepts = Array.from(deptMap.entries()).map(([name, id]) => ({
    dept_id: id,
    name,
    code: name.replace(/phòng\s*/i, '').trim().slice(0, 12).toUpperCase().replace(/\s+/g, '_') || id,
    manager_id: '',
    parent_dept_id: '',
    is_active: 'TRUE',
    created_at: now,
    updated_at: now,
  }));

  // Map sang TM_Users
  const tmUsers = employees.map(nv => ({
    user_id:       nv.id_nhan_vien.trim(),
    email:         (nv.email || '').trim().toLowerCase(),
    full_name:     (nv.ho_ten || '').trim(),
    role:          getRole(nv.vai_tro || '', nv.employee_type || ''),
    department_id: deptMap.get((nv.phong_KD || nv.khu_vuc || 'Chưa phân công').trim()) || '',
    employee_type: (nv.employee_type || '').trim(),
    is_active:     getIsActive(nv.trang_thai || ''),
    avatar_url:    (nv.avatar_url || '').trim(),
    created_at:    now,
    updated_at:    now,
  }));

  // Ghi vào TM sheet
  const tmDoc = CRM_SHEET_ID === TM_SHEET_ID
    ? crmDoc
    : new GoogleSpreadsheet(TM_SHEET_ID, auth);
  if (CRM_SHEET_ID !== TM_SHEET_ID) await tmDoc.loadInfo();

  // TM_Departments
  const deptSheet = tmDoc.sheetsByTitle['TM_Departments'];
  if (deptSheet) {
    await deptSheet.clearRows();
    await deptSheet.addRows(tmDepts as never[]);
    console.log(`✅ TM_Departments: ${tmDepts.length} phòng ban`);
    tmDepts.forEach(d => console.log(`   - ${d.name}`));
  }

  // TM_Users
  const userSheet = tmDoc.sheetsByTitle['TM_Users'];
  if (userSheet) {
    await userSheet.clearRows();
    await userSheet.addRows(tmUsers as never[]);

    // Thống kê
    const byRole: Record<string, number> = {};
    tmUsers.forEach(u => { byRole[u.role] = (byRole[u.role] || 0) + 1; });
    const activeCount = tmUsers.filter(u => u.is_active === 'TRUE').length;

    console.log(`\n✅ TM_Users: ${tmUsers.length} nhân viên (${activeCount} đang làm việc)`);
    console.log('\n📊 Phân bổ quyền:');
    const roleLabel: Record<string, string> = { director: 'Admin/Giám đốc', manager: 'Trưởng phòng', team_leader: 'Team Leader', staff: 'Nhân viên' };
    Object.entries(byRole).sort().forEach(([role, count]) =>
      console.log(`   ${(roleLabel[role] || role).padEnd(16)}: ${count} người`)
    );

    console.log('\n📋 Tài khoản có thể dùng để đăng nhập (active):');
    console.log('─'.repeat(62));
    tmUsers
      .filter(u => u.is_active === 'TRUE' && u.email)
      .slice(0, 15)
      .forEach(u => console.log(`  ${u.email.padEnd(38)} [${u.role}]`));
    const total = tmUsers.filter(u => u.is_active === 'TRUE').length;
    if (total > 15) console.log(`  ... và ${total - 15} người khác`);
  }

  console.log('\n🎉 Đồng bộ hoàn tất!');
  console.log('   Đăng nhập bằng email + mật khẩu CRM thông thường của nhân viên.');
}

main().catch(err => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
