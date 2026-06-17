# Task Management — Hướng dẫn Cài đặt & Triển khai

## Mục lục
1. [Google Service Account Setup](#1-google-service-account-setup)
2. [Google Sheets Setup](#2-google-sheets-setup)
3. [Environment Variables](#3-environment-variables)
4. [Khởi tạo Database](#4-khởi-tạo-database)
5. [Deploy lên Vercel](#5-deploy-lên-vercel)
6. [Tài khoản Demo](#6-tài-khoản-demo)
7. [Kiểm thử](#7-kiểm-thử)
8. [Kiến trúc RBAC](#8-kiến-trúc-rbac)

---

## 1. Google Service Account Setup

### Bước 1: Tạo Google Cloud Project
1. Truy cập [console.cloud.google.com](https://console.cloud.google.com)
2. Tạo project mới hoặc chọn project hiện có
3. Vào **APIs & Services → Enable APIs**
4. Tìm và enable: **Google Sheets API**

### Bước 2: Tạo Service Account
1. Vào **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Đặt tên: `crm-bds-sheets-sa`
4. Role: **Editor** (hoặc tùy chỉnh với Sheets Write)
5. Click **Done**

### Bước 3: Tạo JSON Key
1. Click vào service account vừa tạo
2. Tab **Keys → Add Key → Create New Key → JSON**
3. Download file `.json` — **lưu an toàn, không commit lên git**

### Bước 4: Lấy thông tin từ JSON Key

```json
{
  "client_email": "crm-bds-sheets-sa@project-id.iam.gserviceaccount.com",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
}
```

- `client_email` → `GOOGLE_CLIENT_EMAIL`
- `private_key` → `GOOGLE_PRIVATE_KEY`

---

## 2. Google Sheets Setup

### Bước 1: Tạo Spreadsheet

**Option A — Dùng chung 1 sheet:**
- Sử dụng spreadsheet CRM chính (đã có sẵn)
- Thêm các tab TM_ vào đó

**Option B — Sheet riêng cho Task Management (khuyến nghị):**
1. Tạo Google Spreadsheet mới
2. Đặt tên: `CRM BDS — Task Management DB`
3. Copy Spreadsheet ID từ URL: `https://docs.google.com/spreadsheets/d/**{SPREADSHEET_ID}**/edit`

### Bước 2: Chia sẻ quyền với Service Account
1. Click **Share** trên spreadsheet
2. Thêm email service account: `crm-bds-sheets-sa@project-id.iam.gserviceaccount.com`
3. Quyền: **Editor**
4. Bỏ chọn "Notify people"
5. Click **Share**

### Bước 3: Khởi tạo Sheets tự động
```bash
# Tạo file .env.local trước
cp .env.example .env.local
# Điền TM_GOOGLE_SHEET_ID và thông tin service account

# Chạy script khởi tạo
npx ts-node scripts/task-management/setup-sheets.ts
```

Script sẽ tự động tạo 9 sheet tabs:
| Sheet Tab | Mô tả |
|-----------|-------|
| `TM_Users` | Mapping nhân viên CRM → TM User |
| `TM_Departments` | Phòng ban |
| `TM_Projects` | Dự án |
| `TM_Tasks` | Công việc chính |
| `TM_Subtasks` | Công việc con |
| `TM_Checklists` | Checklist items |
| `TM_Comments` | Bình luận (threaded) |
| `TM_Notifications` | Thông báo in-app |
| `TM_ActivityLogs` | Audit log |

---

## 3. Environment Variables

### File `.env.local` (local development)
```bash
# Google Sheets (CRM chính)
GOOGLE_CLIENT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nYOUR_KEY\n-----END RSA PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=abc123

# Task Management (riêng hoặc dùng chung GOOGLE_SHEET_ID)
TM_GOOGLE_SHEET_ID=def456

# App
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-32-char-random-secret-here
```

### Vercel Environment Variables
Cấu hình tại: **Vercel Dashboard → Project → Settings → Environment Variables**

| Variable | Required | Mô tả |
|----------|----------|-------|
| `GOOGLE_CLIENT_EMAIL` | ✅ | Service account email |
| `GOOGLE_PRIVATE_KEY` | ✅ | Private key (giữ nguyên `\n`) |
| `GOOGLE_SHEET_ID` | ✅ | ID spreadsheet chính |
| `TM_GOOGLE_SHEET_ID` | ✅ | ID spreadsheet TM |
| `NEXTAUTH_SECRET` | ✅ | Secret key (min 32 chars) |
| `NEXTAUTH_URL` | ✅ | URL production (https://...) |

> **Lưu ý GOOGLE_PRIVATE_KEY trên Vercel:**
> Khi paste private key vào Vercel, giữ nguyên ký tự `\n` literal — Vercel sẽ xử lý đúng.

---

## 4. Khởi tạo Database

```bash
# 1. Cài dependencies
npm install

# 2. Copy và điền env vars
cp .env.example .env.local

# 3. Khởi tạo 9 sheet tabs + seed demo data
npx ts-node scripts/task-management/setup-sheets.ts

# 4. (Optional) Seed tài khoản demo vào CRM sheet chính
npx ts-node scripts/task-management/seed-demo-accounts.ts

# 5. Khởi tạo sheets qua API (sau khi app đang chạy)
curl -X POST http://localhost:3000/api/tm/init \
  -H "Cookie: crm_session=YOUR_SESSION"
```

---

## 5. Deploy lên Vercel

### Cách 1: Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --prod
```

### Cách 2: GitHub Integration
1. Push code lên GitHub
2. Vào [vercel.com](https://vercel.com) → New Project
3. Import repository
4. Cấu hình Environment Variables
5. Click Deploy

### Vercel Build Settings
```
Framework Preset: Next.js
Build Command:    npm run build  (= next build --webpack)
Output Directory: .next
Install Command:  npm install
```

### Kiểm tra Vercel Logs
```bash
vercel logs --follow
```

---

## 6. Tài khoản Demo

Sau khi chạy setup-sheets.ts:

| Email | Vai trò | Quyền hạn | Mật khẩu |
|-------|---------|-----------|----------|
| `admin@victoryholdings.vn` | Admin / Giám đốc | Toàn quyền, KPI công ty | `Victory@2026` |
| `manager@victoryholdings.vn` | Trưởng phòng | Quản lý phòng, duyệt cấp 2 | `Victory@2026` |
| `leader@victoryholdings.vn` | Team Leader | Giao việc nhóm, duyệt cấp 1 | `Victory@2026` |
| `staff1@victoryholdings.vn` | Nhân viên | Xem và thực hiện task được giao | `Victory@2026` |

### Role Mapping Logic
```
vai_tro = 'Admin'           → UserRole.director
employee_type = 'Trưởng phòng' → UserRole.manager
employee_type = 'Leader'    → UserRole.team_leader
(còn lại)                   → UserRole.staff
```

---

## 7. Kiểm thử

### Checklist sau deploy

#### Auth & Session
- [ ] Đăng nhập bằng admin@victoryholdings.vn / Victory@2026
- [ ] Cookie `crm_session` được set đúng
- [ ] Logout xóa cookie
- [ ] Role được map đúng (kiểm tra /api/tm/kpi/company)

#### CRUD Task
- [ ] Tạo task mới (POST /api/tm/tasks)
- [ ] Xem danh sách (GET /api/tm/tasks)
- [ ] Xem chi tiết (GET /api/tm/tasks/:id)
- [ ] Cập nhật task (PUT /api/tm/tasks/:id)
- [ ] Xóa mềm (DELETE /api/tm/tasks/:id)

#### Workflow
- [ ] Chuyển trạng thái: todo → inprogress → review
- [ ] Duyệt task (POST /api/tm/tasks/:id/approve) — cần role manager+
- [ ] Từ chối task với lý do (POST /api/tm/tasks/:id/reject)

#### RBAC
- [ ] Staff không thể xem KPI công ty
- [ ] Staff không thể duyệt task
- [ ] Team leader không thể xóa task của người khác

#### UI
- [ ] Kanban drag-drop đổi status
- [ ] Search debounce hoạt động (350ms)
- [ ] Filter multi-select status/priority
- [ ] Pagination (page, limit)
- [ ] Notification badge đếm đúng
- [ ] KPI Dashboard hiển thị charts

---

## 8. Kiến trúc RBAC

```
Director (Giám đốc / Admin)
  └─ Toàn quyền: tạo/sửa/xóa mọi task, duyệt mọi cấp, xem KPI công ty

Manager (Trưởng phòng)  
  └─ Quản lý phòng: giao việc, duyệt cấp 1-2, xem KPI phòng ban

Team Leader (Leader)
  └─ Quản lý nhóm: tạo task nhóm, duyệt cấp 1, thêm collaborators

Staff (Nhân viên)
  └─ Xem và thực hiện task được giao, tạo comments, toggle checklist
```

### Permission Codes
| Code | Mô tả | Director | Manager | Leader | Staff |
|------|-------|:---:|:---:|:---:|:---:|
| `TASK_CREATE` | Tạo task | ✅ | ✅ | ✅ | ❌ |
| `TASK_READ_ALL` | Xem tất cả task | ✅ | ✅ | ❌ | ❌ |
| `TASK_DELETE` | Xóa task | ✅ | ✅ | ❌ | ❌ |
| `TASK_APPROVE_L1` | Duyệt cấp 1 | ✅ | ✅ | ✅ | ❌ |
| `TASK_APPROVE_L2` | Duyệt cấp 2 | ✅ | ✅ | ❌ | ❌ |
| `TASK_APPROVE_L3` | Duyệt cấp 3 | ✅ | ❌ | ❌ | ❌ |
| `KPI_VIEW_COMPANY` | KPI toàn công ty | ✅ | ❌ | ❌ | ❌ |
| `SHEET_INIT` | Khởi tạo sheets | ✅ | ❌ | ❌ | ❌ |
