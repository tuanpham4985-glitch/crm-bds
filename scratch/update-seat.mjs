import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Tìm phần hiển thị FLIGHT, SEAT, CLASS và thay thế bằng phiên bản chống tràn chữ cho mobile
const target = `<div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                        <div>
                          <span style={{ fontSize: '0.55rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>FLIGHT</span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1e293b' }}>VIC2026</span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.55rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>SEAT</span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1e293b' }}>01A / VIP</span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.55rem', color: '#94a3b8', display: 'block', fontWeight: 600 }}>CLASS</span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#d4af37' }}>FIRST</span>
                        </div>
                      </div>`;

const replacement = `<div style={{ display: 'flex', gap: '10px', marginTop: '4px', flexWrap: 'nowrap' }}>
                        <div style={{ flexShrink: 0 }}>
                          <span style={{ fontSize: '0.52rem', color: '#94a3b8', display: 'block', fontWeight: 600, whiteSpace: 'nowrap' }}>FLIGHT</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>VIC2026</span>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          <span style={{ fontSize: '0.52rem', color: '#94a3b8', display: 'block', fontWeight: 600, whiteSpace: 'nowrap' }}>SEAT</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>01A/VIP</span>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          <span style={{ fontSize: '0.52rem', color: '#94a3b8', display: 'block', fontWeight: 600, whiteSpace: 'nowrap' }}>CLASS</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d4af37', whiteSpace: 'nowrap' }}>FIRST</span>
                        </div>
                      </div>`;

if (content.indexOf(target) === -1) {
  // Thử so khớp có thể có sự khác biệt về khoảng trắng thụt lề
  console.log('Không tìm thấy khớp chính xác, thử regex...');
  const regex = /<div style=\{\{\s*display:\s*'flex',\s*gap:\s*'16px',\s*marginTop:\s*'4px'\s*\}\}>\s*<div>\s*<span style=\{\{\s*fontSize:\s*'0.55rem',\s*color:\s*'#94a3b8',\s*display:\s*'block',\s*fontWeight:\s*600\s*\}\}>FLIGHT<\/span>\s*<span style=\{\{\s*fontSize:\s*'0.7rem',\s*fontWeight:\s*700,\s*color:\s*'#1e293b'\s*\}\}>VIC2026<\/span>\s*<\/div>\s*<div>\s*<span style=\{\{\s*fontSize:\s*'0.55rem',\s*color:\s*'#94a3b8',\s*display:\s*'block',\s*fontWeight:\s*600\s*\}\}>SEAT<\/span>\s*<span style=\{\{\s*fontSize:\s*'0.7rem',\s*fontWeight:\s*700,\s*color:\s*'#1e293b'\s*\}\}>01A\s*\/\s*VIP<\/span>\s*<\/div>\s*<div>\s*<span style=\{\{\s*fontSize:\s*'0.55rem',\s*color:\s*'#94a3b8',\s*display:\s*'block',\s*fontWeight:\s*600\s*\}\}>CLASS<\/span>\s*<span style=\{\{\s*fontSize:\s*'0.7rem',\s*fontWeight:\s*700,\s*color:\s*'#d4af37'\s*\}\}>FIRST<\/span>\s*<\/div>\s*<\/div>/g;
  
  if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Cập nhật Flight/Seat/Class bằng regex thành công!');
  } else {
    console.error('Không tìm thấy cấu trúc FLIGHT SEAT CLASS phù hợp');
    process.exit(1);
  }
} else {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Cập nhật Flight/Seat/Class thành công!');
}
