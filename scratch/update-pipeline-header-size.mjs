import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\pipeline\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Tìm khối badges cũ và thay thế bằng khối mới to rõ ràng và sắc nét hơn
const target = `          <div style={{ fontSize: '0.9rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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

const replacement = `          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ 
              background: '#f1f5f9', 
              color: '#334155', 
              padding: '6px 14px', 
              borderRadius: '14px', 
              fontWeight: 700, 
              fontSize: '0.88rem', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}>
              <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>📊</span> {filteredPipelines.length} deal
            </span>
            <span style={{ 
              background: 'rgba(99, 102, 241, 0.08)', 
              color: '#4f46e5', 
              padding: '6px 15px', 
              borderRadius: '14px', 
              fontWeight: 700, 
              fontSize: '0.88rem', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              border: '1px solid rgba(99, 102, 241, 0.15)',
              boxShadow: '0 1px 2px rgba(99, 102, 241, 0.05)'
            }}>
              <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>💰</span> Tổng giá trị: <span style={{ color: '#4f46e5', fontWeight: 850 }}>{formatCurrency(totalValue)}</span>
            </span>
            {canViewProfit && (
              <span style={{ 
                background: 'rgba(212, 175, 55, 0.15)', 
                color: '#b45309', 
                padding: '6px 16px', 
                borderRadius: '14px', 
                fontWeight: 800, 
                fontSize: '0.88rem',
                border: '1.5px solid rgba(212, 175, 55, 0.45)',
                boxShadow: '0 2px 6px rgba(212,175,55,0.18)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>💎</span> Tổng lợi nhuận: <span style={{ color: '#d97706', fontWeight: 950 }}>{formatCurrency(totalProfit)}</span>
              </span>
            )}
          </div>`;

if (content.indexOf(target) === -1) {
  console.error('Không tìm thấy khớp chính xác khối badges cũ');
  process.exit(1);
}

content = content.replace(target, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Tăng kích thước chữ và icon Header Pipeline thành công!');
