import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\pipeline\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Định nghĩa regex tìm dòng totalValue
const regex = /const\s*totalValue\s*=\s*activeDeals\.reduce\(\(s,\s*pl\)\s*=>\s*s\s*\+\s*pl\.gia_tri_thuc_te,\s*0\);/;

const replacement = `const totalValue = activeDeals.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0);
  const totalProfit = activeDeals.reduce((s, pl) => s + (pl.loi_nhuan || 0), 0);`;

if (!regex.test(content)) {
  console.error('Không tìm thấy dòng const totalValue = activeDeals.reduce...');
  process.exit(1);
}

content = content.replace(regex, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Sửa lỗi tìm biến totalProfit thành công!');
