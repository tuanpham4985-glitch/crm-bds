'use client';

// Sổ tay nhân viên — trang tra cứu chung cho toàn bộ nhân viên (không gắn
// businessAccess). Mục menu khai báo trong MENU_REGISTRY (key
// 'employeeHandbook'), đặt ngay dưới Dashboard.
import { BookOpen, Building2, ScrollText, HeartHandshake, Workflow, Phone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface HandbookSection {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

// Khung nội dung — điền nội dung thật cho từng mục khi có tài liệu chính thức.
const SECTIONS: HandbookSection[] = [
  { key: 'gioi-thieu', title: 'Giới thiệu công ty', description: 'Lịch sử, tầm nhìn, sứ mệnh và giá trị cốt lõi của Victory Holdings.', icon: Building2 },
  { key: 'noi-quy', title: 'Nội quy & quy định', description: 'Giờ làm việc, trang phục, chấm công và các quy định chung.', icon: ScrollText },
  { key: 'phuc-loi', title: 'Chế độ & phúc lợi', description: 'Lương thưởng, hoa hồng, nghỉ phép, bảo hiểm và các chính sách đãi ngộ.', icon: HeartHandshake },
  { key: 'quy-trinh', title: 'Quy trình làm việc', description: 'Quy trình chăm sóc khách hàng, giao dịch và sử dụng hệ thống CRM.', icon: Workflow },
  { key: 'lien-he', title: 'Liên hệ hỗ trợ', description: 'Đầu mối HCNS, kế toán, marketing và IT khi cần hỗ trợ.', icon: Phone },
];

export default function SoTayNhanVienPage() {
  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={26} /> Sổ tay nhân viên
          </h1>
          <p>Thông tin, quy định và quy trình dành cho nhân viên Victory Holdings</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {SECTIONS.map(({ key, title, description, icon: Icon }) => (
          <div key={key} id={key} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Icon size={20} style={{ color: 'var(--primary)' }} />
              <h3 className="card-title" style={{ margin: 0 }}>{title}</h3>
            </div>
            <p className="card-subtitle" style={{ margin: 0 }}>{description}</p>
            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nội dung đang được cập nhật.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
