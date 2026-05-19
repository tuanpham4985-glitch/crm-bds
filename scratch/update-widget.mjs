import fs from 'fs';
import path from 'path';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Khớp từ '// ─── Global Champion Widget Component ───' đến hết file
const startIndex = content.indexOf('// ─── Global Champion Widget Component');
if (startIndex === -1) {
  console.error('Không tìm thấy tag bắt đầu của Widget');
  process.exit(1);
}

const beforeWidget = content.substring(0, startIndex);

const newWidgetCode = `// ─── Global Champion Widget Component ───────────────────────────────────────
function GlobalChampionWidget({ data }: { data: any[] }) {
  // Mốc doanh thu
  const LEVELS = [
    {
      id: 'europe',
      target: 168000000000, // 168 tỷ
      title: 'EUROPE TOUR',
      condition: '168 TỶ',
      bgImg: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=400&auto=format&fit=crop', // Eiffel Tower
      color: '#fbbf24',
      badge: '👑 Đẳng Cấp Châu Âu'
    },
    {
      id: 'japan',
      target: 80000000000, // 80 tỷ
      title: 'JAPAN TOUR',
      condition: '80 TỶ',
      bgImg: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=400&auto=format&fit=crop', // Japan temple
      color: '#38bdf8',
      badge: '🌸 Chuyến Đi Nhật Bản'
    },
    {
      id: 'singapore',
      target: 36000000000, // 36 tỷ
      title: 'SINGAPORE - MALAYSIA',
      condition: '36 TỶ',
      bgImg: 'https://images.unsplash.com/photo-1597655601841-214a4cfe8b2c?q=80&w=400&auto=format&fit=crop', // Marina Bay Sands
      color: '#f472b6',
      badge: '✈️ Hành Trình Sing-Mã'
    }
  ];

  // Phân loại sale theo mốc đạt được
  const achievers = {
    europe: [] as any[],
    japan: [] as any[],
    singapore: [] as any[]
  };

  data.forEach(sale => {
    if (sale.doanh_thu >= LEVELS[0].target) achievers.europe.push(sale);
    else if (sale.doanh_thu >= LEVELS[1].target) achievers.japan.push(sale);
    else if (sale.doanh_thu >= LEVELS[2].target) achievers.singapore.push(sale);
  });

  return (
    <div className="chart-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '625px', maxHeight: '625px', border: '1.5px solid #d4af37' }}>
      {/* Aviation Theme Title Header */}
      <div style={{
        padding: '18px 24px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#fff',
        borderBottom: '3px solid #d4af37',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ color: '#d4af37', fontSize: '0.75rem', fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>
            CỰC CHIẾN 2026
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.5px', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            GLOBAL CHAMPION ✈️
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.2)', paddingRight: 10 }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, letterSpacing: 1 }}>VICTORY AIRLINES</div>
            <div style={{ fontSize: '0.6rem', color: '#cbd5e1' }}>BOARDING PASS SYSTEM</div>
          </div>
          <div style={{ fontSize: '1.8rem', lineHeight: 1 }}>🎫</div>
        </div>
      </div>

      {/* Ticket List Body */}
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', background: '#f8fafc', overflowY: 'auto' }}>
        {LEVELS.map(level => {
          const list = achievers[level.id as keyof typeof achievers];
          
          return (
            <div key={level.id} style={{
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '14px',
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(212,175,55,0.12)',
              background: '#fff',
              border: '1.5px solid #d4af37',
              position: 'relative'
            }}>
              {/* Ticket Tear Notch Top */}
              <div style={{
                position: 'absolute', top: '-10px', right: '28%',
                width: '18px', height: '18px', borderRadius: '50%',
                background: '#f8fafc', borderBottom: '1.5px solid #d4af37',
                zIndex: 10
              }} />
              {/* Ticket Tear Notch Bottom */}
              <div style={{
                position: 'absolute', bottom: '-10px', right: '28%',
                width: '18px', height: '18px', borderRadius: '50%',
                background: '#f8fafc', borderTop: '1.5px solid #d4af37',
                zIndex: 10
              }} />

              {/* Main Ticket Area */}
              <div style={{ display: 'flex', height: '105px' }}>
                {/* Left: Main Ticket Stub (72% width) */}
                <div style={{
                  flex: 1,
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderRight: '1.5px dashed #d4af37',
                  position: 'relative'
                }}>
                  {/* Airplane Logo & Boarding Pass Text */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>
                    <span style={{ color: '#d4af37', fontWeight: 800 }}>✈️ VICTORY AIRLINES</span>
                    <span style={{ letterSpacing: '0.5px' }}>BOARDING PASS</span>
                  </div>

                  {/* Destination Info & Destination Symbol Pic */}
                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px', alignItems: 'center' }}>
                    {/* Destination Symbol Pic */}
                    <img 
                      src={level.bgImg} 
                      alt={level.title} 
                      style={{ 
                        width: '75px', 
                        height: '50px', 
                        borderRadius: '6px', 
                        objectFit: 'cover', 
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
                      }} 
                    />
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>DESTINATION:</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{level.title}</div>
                      
                      <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
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
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Ticket Stub Receipt (28% width) */}
                <div style={{
                  width: '28%',
                  padding: '10px 8px',
                  background: '#fffdf6',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  position: 'relative'
                }}>
                  {/* Custom QR Code simulator */}
                  <div style={{ 
                    width: '30px', 
                    height: '30px', 
                    background: '#0f172a', 
                    padding: '2px', 
                    borderRadius: '4px', 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(4, 1fr)', 
                    gap: '1px' 
                  }}>
                    {Array.from({ length: 16 }).map((_, i) => (
                      <div key={i} style={{ background: (i % 3 === 0 || i % 7 === 0) ? '#fff' : '#0f172a' }} />
                    ))}
                  </div>

                  {/* Target Revenue Badge */}
                  <div style={{ 
                    background: 'linear-gradient(135deg, #d4af37 0%, #b89028 100%)', 
                    color: '#fff', 
                    fontSize: '0.75rem', 
                    fontWeight: 800, 
                    padding: '2px 0', 
                    borderRadius: '4px', 
                    textAlign: 'center', 
                    width: '95%',
                    boxShadow: '0 2px 4px rgba(212,175,55,0.3)',
                    letterSpacing: '0.5px'
                  }}>
                    {level.condition}
                  </div>

                  {/* Custom Barcode simulator */}
                  <div style={{ display: 'flex', gap: '1px', height: '14px', width: '90%', alignItems: 'stretch', opacity: 0.8 }}>
                    {[1,2,1,3,1,1,2,1,2,1,1,2,1].map((w, idx) => (
                      <div key={idx} style={{ flex: w, background: '#0f172a' }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Achievers list footer bar */}
              <div style={{
                background: '#fafbfc',
                borderTop: '1px solid #f1f5f9',
                padding: '6px 12px',
                minHeight: '38px',
                display: 'flex',
                alignItems: 'center'
              }}>
                {list.length === 0 ? (
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>
                    Chưa có chiến binh đạt mốc này
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {list.map(emp => {
                      const initials = emp.nhan_vien.split(' ').map((w: string) => w[0]).slice(-2).join('');
                      return (
                        <div key={emp.nhan_vien} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#fff',
                          padding: '2px 8px 2px 2px',
                          borderRadius: '20px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}>
                          {emp.avatar_url ? (
                            <img src={emp.avatar_url} alt={emp.nhan_vien} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ 
                              width: 20, 
                              height: 20, 
                              borderRadius: '50%', 
                              background: 'linear-gradient(135deg, #d4af37 0%, #b89028 100%)', 
                              color: '#fff', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              fontSize: '0.55rem', 
                              fontWeight: 700 
                            }}>
                              {initials}
                            </div>
                          )}
                          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#334155' }}>
                            {emp.nhan_vien}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
`;

fs.writeFileSync(filePath, beforeWidget + newWidgetCode, 'utf8');
console.log('Cập nhật widget thành công!');
