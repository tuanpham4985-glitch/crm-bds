// ============================================================
// CRM BĐS — Kiểm tra email nhân sự (CHỈ ĐỌC, không sửa gì)
//
// Đọc THẲNG sheet NHAN_VIEN (nguồn sự thật) và liệt kê các email có vấn đề:
//   - Trống (không có email)
//   - Sai định dạng (thiếu @, có dấu cách, thiếu tên miền…)
//   - Email placeholder tự sinh (@placeholder.local)
//   - Trùng nhau (2+ người dùng chung 1 email)
//
// Mặc định chỉ soi nhân viên đang làm (bỏ "Nghỉ việc") vì chỉ họ mới nhận
// thông báo. Thêm --all để soi cả người đã nghỉ.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/check-employee-emails.ts
//   npx tsx --env-file=.env.local scripts/check-employee-emails.ts --all
// ============================================================

import { getNhanVien } from '../src/lib/google-sheets';

const includeAll = process.argv.includes('--all');

// Định dạng email cơ bản: 1 ký tự @ ở giữa, có tên miền và phần mở rộng.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const all = await getNhanVien();
  const rows = includeAll ? all : all.filter(nv => nv.trang_thai !== 'Nghỉ việc');

  const empty: typeof rows = [];
  const invalid: { nv: (typeof rows)[number]; reason: string }[] = [];
  const placeholder: typeof rows = [];

  // Gom theo email (chuẩn hoá lower/trim) để dò trùng
  const byEmail = new Map<string, typeof rows>();

  for (const nv of rows) {
    const raw = (nv.email ?? '').trim();
    if (!raw) { empty.push(nv); continue; }

    if (/@placeholder\.local$/i.test(raw)) { placeholder.push(nv); continue; }

    const reasons: string[] = [];
    if (/\s/.test(raw)) reasons.push('có dấu cách');
    if (!raw.includes('@')) reasons.push('thiếu @');
    if (!EMAIL_RE.test(raw)) reasons.push('sai định dạng');
    if (reasons.length) invalid.push({ nv, reason: [...new Set(reasons)].join(', ') });

    const key = raw.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key)!.push(nv);
  }

  const dups = [...byEmail.entries()].filter(([, list]) => list.length > 1);

  const line = (nv: (typeof rows)[number]) =>
    `${nv.id_nhan_vien} | ${nv.ho_ten} | ${nv.email || '(trống)'} | ${nv.trang_thai ?? ''}`;

  console.log(`\n[check-email] Đã soi ${rows.length} nhân viên${includeAll ? ' (kể cả đã nghỉ)' : ' đang làm'}.\n`);

  console.log(`❌ SAI ĐỊNH DẠNG (${invalid.length}):`);
  invalid.length ? invalid.forEach(x => console.log(`  - ${line(x.nv)}  → ${x.reason}`)) : console.log('  (không có)');

  console.log(`\n⚠️  KHÔNG CÓ EMAIL (${empty.length}):`);
  empty.length ? empty.forEach(nv => console.log(`  - ${line(nv)}`)) : console.log('  (không có)');

  console.log(`\n🔁 EMAIL PLACEHOLDER (${placeholder.length}):`);
  placeholder.length ? placeholder.forEach(nv => console.log(`  - ${line(nv)}`)) : console.log('  (không có)');

  console.log(`\n👥 TRÙNG EMAIL (${dups.length} nhóm):`);
  if (!dups.length) console.log('  (không có)');
  for (const [email, list] of dups) {
    console.log(`  • ${email}`);
    list.forEach(nv => console.log(`      - ${line(nv)}`));
  }

  const totalIssues = invalid.length + empty.length + placeholder.length + dups.length;
  console.log(`\n[check-email] Tổng số điểm cần xem: ${totalIssues}. Sửa trên sheet NHAN_VIEN rồi bấm "Đồng bộ nhân sự".\n`);
}

main().catch(err => {
  console.error('[check-email] LỖI:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
