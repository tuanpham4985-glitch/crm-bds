import fs from 'fs';

const filePath = 'd:\\Work\\CRM_Mini\\crm-bds\\src\\app\\nhan-vien\\page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Tìm hàm renderAvatar cũ và thay thế bằng thiết kế viền kim loại 3D sang trọng chống méo ảnh
const startTag = '  // Render avatar from URL or fallback to initials';
const endTag = '  const renderAvatarFallback =';

const startIndex = content.indexOf(startTag);
const endIndex = content.indexOf(endTag);

if (startIndex === -1 || endIndex === -1) {
  console.error('Không tìm thấy hàm renderAvatar trong file');
  process.exit(1);
}

const beforeAvatar = content.substring(0, startIndex);
const afterAvatar = content.substring(endIndex);

const newAvatarCode = `  // Render avatar from URL or fallback to initials
  const renderAvatar = (nv: NhanVien, size = 36) => {
    if (nv.avatar_url) {
      // Determine metallic border and shadow based on role, perfectly matching leaderboard design
      let borderStyle = '2.5px solid #cbd5e1'; // Silver for Sales
      let glowStyle = '0 2px 6px rgba(148,163,184,0.35)';

      if (nv.vai_tro === 'Admin') {
        borderStyle = '2.5px solid #d4af37'; // Gold for Admin
        glowStyle = '0 2px 8px rgba(212,175,55,0.45)';
      } else if (nv.vai_tro === 'Manager' || nv.employee_type?.includes('Trưởng')) {
        borderStyle = '2.5px solid #d4af37'; // Gold for Managers
        glowStyle = '0 2px 8px rgba(212,175,55,0.45)';
      } else if (nv.employee_type?.includes('Học viên') || nv.employee_type?.includes('Cộng tác')) {
        borderStyle = '2.5px solid #b45309'; // Bronze for Interns
        glowStyle = '0 2px 6px rgba(180,83,9,0.25)';
      }

      return (
        <div style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: borderStyle,
          boxShadow: glowStyle,
          background: '#ffffff',
          padding: '1.5px', // Circular white separation ring
          position: 'relative'
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff'
          }}>
            <img
              src={nv.avatar_url}
              alt={nv.ho_ten}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '100%',
                minWidth: '100%',
                objectFit: 'cover',
                display: 'block'
              }}
              // If Google Drive image fails, fallback to initials
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                const innerContainer = target.parentElement as HTMLElement;
                const outerContainer = innerContainer?.parentElement as HTMLElement;
                if (outerContainer) {
                  outerContainer.style.display = 'none';
                  const fallback = outerContainer.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }
              }}
            />
          </div>
        </div>
      );
    }
    return null;
  };
`;

fs.writeFileSync(filePath, beforeAvatar + newAvatarCode + afterAvatar, 'utf8');
console.log('Cập nhật renderAvatar tab Nhân viên thành công!');
