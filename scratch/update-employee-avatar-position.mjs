import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\nhan-vien\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Tìm thẻ img trong renderAvatar và bổ sung objectPosition: 'center 15%'
const target = `            <img
              src={nv.avatar_url}
              alt={nv.ho_ten}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '100%',
                minWidth: '100%',
                objectFit: 'cover',
                display: 'block'
              }}`;

const replacement = `            <img
              src={nv.avatar_url}
              alt={nv.ho_ten}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '100%',
                minWidth: '100%',
                objectFit: 'cover',
                objectPosition: 'center 15%',
                display: 'block'
              }}`;

if (content.indexOf(target) === -1) {
  console.error('Không tìm thấy khớp thẻ img của renderAvatar');
  process.exit(1);
}

content = content.replace(target, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Cập nhật objectPosition: "center 15%" cho avatar Nhân viên thành công!');
