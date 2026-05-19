import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\pipeline\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Tìm đoạn thẻ <p> cũ trong page-header-left và thay thế bằng phiên bản pill badges siêu nổi bật
const target = `          <p>
            {filteredPipelines.length} deal · Tổng giá trị: {formatCurrency(totalValue)}
            {canViewProfit && \` · Tổng lợi nhuận: \${formatCurrency(totalProfit)}\`}
          </p>`;

const replacement = `          <div style={{ fontSize: '0.9rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              📊 {filteredPipelines.length} deal
            </span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <span style={{ background: 'rgba(99, 102, 241, 0.08)', color: '#4f46e5', padding: '4px 10.5px', borderRadius: '12px', fontWeight: 700, fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              💰 Tổng giá trị: <span style={{ color: '#6366f1', fontWeight: 800 }}>{formatCurrency(totalValue)}</span>
            </span>
            {canViewProfit && (
              <>
                <span style={{ color: '#cbd5e1' }}>·</span>
                <span style={{ 
                  background: 'rgba(212, 175, 55, 0.15)', 
                  color: '#b45309', 
                  padding: '4px 12px', 
                  borderRadius: '12px', 
                  fontWeight: 800, 
                  fontSize: '0.78rem',
                  border: '1.5px solid rgba(212, 175, 55, 0.35)',
                  boxShadow: '0 2px 5px rgba(212,175,55,0.15)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  💎 Tổng lợi nhuận: <span style={{ color: '#d97706', fontWeight: 900 }}>{formatCurrency(totalProfit)}</span>
                </span>
              </>
            )}
          </div>`;

if (content.indexOf(target) === -1) {
  // Thử bằng regex an toàn nếu có sự khác biệt về khoảng trắng hoặc CRLF
  console.log('Không tìm thấy khớp chính xác, dùng regex...');
  const regex = /<p>[\s\r\n]*\{filteredPipelines\.length\} deal · Tổng giá trị: \{formatCurrency\(totalValue\)\}[\s\r\n]*\{canViewProfit && ` · Tổng lợi nhuận: \$\{formatCurrency\(totalProfit\)\}`\}[\s\r\n]*<\/p>/;
  
  if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Cập nhật Header Pipeline bằng regex thành công!');
  } else {
    console.error('Không tìm thấy cấu trúc thẻ p phù hợp');
    process.exit(1);
  }
} else {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Cập nhật Header Pipeline thành công!');
}
