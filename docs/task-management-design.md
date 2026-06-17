# Tài liệu thiết kế: Module Quản lý Công việc (Task Management)
**Dự án:** CRM-BDS — Hệ thống Quản lý Môi giới Bất động sản  
**Phiên bản:** 1.0  
**Ngày:** 2026-06-17  
**Tác giả:** Solution Architect  

---

## Mục lục

1. [Tổng quan nghiệp vụ](#1-tổng-quan-nghiệp-vụ)
2. [Cấu trúc phân cấp](#2-cấu-trúc-phân-cấp)
3. [Định nghĩa thực thể Task](#3-định-nghĩa-thực-thể-task)
4. [Workflow vòng đời Task](#4-workflow-vòng-đời-task)
5. [Approval Workflow](#5-approval-workflow)
6. [Phân quyền theo vai trò](#6-phân-quyền-theo-vai-trò)
7. [Database Schema](#7-database-schema)
8. [API Endpoints](#8-api-endpoints)
9. [KPI & Báo cáo](#9-kpi--báo-cáo)
10. [Notification System](#10-notification-system)
11. [Dashboard quản trị](#11-dashboard-quản-trị)
12. [Hiệu năng & Mở rộng](#12-hiệu-năng--mở-rộng)
13. [Ví dụ thực tế](#13-ví-dụ-thực-tế)

---

## 1. Tổng quan nghiệp vụ

### 1.1 Bối cảnh

Công ty môi giới BĐS vận hành đồng thời nhiều dự án (Vinhomes, The Manor, Masteri…), có nhiều phòng ban phối hợp (Kinh doanh, Marketing, Pháp lý, Dự án, Hành chính). Hiện tại công việc được theo dõi qua Excel/Zalo → không truy vết được lịch sử, không đo được KPI, không có cơ chế phê duyệt chuẩn hóa.

### 1.2 Mục tiêu module

- Tập trung toàn bộ công việc lên 1 hệ thống, có thể giao việc liên phòng ban.
- Mỗi task có 1 Owner chịu trách nhiệm rõ ràng, tránh "cha chung không ai khóc".
- Workflow chuẩn hóa: tạo → thực hiện → chờ → review → hoàn thành → đóng.
- Đo KPI tự động, xuất báo cáo cho BGĐ theo tuần/tháng.
- Thông báo đa kênh (in-app, email, Zalo) để không bỏ sót task.

### 1.3 Các bên liên quan (Stakeholders)

| Vai trò | Nhu cầu chính |
|---------|---------------|
| Ban Giám đốc | Xem KPI toàn công ty, duyệt task chiến lược |
| Trưởng phòng | Giao việc, theo dõi tiến độ phòng, duyệt task cấp 2 |
| Team Leader | Phân công subtask, duyệt task cấp 1 |
| Nhân viên | Nhận việc, cập nhật tiến độ, log giờ làm |

---

## 2. Cấu trúc phân cấp

```
Company (Công ty BĐS)
│
├── Department (Phòng ban)
│   ├── Phòng Kinh doanh
│   ├── Phòng Marketing
│   ├── Phòng Pháp lý
│   ├── Phòng Dự án & Đầu tư
│   └── Phòng Hành chính - Nhân sự
│
└── Project (Dự án)
    ├── Vinhomes Ocean Park Phase 2
    ├── The Manor Central Park
    └── Masteri Thảo Điền
        │
        └── Task (Công việc chính)
            │   ├── Task ID, Title, Objective
            │   ├── Owner (1 người) + Collaborators (N người)
            │   ├── Priority, Status, Progress %
            │   ├── KPI Target / Actual
            │   └── Approval Level (1/2/3)
            │
            └── Subtask (Công việc con)
                │   ├── Kế thừa Project, Department từ parent
                │   └── Có Owner riêng (có thể khác phòng ban)
                │
                └── Checklist (Danh sách kiểm tra)
                    ├── is_done: boolean
                    ├── done_by: user_id
                    └── sort_order: integer
```

### 2.1 Quy tắc phân cấp

- **Task và Subtask dùng cùng bảng `tasks`**, phân biệt bởi `parent_task_id IS NULL`.
- **Subtask không có subtask** (tối đa 2 cấp task).
- **Checklist** chỉ tồn tại ở task hoặc subtask, không lồng nhau.
- **Project** có thể thuộc nhiều phòng ban (cross-department project).
- **Collaborator** từ bất kỳ phòng ban nào đều có thể được thêm vào task.

---

## 3. Định nghĩa thực thể Task

### 3.1 Trường dữ liệu đầy đủ

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `task_id` | UUID | ✓ | Khóa chính |
| `task_code` | VARCHAR(20) | ✓ | Mã tự sinh: `T-2026-0001` |
| `title` | VARCHAR(255) | ✓ | Tên công việc |
| `objective` | TEXT | ✓ | Mục tiêu cụ thể, đo được |
| `description` | TEXT | | Mô tả chi tiết |
| `project_id` | UUID FK | ✓ | Thuộc dự án nào |
| `department_id` | UUID FK | ✓ | Phòng ban chủ quản |
| `owner_id` | UUID FK | ✓ | 1 người duy nhất chịu trách nhiệm |
| `parent_task_id` | UUID FK | | NULL = task gốc |
| `priority` | ENUM | ✓ | `critical / high / medium / low` |
| `status` | ENUM | ✓ | `todo / inprogress / waiting / review / completed / closed` |
| `progress_pct` | SMALLINT | ✓ | 0–100, tự tính từ checklist |
| `start_date` | DATE | ✓ | Ngày bắt đầu |
| `due_date` | DATE | ✓ | Hạn hoàn thành |
| `estimated_hours` | DECIMAL(6,2) | | Giờ ước tính |
| `actual_hours` | DECIMAL(6,2) | | Giờ thực tế (tổng từ time_logs) |
| `kpi_target` | JSONB | | `{"unit":"contracts","value":5}` |
| `kpi_actual` | JSONB | | Cập nhật khi task tiến triển |
| `attachments` | JSONB | | Array URL file đính kèm |
| `approval_level` | SMALLINT | ✓ | 1 / 2 / 3 |
| `approval_status` | ENUM | ✓ | `pending / approved / rejected` |
| `approved_by` | UUID FK | | Người duyệt cuối |
| `approved_at` | TIMESTAMPTZ | | Thời điểm duyệt |
| `rejection_reason` | TEXT | | Lý do từ chối |
| `tags` | TEXT[] | | Nhãn tự do |
| `created_by` | UUID FK | ✓ | Người tạo task |
| `created_at` | TIMESTAMPTZ | ✓ | |
| `updated_at` | TIMESTAMPTZ | ✓ | |
| `closed_at` | TIMESTAMPTZ | | Thời điểm đóng |

### 3.2 KPI Target — cấu trúc JSONB

```json
{
  "metrics": [
    { "unit": "calls",     "target": 200, "actual": 187 },
    { "unit": "meetings",  "target": 40,  "actual": 44  },
    { "unit": "contracts", "target": 5,   "actual": 3   },
    { "unit": "revenue",   "target": 2000000000, "actual": 1800000000, "currency": "VND" }
  ]
}
```

---

## 4. Workflow vòng đời Task

### 4.1 Sơ đồ trạng thái

```
                    ┌─────────────────────────────────────┐
                    │           TASK LIFECYCLE             │
                    └─────────────────────────────────────┘

  [TODO] ────start────▶ [IN PROGRESS] ────block────▶ [WAITING]
    ▲                        │   ▲                       │
    │                        │   └──────unblock───────────┘
    │                    progress=100%
    │                    checklist=100%
    │                        │
    │                        ▼
    │                    [REVIEW] ────reject────▶ [IN PROGRESS]
    │                        │
    │                    approve
    │                        │
    │                        ▼
    └──reopen──────── [COMPLETED] ────7 days────▶ [CLOSED]
```

### 4.2 Điều kiện chuyển trạng thái

| Từ | Sang | Điều kiện | Người thực hiện |
|----|------|-----------|-----------------|
| Todo | In Progress | Owner click "Start" hoặc cập nhật progress > 0 | Owner |
| In Progress | Waiting | Gắn lý do bị chặn + tag người liên quan | Owner |
| Waiting | In Progress | Blocker được giải quyết (comment + confirm) | Owner hoặc người được tag |
| In Progress | Review | `progress = 100`, tất cả checklist done, ≥1 time_log | Owner |
| Review | Completed | Reviewer approve | Team Leader / TP / BGĐ |
| Review | In Progress | Reviewer reject (kèm lý do bắt buộc) | Team Leader / TP / BGĐ |
| Completed | Closed | Tự động sau 7 ngày HOẶC Manager đóng thủ công | Hệ thống / Manager |
| Completed | In Progress | Reopen với lý do (chỉ Manager trở lên) | Manager |

### 4.3 Tự động cập nhật Progress

```
progress_pct = (checklist_done / checklist_total) * 100
```

Khi tick checklist → auto cập nhật progress_pct của task/subtask.  
Khi subtask hoàn thành → tính lại progress_pct của task parent:

```
parent_progress = avg(subtask_progress) weighted by estimated_hours
```

---

## 5. Approval Workflow

### 5.1 Ba cấp phê duyệt

```
Cấp 1 — Team Leader duyệt
  ├── Điều kiện: Task thường, nội bộ team, không có ngân sách
  ├── SLA: 24 giờ làm việc
  └── Ví dụ: "Gọi điện 50 khách hàng tuần này"

Cấp 2 — Trưởng phòng duyệt
  ├── Điều kiện: Task liên phòng ban, có ngân sách, hoặc leo thang từ cấp 1
  ├── SLA: 48 giờ làm việc
  └── Ví dụ: "Triển khai chiến dịch marketing dự án mới (ngân sách 50tr)"

Cấp 3 — Ban Giám đốc duyệt
  ├── Điều kiện: Task chiến lược, ngân sách > 50tr, task liên quan KH VIP/chính sách
  ├── SLA: 72 giờ làm việc
  └── Ví dụ: "Ký hợp đồng hợp tác độc quyền phân phối dự án"
```

### 5.2 Flow phê duyệt

```
Owner submit review
        │
        ▼
Hệ thống xác định approval_level dựa trên:
  - task_type (strategic / operational / administrative)
  - budget_amount
  - is_cross_department
  - priority (Critical → tối thiểu cấp 2)
        │
        ▼
Gửi notification đến Reviewer phù hợp
        │
   ┌────┴────┐
approve    reject
   │            │
   ▼            ▼
Completed   In Progress
            (kèm rejection_reason)
                │
            Nếu quá 2 lần reject
                │
                ▼
            Escalate lên cấp trên
```

---

## 6. Phân quyền theo vai trò

### 6.1 Định nghĩa vai trò

| Role | Mã | Scope |
|------|----|-------|
| Ban Giám đốc | `director` | Toàn công ty |
| Trưởng phòng | `manager` | Phòng mình |
| Team Leader | `team_leader` | Team mình |
| Nhân viên | `staff` | Task của mình |

### 6.2 Ma trận quyền chi tiết

| Chức năng | director | manager | team_leader | staff |
|-----------|----------|---------|-------------|-------|
| Tạo task bất kỳ | ✓ | Phòng mình | Team mình | ✗ |
| Giao task liên phòng | ✓ | ✓ | ✗ | ✗ |
| Xem task toàn công ty | ✓ | Phòng mình | Team mình | Task của mình |
| Sửa task người khác | ✓ | Phòng mình | Team mình | ✗ |
| Xóa task | ✓ | Chưa bắt đầu | ✗ | ✗ |
| Đổi priority | ✓ | ✓ | Team mình | ✗ |
| Gia hạn due_date | ✓ | ✓ | +3 ngày | ✗ |
| Duyệt cấp 3 | ✓ | ✗ | ✗ | ✗ |
| Duyệt cấp 2 | ✓ | ✓ | ✗ | ✗ |
| Duyệt cấp 1 | ✓ | ✓ | ✓ | ✗ |
| Reject & reopen | ✓ | ✓ | Team mình | ✗ |
| Xem KPI toàn công ty | ✓ | ✗ | ✗ | ✗ |
| Xem KPI phòng ban | ✓ | ✓ | Team mình | ✗ |
| Export báo cáo | ✓ | ✓ | Team mình | ✗ |
| Comment vào task | ✓ | Phòng mình | Team mình | Task của mình |
| Upload attachment | ✓ | ✓ | ✓ | Task của mình |

### 6.3 Row-Level Security (PostgreSQL)

```sql
-- Xem task
CREATE POLICY task_select_policy ON tasks FOR SELECT
  USING (
    -- BGĐ thấy tất cả
    get_user_role() = 'director'
    OR
    -- Manager thấy task phòng mình
    (get_user_role() = 'manager'
     AND department_id = get_user_dept())
    OR
    -- Team Leader thấy task team mình + task mình
    (get_user_role() = 'team_leader'
     AND (team_id = get_user_team() OR owner_id = get_user_id()))
    OR
    -- Staff thấy task mình là owner hoặc collaborator
    owner_id = get_user_id()
    OR
    EXISTS (
      SELECT 1 FROM task_collaborators tc
      WHERE tc.task_id = tasks.task_id
        AND tc.user_id = get_user_id()
    )
  );
```

---

## 7. Database Schema

### 7.1 Bảng `tasks` (bảng chính)

```sql
CREATE TABLE tasks (
  task_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_code        VARCHAR(20) UNIQUE NOT NULL,  -- T-2026-0001
  title            VARCHAR(255) NOT NULL,
  objective        TEXT NOT NULL,
  description      TEXT,
  project_id       UUID NOT NULL REFERENCES projects(project_id),
  department_id    UUID NOT NULL REFERENCES departments(department_id),
  owner_id         UUID NOT NULL REFERENCES users(user_id),
  parent_task_id   UUID REFERENCES tasks(task_id),  -- NULL = root task
  priority         priority_enum NOT NULL DEFAULT 'medium',
  status           status_enum NOT NULL DEFAULT 'todo',
  progress_pct     SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  start_date       DATE NOT NULL,
  due_date         DATE NOT NULL,
  estimated_hours  DECIMAL(6,2),
  actual_hours     DECIMAL(6,2) GENERATED ALWAYS AS (
                     (SELECT COALESCE(SUM(hours_logged),0)
                      FROM task_time_logs WHERE task_id = tasks.task_id)
                   ) STORED,
  kpi_target       JSONB DEFAULT '{}',
  kpi_actual       JSONB DEFAULT '{}',
  attachments      JSONB DEFAULT '[]',
  approval_level   SMALLINT NOT NULL DEFAULT 1 CHECK (approval_level IN (1,2,3)),
  approval_status  approval_enum NOT NULL DEFAULT 'pending',
  approved_by      UUID REFERENCES users(user_id),
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  tags             TEXT[] DEFAULT '{}',
  created_by       UUID NOT NULL REFERENCES users(user_id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ  -- soft delete
);

CREATE TYPE priority_enum AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE status_enum   AS ENUM ('todo', 'inprogress', 'waiting', 'review', 'completed', 'closed');
CREATE TYPE approval_enum AS ENUM ('pending', 'approved', 'rejected');
```

### 7.2 Bảng `task_collaborators`

```sql
CREATE TABLE task_collaborators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(user_id),
  department_id UUID REFERENCES departments(department_id),
  role          VARCHAR(20) NOT NULL DEFAULT 'contributor',
  -- role: contributor | reviewer | observer
  added_by      UUID REFERENCES users(user_id),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);
```

### 7.3 Bảng `task_checklists`

```sql
CREATE TABLE task_checklists (
  checklist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  is_done      BOOLEAN NOT NULL DEFAULT FALSE,
  done_by      UUID REFERENCES users(user_id),
  done_at      TIMESTAMPTZ,
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 7.4 Bảng `task_comments`

```sql
CREATE TABLE task_comments (
  comment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(user_id),
  body              TEXT NOT NULL,
  mentions          UUID[] DEFAULT '{}',  -- @mentioned user_ids
  attachments       JSONB DEFAULT '[]',
  parent_comment_id UUID REFERENCES task_comments(comment_id),  -- threading
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ
);
```

### 7.5 Bảng `task_time_logs`

```sql
CREATE TABLE task_time_logs (
  log_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(user_id),
  hours_logged DECIMAL(5,2) NOT NULL CHECK (hours_logged > 0),
  log_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 7.6 Bảng `task_history` (Audit log)

```sql
CREATE TABLE task_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(task_id),
  user_id    UUID NOT NULL REFERENCES users(user_id),
  action     VARCHAR(50) NOT NULL,
  -- status_changed | field_updated | comment_added | approved | rejected
  old_value  JSONB,
  new_value  JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger tự động ghi history
CREATE OR REPLACE FUNCTION log_task_changes() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO task_history(task_id, user_id, action, old_value, new_value)
    VALUES (NEW.task_id, current_user_id(), 'status_changed',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_audit_trigger
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_task_changes();
```

### 7.7 Indexes tối ưu hiệu năng

```sql
-- Query theo status + dept (phổ biến nhất)
CREATE INDEX idx_tasks_status_dept ON tasks(status, department_id)
  WHERE deleted_at IS NULL;

-- Query task của owner
CREATE INDEX idx_tasks_owner ON tasks(owner_id, status)
  WHERE deleted_at IS NULL;

-- Query task sắp quá hạn
CREATE INDEX idx_tasks_due ON tasks(due_date, priority)
  WHERE status NOT IN ('completed', 'closed') AND deleted_at IS NULL;

-- Query subtask
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- Query theo project
CREATE INDEX idx_tasks_project ON tasks(project_id, status);

-- Collaborator lookup
CREATE INDEX idx_collab_user ON task_collaborators(user_id, task_id);

-- Full-text search tiêu đề
CREATE INDEX idx_tasks_fts ON tasks USING GIN(to_tsvector('simple', title || ' ' || COALESCE(description, '')));
```

---

## 8. API Endpoints

### 8.1 Tasks CRUD

```
GET    /api/v1/tasks                    Danh sách task (filter + phân trang cursor)
POST   /api/v1/tasks                    Tạo task mới
GET    /api/v1/tasks/:id                Chi tiết + subtasks + checklist + comments
PUT    /api/v1/tasks/:id                Cập nhật task (owner hoặc manager)
PATCH  /api/v1/tasks/:id/status         Chuyển trạng thái (validate điều kiện)
PATCH  /api/v1/tasks/:id/progress       Cập nhật progress %, auto-sync status
DELETE /api/v1/tasks/:id                Soft delete (chỉ Todo/Draft)
```

### 8.2 Collaborators

```
GET    /api/v1/tasks/:id/collaborators
POST   /api/v1/tasks/:id/collaborators          Thêm người tham gia
DELETE /api/v1/tasks/:id/collaborators/:userId  Xóa người tham gia
PATCH  /api/v1/tasks/:id/owner                  Chuyển Owner (Manager+)
```

### 8.3 Subtasks & Checklists

```
GET    /api/v1/tasks/:id/subtasks
POST   /api/v1/tasks/:id/subtasks        Tạo subtask (kế thừa project, dept)
POST   /api/v1/tasks/:id/checklists      Thêm checklist item
PATCH  /api/v1/checklists/:id/toggle     Tick/untick → auto-update parent progress
PUT    /api/v1/checklists/:id/reorder    Sắp xếp lại checklist
```

### 8.4 Approval & Review

```
POST   /api/v1/tasks/:id/submit-review   Submit (progress=100, checklist done)
POST   /api/v1/tasks/:id/approve         Phê duyệt (check role vs approval_level)
POST   /api/v1/tasks/:id/reject          Từ chối (reason bắt buộc)
POST   /api/v1/tasks/:id/escalate        Leo thang lên cấp trên
GET    /api/v1/tasks/pending-approval    Danh sách task chờ duyệt của tôi
```

### 8.5 Comments & Time Logs

```
GET    /api/v1/tasks/:id/comments
POST   /api/v1/tasks/:id/comments        Tạo comment, xử lý @mentions
PUT    /api/v1/comments/:id
DELETE /api/v1/comments/:id

POST   /api/v1/tasks/:id/time-logs       Log giờ làm
GET    /api/v1/tasks/:id/time-logs
```

### 8.6 KPI & Reports

```
GET    /api/v1/reports/kpi/company       KPI tổng công ty (director only)
GET    /api/v1/reports/kpi/department/:id
GET    /api/v1/reports/kpi/user/:id
GET    /api/v1/reports/overdue           Task quá hạn theo phòng ban
GET    /api/v1/reports/workload          Phân bổ workload theo nhân viên
POST   /api/v1/reports/export            Export Excel/PDF
```

### 8.7 Real-time

```
WebSocket: ws://[host]/api/v1/ws/tasks
  Events:
  - task:status_changed   { task_id, old_status, new_status }
  - task:comment_added    { task_id, comment_id, mentions }
  - task:assigned         { task_id, user_id }
  - task:approved         { task_id, approved_by }
  - task:overdue          { task_id, overdue_days }
```

### 8.8 Cấu trúc response chuẩn

```typescript
// Tạo task
POST /api/v1/tasks
Body: {
  title: string;
  objective: string;
  project_id: string;
  department_id: string;
  owner_id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  start_date: string;       // YYYY-MM-DD
  due_date: string;
  estimated_hours?: number;
  kpi_target?: KpiMetric[];
  approval_level: 1 | 2 | 3;
  collaborators?: { user_id: string; role: string }[];
  checklists?: { title: string; sort_order: number }[];
}

// Cursor-based pagination
GET /api/v1/tasks?cursor=xxx&limit=50&status=inprogress&department_id=xxx
Response: {
  data: Task[];
  next_cursor: string | null;
  total: number;
}
```

---

## 9. KPI & Báo cáo

### 9.1 KPI cốt lõi theo phòng ban

**Phòng Kinh doanh:**
- Số cuộc gọi telesale / tuần
- Số lịch hẹn xem nhà / tháng
- Số hợp đồng chốt / tháng
- Doanh số môi giới (VNĐ) / tháng

**Phòng Marketing:**
- Số campaign triển khai / tháng
- Số lead thu về / campaign
- Tỷ lệ chuyển đổi lead → khách hàng tiềm năng

**Phòng Pháp lý:**
- Số hợp đồng soạn / tháng
- Thời gian soạn bình quân / hợp đồng
- Số hồ sơ pháp lý hoàn thành

**Tất cả phòng ban:**
- Tỷ lệ hoàn thành đúng hạn (%)
- Số task quá hạn
- Trung bình giờ làm / task
- Tỷ lệ KPI đạt mục tiêu (%)

### 9.2 Báo cáo định kỳ

| Báo cáo | Tần suất | Gửi đến | Nội dung |
|---------|----------|---------|----------|
| Daily Digest | Hàng ngày 7:30 | Cá nhân | Task hôm nay, quá hạn |
| Weekly Summary | Thứ 6 17:00 | Team Leader, TP | Completed vs Overdue tuần |
| Monthly KPI | Ngày 1 hàng tháng | BGĐ, TP | KPI tháng qua vs target |
| Overdue Alert | Realtime | Manager phụ trách | Task quá hạn > 1 ngày |

### 9.3 Materialized View cho dashboard

```sql
CREATE MATERIALIZED VIEW mv_task_kpi_summary AS
SELECT
  d.department_id,
  d.name AS department_name,
  COUNT(*) FILTER (WHERE t.status NOT IN ('closed'))        AS active_tasks,
  COUNT(*) FILTER (WHERE t.status = 'completed')            AS completed_tasks,
  COUNT(*) FILTER (WHERE t.due_date < NOW()
                   AND t.status NOT IN ('completed','closed')) AS overdue_tasks,
  ROUND(
    COUNT(*) FILTER (WHERE t.status = 'completed'
                     AND t.closed_at <= t.due_date) * 100.0
    / NULLIF(COUNT(*) FILTER (WHERE t.status = 'completed'), 0), 1
  ) AS on_time_rate_pct,
  ROUND(AVG(t.actual_hours / NULLIF(t.estimated_hours, 0)) * 100, 1) AS efficiency_pct
FROM tasks t
JOIN departments d ON t.department_id = d.department_id
WHERE t.deleted_at IS NULL
GROUP BY d.department_id, d.name;

-- Refresh mỗi 15 phút
SELECT cron.schedule('refresh-kpi', '*/15 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_task_kpi_summary');
```

---

## 10. Notification System

### 10.1 Sự kiện và kênh thông báo

| Sự kiện | In-app | Email | Zalo/Telegram | Push Mobile |
|---------|--------|-------|---------------|-------------|
| Task được giao cho tôi | ✓ | ✓ | ✓ | ✓ |
| Task của tôi bị thay đổi status | ✓ | | | ✓ |
| Có comment/mention @tôi | ✓ | ✓ | | ✓ |
| Task sắp hạn (24h) | ✓ | ✓ | ✓ | ✓ |
| Task quá hạn | ✓ | ✓ | ✓ | ✓ |
| Task chờ tôi duyệt | ✓ | ✓ | ✓ | ✓ |
| Reviewer approve/reject | ✓ | ✓ | | ✓ |
| Daily digest | | ✓ | ✓ | |
| Monthly KPI | | ✓ | | |

### 10.2 Escalation tự động

```
Task quá hạn 1 ngày
  → Alert đến Team Leader + badge "At Risk" trên UI

Task quá hạn 3 ngày (Priority High/Critical)
  → Tự động escalate: tạo notification cho Trưởng phòng
  → Gửi Zalo message kèm link task

Task quá hạn 7 ngày HOẶC Critical chưa xử lý
  → Báo cáo thẳng lên BGĐ
  → Ghi nhận vào KPI phòng ban tháng này

Reviewer không phản hồi trong SLA
  → Cấp 1 (24h): nhắc Team Leader
  → Cấp 2 (48h): escalate lên Trưởng phòng
  → Cấp 3 (72h): escalate lên BGĐ + alert khẩn
```

### 10.3 Template thông báo (Zalo)

```
🔔 [CRM-BDS] Task mới được giao

📌 Task: T-2026-0042
📋 Tiêu đề: Lập danh sách khách hàng tiềm năng Vinhomes
⚡ Độ ưu tiên: High
📅 Hạn: 20/06/2026
👤 Giao bởi: Nguyễn Trưởng phòng

👉 Xem chi tiết: [link]
```

---

## 11. Dashboard quản trị

### 11.1 Dashboard Ban Giám đốc

**Màn hình Overview (cập nhật realtime):**
- Tổng task đang chạy / quá hạn / hoàn thành tháng này
- Biểu đồ tỷ lệ hoàn thành đúng hạn theo phòng ban
- Heatmap workload: ai đang bị quá tải?
- Top 5 task Critical chưa xử lý
- KPI tháng này vs tháng trước (so sánh)

### 11.2 Dashboard Trưởng phòng

- Task phòng mình theo trạng thái (Kanban mini)
- Workload từng nhân viên trong phòng
- Task quá hạn cần xử lý ngay
- Danh sách chờ tôi duyệt (Approval inbox)
- KPI phòng vs target tháng

### 11.3 Dashboard Nhân viên (My Tasks)

- Task hôm nay / tuần này
- Progress cá nhân
- Task chờ người khác (Waiting) — blocked by ai?
- Log giờ làm nhanh
- Thông báo chưa đọc

---

## 12. Hiệu năng & Mở rộng

### 12.1 Chiến lược scale

| Vấn đề | Giải pháp |
|--------|-----------|
| Query chậm với > 100k task | Cursor-based pagination, không dùng OFFSET |
| Dashboard nặng | Materialized View refresh 15 phút |
| Realtime WebSocket tải cao | Redis Pub/Sub + room-based (1 room/dept) |
| Attachment lớn | Presigned S3 URL, upload thẳng client → S3 |
| Notification bão (spike) | BullMQ queue, rate-limit per user |
| Search full-text | PostgreSQL GIN index, thêm Elasticsearch khi > 1M task |
| Audit log lớn | Partition `task_history` theo tháng |
| Task cũ tắc bộ nhớ | Archive task `closed` > 90 ngày sang `tasks_archive` |

### 12.2 Stack kỹ thuật đề xuất

```
Backend:   NestJS (TypeScript) + Fastify
Database:  PostgreSQL 16 (primary) + Redis 7 (cache/queue)
Queue:     BullMQ (notification, escalation jobs)
Storage:   Cloudflare R2 hoặc MinIO (attachment)
Realtime:  Socket.io với Redis adapter
Frontend:  Next.js + React Query + Zustand
Mobile:    React Native (share business logic)
Deploy:    Vercel (frontend) + Railway/Render (backend) + Supabase (DB)
```

---

## 13. Ví dụ thực tế

### Kịch bản: Ra mắt dự án Vinhomes Ocean Park Phase 2

```
Project: Vinhomes Ocean Park Phase 2
Owner: PM Nguyễn Hải (Phòng Dự án)
Timeline: 01/06/2026 – 31/07/2026

├── Task T-2026-0041: Chiến dịch Telesale
│   Owner: Team Leader Minh (Phòng KD)
│   Priority: High | Approval: Cấp 2 | Due: 30/06/2026
│   Collaborators:
│     - Designer Lan (Phòng Marketing) — contributor: cung cấp script
│     - PM Hải (Phòng Dự án) — observer: theo dõi tiến độ
│   KPI Target: { calls: 200, appointments: 40 }
│   Checklist:
│     ☑ Lập danh sách 500 KH tiềm năng (done: 01/06)
│     ☑ Chuẩn bị kịch bản telesale (done: 03/06)
│     ☐ Gọi điện 50 KH/tuần (in progress)
│     ☐ Log kết quả vào CRM (todo)
│   ├── Subtask S-001: Phân chia danh sách KH theo nhân viên
│   │   Owner: NV Tuấn | Due: 05/06 | Status: Completed
│   └── Subtask S-002: Báo cáo kết quả telesale tuần 1
│       Owner: NV Hoa  | Due: 08/06 | Status: In Progress
│
├── Task T-2026-0042: Thiết kế vật liệu Marketing
│   Owner: Designer Lan (Phòng Marketing)
│   Priority: Medium | Approval: Cấp 1 | Due: 15/06/2026
│   Collaborators:
│     - TP Marketing (reviewer: duyệt nội dung)
│     - TL Minh (reviewer: check messaging KD)
│   Status: Review → chờ TP duyệt
│
└── Task T-2026-0043: Soạn hợp đồng mua bán
    Owner: Luật sư Hùng (Phòng Pháp lý)
    Priority: Critical | Approval: Cấp 3 | Due: 10/06/2026
    Status: WAITING — blocked: "Chờ quy hoạch 1/500 từ chủ đầu tư"
    Tagged: PM Hải (người cần cung cấp thông tin)
    Note: Nếu vẫn Waiting sau 3 ngày → tự escalate lên BGĐ
```

### Vòng đời task T-2026-0043 (chi tiết):

```
02/06 09:00 — Luật sư Hùng tạo task, status: Todo
02/06 09:15 — Hùng start task, status: In Progress, progress: 10%
03/06 14:00 — Hùng comment: "Cần quy hoạch 1/500 từ CĐT để xác định hạn chế chuyển nhượng"
              Status: Waiting, tagged @PMHải
03/06 14:01 — Hệ thống gửi Zalo notification cho PM Hải
05/06 11:00 — PM Hải upload file quy hoạch vào comment, confirm "đã cung cấp"
              Status: Waiting → In Progress (Hùng unblock)
08/06 17:00 — Hùng update progress: 100%, tick hết checklist, submit review
              Status: In Progress → Review
08/06 17:01 — Hệ thống gửi notification cho BGĐ (approval_level = 3)
09/06 10:00 — BGĐ review, approve với comment "OK, bổ sung điều khoản phạt vi phạm"
              Status: Review → Completed
              KPI Actual: { contracts_drafted: 1, review_time: "2h" }
16/06 10:00 — Hệ thống tự động đóng task (7 ngày sau Completed)
              Status: Completed → Closed
```

---

*Tài liệu này là đầu vào cho Prompt 2 (Database & Backend Implementation) và Prompt 3 (Frontend UI). Version 1.0 — sẽ cập nhật theo phản hồi từ các bên liên quan.*
