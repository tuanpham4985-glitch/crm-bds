import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Tìm phần Podium container và thay thế bằng thiết kế 3D 2 lớp (Bệ đỡ + Thân bục) hoàn toàn mới
const startTag = '{/* Podium Top 3 */}';
const endTag = '{/* Danh sách còn lại (từ hạng 4 trở đi, hoặc tất cả nếu < 2 người) */}';

const startIndex = content.indexOf(startTag);
const endIndex = content.indexOf(endTag);

if (startIndex === -1 || endIndex === -1) {
  console.error('Không tìm thấy tag bắt đầu hoặc kết thúc của Podium');
  process.exit(1);
}

const beforePodium = content.substring(0, startIndex);
const afterPodium = content.substring(endIndex);

const newPodiumCode = `{/* Podium Top 3 */}
              {data.doanh_thu_theo_sale.length >= 2 && (
                <>
                  <style>{\`
                    @keyframes float-rank-1 {
                      0% { transform: translateY(-16px); }
                      50% { transform: translateY(-24px); }
                      100% { transform: translateY(-16px); }
                    }
                    @keyframes float-rank-2 {
                      0% { transform: translateY(0px); }
                      50% { transform: translateY(-6px); }
                      100% { transform: translateY(0px); }
                    }
                    @keyframes float-rank-3 {
                      0% { transform: translateY(12px); }
                      50% { transform: translateY(6px); }
                      100% { transform: translateY(12px); }
                    }
                    .floating-platform-1 { animation: float-rank-1 4s ease-in-out infinite; }
                    .floating-platform-2 { animation: float-rank-2 4.3s ease-in-out infinite; }
                    .floating-platform-3 { animation: float-rank-3 4.6s ease-in-out infinite; }
                  \`}</style>
                  
                  <div className="podium-container" style={{
                    background: 'radial-gradient(circle at center, #0b1329 0%, #030712 100%)',
                    borderRadius: '20px',
                    padding: '50px 16px 20px',
                    minHeight: '345px',
                    display: 'flex',
                    justifyContent: 'space-around',
                    alignItems: 'flex-end',
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1.5px solid rgba(255,255,255,0.03)',
                    boxShadow: 'inset 0 0 60px rgba(0,0,0,0.9), 0 15px 35px rgba(0,0,0,0.5)',
                    gap: '12px'
                  }}>
                    {/* Futuristic mesh background decoration */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      backgroundImage: 'linear-gradient(rgba(99,102,241,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.015) 1px, transparent 1px)',
                      backgroundSize: '30px 30px',
                      pointerEvents: 'none',
                      opacity: 0.9
                    }} />

                    {/* Geometric mesh grid (Top right circle glow) */}
                    <div style={{
                      position: 'absolute', top: '-50px', right: '-50px', width: '250px', height: '250px',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)',
                      pointerEvents: 'none'
                    }} />

                    {/* Sắp xếp: Hạng 2 - Hạng 1 - Hạng 3 */}
                    {[1, 0, 2].map((rankIdx) => {
                      const sale = data.doanh_thu_theo_sale[rankIdx];
                      if (!sale) return null;
                      const rank = rankIdx + 1;
                      
                      const initials = sale.nhan_vien
                        .split(' ')
                        .map((w: string) => w[0])
                        .slice(-2)
                        .join('');

                      // Premium 2-layer 3D Platform styles
                      const config: any = {
                        1: {
                          glow: 'rgba(251,191,36,0.3)',
                          platformTopStyle: {
                            width: '105px',
                            height: '24px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(200,225,255,0.85) 100%)',
                            border: '1.5px solid #ffffff',
                            boxShadow: '0 0 15px rgba(255,255,255,0.8), inset 0 0 8px rgba(255,255,255,1)',
                            zIndex: 3,
                            transform: 'translateY(12px)'
                          },
                          platformFrontStyle: {
                            width: '105px',
                            height: '56px',
                            background: 'linear-gradient(to bottom, rgba(219,234,254,0.8) 0%, rgba(147,197,253,0.5) 100%)',
                            borderLeft: '1.5px solid #ffffff',
                            borderRight: '1.5px solid #ffffff',
                            borderBottom: '3.5px solid #fbbf24',
                            borderBottomLeftRadius: '14px',
                            borderBottomRightRadius: '14px',
                            boxShadow: '0 8px 25px rgba(0,0,0,0.5), 0 0 30px rgba(251,191,36,0.3)',
                            position: 'relative',
                            zIndex: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          },
                          numberStyle: {
                            background: 'linear-gradient(to bottom, #fff6cc, #fbbf24)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontSize: '2.5rem',
                            fontWeight: 900,
                            textShadow: '0 2px 5px rgba(0,0,0,0.5)',
                            lineHeight: 1
                          },
                          avatarFrameStyle: {
                            width: '74px',
                            height: '74px',
                            borderRadius: '50%',
                            border: '3.5px solid #d4af37',
                            padding: '3px',
                            background: 'radial-gradient(circle, #fef08a 0%, #ca8a04 100%)',
                            boxShadow: '0 0 25px rgba(251,191,36,0.6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            zIndex: 4
                          },
                          textColor: '#fde047',
                          crownEmoji: '👑',
                          beamBg: 'linear-gradient(to top, rgba(251,191,36,0.2) 0%, transparent 80%)'
                        },
                        2: {
                          glow: 'rgba(148,163,184,0.25)',
                          platformTopStyle: {
                            width: '95px',
                            height: '20px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
                            border: '1.5px solid rgba(255,255,255,0.4)',
                            boxShadow: '0 0 10px rgba(255,255,255,0.3)',
                            zIndex: 3,
                            transform: 'translateY(10px)'
                          },
                          platformFrontStyle: {
                            width: '95px',
                            height: '46px',
                            background: 'linear-gradient(to bottom, #475569 0%, #1e293b 100%)',
                            borderLeft: '1.5px solid #94a3b8',
                            borderRight: '1.5px solid #94a3b8',
                            borderBottom: '3px solid #cbd5e1',
                            borderTop: '2px solid #38bdf8', // Khe LED xanh dương
                            borderBottomLeftRadius: '12px',
                            borderBottomRightRadius: '12px',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.5), 0 0 15px rgba(148,163,184,0.2)',
                            position: 'relative',
                            zIndex: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          },
                          numberStyle: {
                            background: 'linear-gradient(to bottom, #ffffff, #cbd5e1)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontSize: '2.0rem',
                            fontWeight: 900,
                            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                            lineHeight: 1
                          },
                          avatarFrameStyle: {
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            border: '3.5px solid #cbd5e1',
                            padding: '2.5px',
                            background: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)',
                            boxShadow: '0 0 20px rgba(203,213,225,0.45)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            zIndex: 4
                          },
                          textColor: '#94a3b8',
                          crownEmoji: null,
                          beamBg: 'linear-gradient(to top, rgba(148,163,184,0.12) 0%, transparent 80%)'
                        },
                        3: {
                          glow: 'rgba(234,88,12,0.2)',
                          platformTopStyle: {
                            width: '90px',
                            height: '18px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #ea580c 0%, #9a3412 100%)',
                            border: '1.5px solid rgba(251,146,60,0.3)',
                            boxShadow: '0 0 8px rgba(234,88,12,0.2)',
                            zIndex: 3,
                            transform: 'translateY(9px)'
                          },
                          platformFrontStyle: {
                            width: '90px',
                            height: '40px',
                            background: 'linear-gradient(to bottom, #7c2d12 0%, #431407 100%)',
                            borderLeft: '1.5px solid #ea580c',
                            borderRight: '1.5px solid #ea580c',
                            borderBottom: '3px solid #b45309',
                            borderTop: '2px solid #f97316', // Khe LED màu cam đồng
                            borderBottomLeftRadius: '12px',
                            borderBottomRightRadius: '12px',
                            boxShadow: '0 6px 15px rgba(0,0,0,0.5), 0 0 10px rgba(234,88,12,0.15)',
                            position: 'relative',
                            zIndex: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          },
                          numberStyle: {
                            background: 'linear-gradient(to bottom, #ffedd5, #ea580c)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontSize: '1.8rem',
                            fontWeight: 900,
                            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                            lineHeight: 1
                          },
                          avatarFrameStyle: {
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            border: '3px solid #b45309',
                            boxShadow: '0 0 15px rgba(180,83,9,0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            zIndex: 4,
                            // Metallic bronze coin finish
                            background: 'radial-gradient(circle, #a16207 0%, #78350f 60%, #451a03 100%)'
                          },
                          textColor: '#ea580c',
                          crownEmoji: null,
                          beamBg: 'linear-gradient(to top, rgba(234,88,12,0.1) 0%, transparent 80%)'
                        }
                      }[rank as 1 | 2 | 3];

                      return (
                        <div 
                          key={sale.nhan_vien} 
                          className={\`floating-platform-\${rank}\`}
                          style={{
                            flex: 1,
                            maxWidth: rank === 1 ? '130px' : '110px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            position: 'relative',
                            transition: 'all 0.3s ease',
                            zIndex: rank === 1 ? 5 : 2
                          }}
                        >
                          {/* Crown with crescent moon styled for Rank 1 */}
                          {rank === 1 && (
                            <span 
                              style={{ 
                                position: 'absolute', top: '-26px', zIndex: 10, fontSize: '1.9rem',
                                filter: 'drop-shadow(0 2px 8px rgba(251,191,36,0.8))'
                              }}
                            >
                              👑
                            </span>
                          )}

                          {/* Futuristic Upward Light Beam */}
                          <div style={{
                            position: 'absolute', bottom: '65px', width: rank === 1 ? '90px' : '75px', height: '160px',
                            background: config.beamBg,
                            clipPath: 'polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)',
                            pointerEvents: 'none',
                            zIndex: 1,
                            opacity: 0.8
                          }} />

                          {/* Avatar Frame Container */}
                          <div style={{ ...config.avatarFrameStyle, marginBottom: '8px' }}>
                            <div style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: '50%',
                              overflow: 'hidden',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: rank === 3 ? 'none' : '#0f172a',
                              border: rank === 3 ? 'none' : '1.5px solid rgba(255,255,255,0.1)'
                            }}>
                              {/* If Rank 3 (Bronze Medallion) as per mockup, render the elegant HT medallion */}
                              {rank === 3 ? (
                                <div style={{
                                  fontSize: '1.3rem',
                                  fontWeight: 900,
                                  color: '#ffedd5',
                                  textShadow: '1px 2px 4px rgba(0,0,0,0.6)',
                                  letterSpacing: '0.5px'
                                }}>
                                  HT
                                </div>
                              ) : sale.avatar_url ? (
                                <img 
                                  src={sale.avatar_url} 
                                  alt={sale.nhan_vien}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                  }}
                                />
                              ) : (
                                <div style={{
                                  fontSize: rank === 1 ? '1.25rem' : '1.05rem',
                                  fontWeight: 800,
                                  color: '#fff'
                                }}>
                                  {initials}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Name label - warm goldish sand color */}
                          <div style={{
                            fontSize: rank === 1 ? '0.82rem' : '0.75rem',
                            fontWeight: 800,
                            color: '#e2b857',
                            textAlign: 'center',
                            marginTop: '4px',
                            width: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            textShadow: '0 2px 4px rgba(0,0,0,0.9)',
                            zIndex: 3
                          }}>
                            {sale.nhan_vien}
                          </div>

                          {/* Score Pill Box - Semi-transparent pill */}
                          <div style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: '20px',
                            padding: '3px 10px',
                            marginTop: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 3,
                            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                            marginBottom: '12px'
                          }}>
                            <span style={{
                              fontSize: rank === 1 ? '0.75rem' : '0.7rem',
                              fontWeight: 700,
                              color: '#cbd5e1',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}>
                              {formatCurrency(sale.doanh_thu)} <span style={{ color: '#fbbf24' }}>⭐</span>
                            </span>
                          </div>

                          {/* 3D Platform Container (2 Layers: Platform Top + Platform Front) */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            width: '100%',
                            position: 'relative',
                            zIndex: 2
                          }}>
                            {/* Platform Top (Ellipse) */}
                            <div style={config.platformTopStyle} />
                            
                            {/* Platform Front (Rectangle containing Rank Number centered) */}
                            <div style={config.platformFrontStyle}>
                              <div style={config.numberStyle}>
                                {rank}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
`;

fs.writeFileSync(filePath, beforePodium + newPodiumCode + afterPodium, 'utf8');
console.log('Cập nhật Podium V3 (Bệ đỡ 2 lớp) thành công!');
