# CRM BĐS — VICTORY HOLDINGS

Hệ thống CRM nội bộ cho công ty bất động sản VICTORY HOLDINGS.  
Xây dựng trên **Next.js 16**, **Google Sheets** làm database, deploy trên **Vercel**.

## Tính năng chính

| Module | Mô tả |
|--------|-------|
| 🏠 **Dashboard** | Báo cáo doanh số, KPI, tổng hợp |
| 👥 **Khách hàng** | CRM quản lý khách hàng, lịch sử liên hệ |
| 🏗️ **Dự án** | Quản lý dự án bất động sản |
| 📋 **Pipeline** | Theo dõi cơ hội bán hàng |
| 👔 **Nhân viên** | Quản lý nhân sự, lương, hợp đồng |
| ✅ **Task Management** | Quản lý công việc nội bộ (RBAC 4 cấp) |
| 📊 **Tài chính** | Báo cáo dòng tiền, CFO dashboard |
| 📧 **Email** | Gửi email hàng loạt, slip lương |

## Tech Stack

- **Frontend**: Next.js 16.2 (App Router), TypeScript, SWR, Zustand
- **Styling**: CSS Variables (custom design system)
- **Database**: Google Sheets (via `google-spreadsheet` npm)
- **Auth**: Cookie-based session (`crm_session`)
- **Charts**: Recharts
- **Drag & Drop**: @hello-pangea/dnd
- **Deploy**: Vercel

## Cài đặt Local

```bash
# Clone repo
git clone https://github.com/your-org/crm-bds.git
cd crm-bds

# Cài dependencies
npm install

# Cấu hình env
cp .env.example .env.local
# Điền các giá trị trong .env.local

# Khởi tạo Task Management sheets
npx ts-node scripts/task-management/setup-sheets.ts

# Chạy dev server
npm run dev
```

Truy cập: http://localhost:3000

## Task Management Module

Module quản lý công việc nội bộ với đầy đủ tính năng:
- **RBAC 4 cấp**: Director / Manager / Team Leader / Staff
- **Workflow 6 trạng thái**: todo → inprogress → waiting → review → completed → closed
- **Phê duyệt 3 cấp**: Team Leader → Manager → Director
- **Kanban drag-drop** + List view
- **Real-time notifications** (polling 30s)
- **KPI Dashboard** với Recharts
- **Checklist, Subtasks, Comments (threaded)**
- **Activity Log** đầy đủ

→ Xem hướng dẫn chi tiết: [docs/task-management-setup.md](docs/task-management-setup.md)

## Deploy Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Hoặc kết nối GitHub repo qua Vercel Dashboard.

### Environment Variables cần thiết

```env
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
GOOGLE_SHEET_ID=...
TM_GOOGLE_SHEET_ID=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-domain.vercel.app
```

## Tài khoản Demo

Chạy `npx ts-node scripts/task-management/setup-sheets.ts` để tạo dữ liệu mẫu.

| Email | Role | Password |
|-------|------|----------|
| admin@victoryholdings.vn | Admin/Director | Victory@2026 |
| manager@victoryholdings.vn | Trưởng phòng | Victory@2026 |
| leader@victoryholdings.vn | Team Leader | Victory@2026 |
| staff1@victoryholdings.vn | Nhân viên | Victory@2026 |

## Scripts

```bash
npm run dev          # Dev server (webpack mode)
npm run build        # Production build
npm run start        # Production server
npm run lint         # ESLint check

# Task Management
npx ts-node scripts/task-management/setup-sheets.ts  # Khởi tạo sheets + seed data
npx ts-node scripts/task-management/seed-demo-accounts.ts  # Tạo tài khoản demo
```

## Cấu trúc thư mục

```
src/
├── app/
│   ├── api/tm/           # Task Management API routes (15 endpoints)
│   ├── quan-ly-cong-viec/ # Task Management pages
│   └── ...               # Các trang khác
├── components/
│   ├── task-management/  # TM UI components (13 components)
│   └── ...
├── hooks/tm/             # SWR hooks: useTasks, useNotifications
├── lib/task-management/  # Core: types, repository, services, RBAC, cache
└── stores/               # Zustand: tmStore
```

## Phân quyền

```
Auth: Cookie crm_session = base64(JSON{ id_nhan_vien, ho_ten, email, vai_tro, employee_type })

Role mapping:
  vai_tro='Admin'             → director  (toàn quyền)
  employee_type='Trưởng phòng' → manager   (quản lý phòng)
  employee_type='Leader'      → team_leader
  (còn lại)                   → staff
```

---

© 2026 VICTORY HOLDINGS — Internal CRM System
