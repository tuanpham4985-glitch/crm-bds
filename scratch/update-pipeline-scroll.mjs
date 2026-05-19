import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\pipeline\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Sử dụng regex để tìm kiếm và thay thế bất kể định dạng xuống dòng và khoảng trắng thụt lề
const regex = /\/\*\s*Table\s*View\s*\*\/[\r\n\s]*<div\s*className="card"\s*style=\{\{\s*padding:\s*0,\s*overflow:\s*'hidden'\s*\}\}>[\r\n\s]*<div\s*className="table-wrapper">[\r\n\s]*<table\s*className="data-table">/;

const replacement = `/* Table View */
        <div className="card" style={{ padding: 0, overflow: 'hidden', maxWidth: '100%' }}>
          <div className="table-wrapper" style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table className="data-table" style={{ minWidth: '850px' }}>`;

if (!regex.test(content)) {
  console.error('Không tìm thấy khớp bằng regex cho table-wrapper');
  process.exit(1);
}

content = content.replace(regex, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Cập nhật table-wrapper Pipeline hỗ trợ scroll ngang bằng regex thành công!');
