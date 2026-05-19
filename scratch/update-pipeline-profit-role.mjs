import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\pipeline\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Tìm dòng định nghĩa canViewProfit cũ và thay thế bằng điều kiện hỗ trợ vai_tro === 'Admin'
const target = "const canViewProfit = user && ['Admin', 'Chủ tịch', 'TGĐ'].includes(user.employee_type || '');";

const replacement = `const canViewProfit = user && (
    user.vai_tro === 'Admin' ||
    ['Admin', 'Chủ tịch', 'TGĐ'].includes(user.employee_type || '')
  );`;

if (content.indexOf(target) === -1) {
  // Thử so khớp có thể có sự khác biệt về khoảng trắng thụt lề
  console.log('Không tìm thấy khớp chính xác, thử regex...');
  const regex = /const\s*canViewProfit\s*=\s*user\s*&&\s*\['Admin',\s*'Chủ tịch',\s*'TGĐ'\]\.includes\(user\.employee_type\s*\|\|\s*''\);/;
  if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Cập nhật canViewProfit bằng regex thành công!');
  } else {
    console.error('Không tìm thấy cấu trúc canViewProfit phù hợp');
    process.exit(1);
  }
} else {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Cập nhật canViewProfit thành công!');
}
