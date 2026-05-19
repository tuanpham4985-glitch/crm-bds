import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Tìm phần Podium container và thay thế bằng thiết kế 3D floating platform mới
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
                      0% { transform: translateY(-24px) scale(1.08); }
                      50% { transform: translateY(-32px) scale(1.08); }
                      100% { transform: translateY(-24px) scale(1.08); }
                    }
                    @keyframes float-rank-2 {
                      0% { transform: translateY(-8px) scale(1.0); }
                      50% { transform: translateY(-14px) scale(1.0); }
                      100% { transform: translateY(-8px) scale(1.0); }
                    }
                    @keyframes float-rank-3 {
                      0% { transform: translateY(8px) scale(0.94); }
                      50% { transform: translateY(2px) scale(0.94); }
                      100% { transform: translateY(8px) scale(0.94); }
                    }
                    .floating-platform-1 { animation: float-rank-1 4s ease-in-out infinite; }
                    .floating-platform-2 { animation: float-rank-2 4.3s ease-in-out infinite; }
                    .floating-platform-3 { animation: float-rank-3 4.6s ease-in-out infinite; }
                  \`}</style>
                  
                  <div className="podium-container" style={{
                    background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
                    borderRadius: '20px',
                    padding: '45px 16px 30px',
                    minHeight: '270px',
                    display: 'flex',
                    justifyContent: 'space-around',
                    alignItems: 'flex-end',
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1.5px solid rgba(255,255,255,0.05)',
                    boxShadow: 'inset 0 0 50px rgba(0,0,0,0.8), 0 10px 30px rgba(0,0,0,0.3)',
                    gap: '10px'
                  }}>
                    {/* Futuristic grid background decoration */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
                      backgroundSize: '20px 20px',
                      pointerEvents: 'none',
                      opacity: 0.8
                    }} />

                    {/* Glowing perspective ring */}
                    <div style={{
                      position: 'absolute', bottom: '-40px', left: '10%', right: '10%', height: '100px',
                      background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, transparent 70%)',
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

                      // Rank configuration based on prompt guidelines (typed as any to bypass strict TS matching)
                      const config: any = {
                        1: {
                          bg: 'linear-gradient(135deg, rgba(253,224,71,0.18) 0%, rgba(202,138,4,0.06) 100%)',
                          border: '2px solid #fbbf24',
                          glow: 'rgba(251,191,36,0.35)',
                          numberStyle: {
                            background: 'linear-gradient(to bottom, #fffef0, #fbbf24)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontSize: '2.5rem',
                            fontWeight: 900,
                            textShadow: '0 0 12px rgba(251,191,36,0.7)',
                          },
                          avatarBorder: '3px solid #fbbf24',
                          textColor: '#fef08a',
                          shadow: '0 0 30px rgba(251,191,36,0.25), inset 0 0 15px rgba(253,224,71,0.1)',
                          numberLabel: '1'
                        },
                        2: {
                          bg: 'linear-gradient(135deg, rgba(241,245,249,0.18) 0%, rgba(148,163,184,0.06) 100%)',
                          border: '2px solid #cbd5e1',
                          glow: 'rgba(203,213,225,0.2)',
                          numberStyle: {
                            background: 'linear-gradient(to bottom, #ffffff, #94a3b8)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontSize: '2.0rem',
                            fontWeight: 900,
                            textShadow: '0 0 10px rgba(255,255,255,0.4)',
                          },
                          avatarBorder: '3px solid #cbd5e1',
                          textColor: '#f1f5f9',
                          shadow: '0 0 25px rgba(203,213,225,0.15), inset 0 0 10px rgba(255,255,255,0.05)',
                          numberLabel: '2'
                        },
                        3: {
                          bg: 'linear-gradient(135deg, rgba(251,146,60,0.12) 0%, rgba(194,65,12,0.04) 100%)',
                          border: '2px solid #ea580c',
                          glow: 'rgba(234,88,12,0.15)',
                          numberStyle: {
                            background: 'linear-gradient(to bottom, #ffedd5, #ea580c)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontSize: '1.8rem',
                            fontWeight: 900,
                            textShadow: '0 0 8px rgba(234,88,12,0.3)',
                          },
                          avatarBorder: '3px solid #ea580c',
                          textColor: '#ffedd5',
                          shadow: '0 0 20px rgba(234,88,12,0.1), inset 0 0 8px rgba(251,146,60,0.03)',
                          numberLabel: '3'
                        }
                      }[rank as 1 | 2 | 3];

                      return (
                        <div 
                          key={sale.nhan_vien} 
                          className={\`floating-platform-\${rank}\`}
                          style={{
                            flex: 1,
                            maxWidth: '120px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            position: 'relative',
                            transition: 'all 0.3s ease',
                            zIndex: rank === 1 ? 5 : 2
                          }}
                        >
                          {/* Crown for Rank 1 */}
                          {rank === 1 && (
                            <span 
                              style={{ 
                                position: 'absolute', top: '-24px', zIndex: 10, fontSize: '1.8rem',
                                filter: 'drop-shadow(0 2px 5px rgba(251,191,36,0.6))',
                                animation: 'bounce 2s ease-in-out infinite'
                              }}
                            >
                              👑
                            </span>
                          )}

                          {/* Floating Glassmorphic Platform base view */}
                          <div style={{
                            width: '100%',
                            background: config.bg,
                            border: config.border,
                            borderRadius: '16px',
                            padding: '12px 8px 10px',
                            boxShadow: config.shadow,
                            backdropFilter: 'blur(8px)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            position: 'relative'
                          }}>
                            {/* Inner glowing core */}
                            <div style={{
                              position: 'absolute', inset: 0, borderRadius: '14px',
                              background: \`radial-gradient(circle at center, \${config.glow} 0%, transparent 70%)\`,
                              pointerEvents: 'none'
                            }} />

                            {/* Avatar / Medallion */}
                            <div style={{
                              width: rank === 1 ? '58px' : '48px',
                              height: rank === 1 ? '58px' : '48px',
                              borderRadius: '50%',
                              overflow: 'hidden',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: config.avatarBorder,
                              boxShadow: \`0 4px 15px \${config.glow}\`,
                              background: rank === 3 ? 'radial-gradient(circle, #ea580c 0%, #7c2d12 100%)' : '#f8fafc',
                              zIndex: 2,
                              position: 'relative'
                            }}>
                              {/* If Rank 3 (Bronze Medallion) or no avatar, show 'HT' medallion */}
                              {(rank === 3 || !sale.avatar_url) ? (
                                <div style={{
                                  fontSize: rank === 1 ? '1.25rem' : '1.05rem',
                                  fontWeight: 800,
                                  color: rank === 3 ? '#ffedd5' : 'var(--primary)',
                                  textShadow: rank === 3 ? '0 2px 4px rgba(0,0,0,0.5)' : 'none'
                                }}>
                                  {initials}
                                </div>
                              ) : (
                                <img 
                                  src={sale.avatar_url} 
                                  alt={sale.nhan_vien}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                  }}
                                />
                              )}
                            </div>

                            {/* Name label */}
                            <div style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              color: '#fff',
                              textAlign: 'center',
                              marginTop: '8px',
                              width: '100%',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                            }}>
                              {sale.nhan_vien.toUpperCase()}
                            </div>

                            {/* Score label */}
                            <div style={{
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              color: config.textColor,
                              marginTop: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '1px',
                              textShadow: '0 1px 3px rgba(0,0,0,0.6)'
                            }}>
                              {formatCurrency(sale.doanh_thu)} ⭐
                            </div>

                            {/* Glowing 3D Rank Number */}
                            <div style={{ 
                              marginTop: '4px',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              lineHeight: 1
                            }}>
                              <span style={config.numberStyle}>{config.numberLabel}</span>
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
console.log('Cập nhật Podium BXH Sale thành công!');
