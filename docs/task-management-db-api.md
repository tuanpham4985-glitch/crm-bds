# Tài liệu kỹ thuật: Database & API — Task Management
**Phiên bản:** 2.0 (Google Sheets + Repository Pattern)  
**Ngày:** 2026-06-17  
**Stack:** Next.js · TypeScript · Google Sheets API · Service-Repository Pattern  

---

## Mục lục

1. [Kiến trúc tổng thể](#1-kiến-trúc-tổng-thể)
2. [Cấu trúc Google Sheets](#2-cấu-trúc-google-sheets)
3. [Luồng dữ liệu (Data Flow)](#3-luồng-dữ-liệu)
4. [Repository Pattern & Abstraction Layer](#4-repository-pattern--abstraction-layer)
5. [RBAC — Phân quyền](#5-rbac--phân-quyền)
6. [Service Layer — Business Logic](#6-service-layer--business-logic)
7. [API Endpoints (Next.js Route Handlers)](#7-api-endpoints)
8. [Audit Log & Activity Timeline](#8-audit-log--activity-timeline)
9. [Caching Strategy](#9-caching-strategy)
10. [Search, Filter & Pagination](#10-search-filter--pagination)
11. [Batch Update & Performance](#11-batch-update--performance)
12. [Migration Path: Sheets → PostgreSQL](#12-migration-path-sheets--postgresql)
13. [Seed Data](#13-seed-data)

---

## 1. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────┐
│                    NEXT.JS (Vercel)                      │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │  Route       │   │  Service     │   │  Repository │ │
│  │  Handlers    │──▶│  Layer       │──▶│  Interface  │ │
│  │  /api/tm/*   │   │  (business   │   │  (abstract) │ │
│  └──────────────┘   │   logic,     │   └──────┬──────┘ │
│                     │   RBAC,      │          │        │
│  ┌──────────────┐   │   cache)     │    ┌─────┴──────┐ │
│  │  RBAC        │◀──│              │    │ Sheets     │ │
│  │  Middleware  │   └──────────────┘    │ Repository │ │
│  └──────────────┘                       │ (concrete) │ │
│                                         └──────┬─────┘ │
└──────────────────────────────────────────────────│──────┘
                                                   │
                               ┌───────────────────▼──────┐
                               │    Google Sheets API      │
                               │    (10 tabs TM_*)         │
                               └──────────────────────────┘
```

**Nguyên tắc thiết kế:**
- Service Layer không biết đến Google Sheets — chỉ gọi qua `IRepository` interface.
- Khi migrate sang PostgreSQL: chỉ cần implement `IRepository` mới, không sửa gì ở Service.
- Cache in-memory (LRU + TTL) để giảm Sheets API quota.
- Tất cả mutation đều ghi `ActivityLog` tự động trong Service.

---

## 2. Cấu trúc Google Sheets

### Sheet TM_Tasks

| Cột | Kiểu | Bắt buộc | Validate | Ghi chú |
|-----|------|----------|----------|---------|
| task_id | UUID | ✓ | gen_uuid() | Primary Key |
| task_code | String | ✓ | T-YYYY-NNNN | Auto-generated |
| title | String | ✓ | max 255 ký tự | |
| objective | String | ✓ | | Mục tiêu đo được |
| description | String | | | Markdown |
| project_id | UUID | ✓ | ref TM_Projects | Foreign Key |
| department_id | UUID | ✓ | ref TM_Departments | Foreign Key |
| owner_id | UUID | ✓ | ref TM_Users | 1 người duy nhất |
| collaborator_ids | JSON | | `[{user_id, role}]` | Mảng collaborators |
| priority | Enum | ✓ | critical/high/medium/low | |
| status | Enum | ✓ | todo/inprogress/waiting/review/completed/closed | |
| progress_pct | Number | ✓ | 0–100 | Tính từ checklist |
| start_date | Date | ✓ | YYYY-MM-DD | |
| due_date | Date | ✓ | YYYY-MM-DD, ≥ start_date | |
| estimated_hours | Number | | ≥ 0 | |
| actual_hours | Number | | ≥ 0, tổng từ ActivityLogs | Tính toán |
| kpi_target | JSON | | `[{unit,target,currency?}]` | |
| kpi_actual | JSON | | `[{unit,actual}]` | Cập nhật khi chạy |
| approval_level | Number | ✓ | 1, 2, 3 | |
| approval_status | Enum | ✓ | not_required/pending/approved/rejected | |
| approved_by | UUID | | ref TM_Users | |
| approved_at | DateTime | | ISO 8601 | |
| rejection_reason | String | | | Bắt buộc khi rejected |
| tags | String | | comma-separated | |
| created_by | UUID | ✓ | ref TM_Users | |
| created_at | DateTime | ✓ | ISO 8601 | |
| updated_at | DateTime | ✓ | ISO 8601 | Auto-update |
| closed_at | DateTime | | ISO 8601 | |
| deleted_at | DateTime | | ISO 8601 | Soft delete |

### Sheet TM_Subtasks

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| subtask_id | UUID | PK |
| subtask_code | String | S-YYYY-NNNN |
| parent_task_id | UUID | FK → TM_Tasks |
| title | String | |
| objective | String | |
| description | String | |
| owner_id | UUID | FK → TM_Users |
| collaborator_ids | JSON | |
| priority | Enum | |
| status | Enum | |
| progress_pct | Number | |
| start_date | Date | |
| due_date | Date | |
| estimated_hours | Number | |
| actual_hours | Number | |
| created_by | UUID | |
| created_at | DateTime | |
| updated_at | DateTime | |
| deleted_at | DateTime | |

### Sheet TM_Checklists

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| checklist_id | UUID | PK |
| task_id | UUID | FK → Tasks hoặc Subtasks |
| task_type | Enum | "task" \| "subtask" |
| title | String | max 255 ký tự |
| is_done | Boolean | TRUE/FALSE |
| done_by | UUID | FK → TM_Users |
| done_at | DateTime | |
| sort_order | Number | 0, 1, 2... |
| created_at | DateTime | |

**Công thức tính progress (trong Sheet):**
```
=COUNTIF(TM_Checklists!B:B, task_id, TM_Checklists!E:E, "TRUE") / COUNTIF(TM_Checklists!B:B, task_id) * 100
```

### Sheet TM_Comments

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| comment_id | UUID | PK |
| task_id | UUID | FK |
| task_type | Enum | "task" \| "subtask" |
| user_id | UUID | FK → TM_Users |
| body | String | Markdown, max 10k chars |
| mentions | JSON | ["user_id1", "user_id2"] |
| attachment_urls | JSON | [{name, url, size_kb}] |
| parent_comment_id | UUID | Nullable, cho threading |
| created_at | DateTime | |
| edited_at | DateTime | |
| is_deleted | Boolean | Soft delete |

### Sheet TM_Attachments

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| attachment_id | UUID | PK |
| task_id | UUID | FK |
| task_type | Enum | |
| uploaded_by | UUID | FK → TM_Users |
| file_name | String | |
| file_url | String | Google Drive hoặc S3 URL |
| file_type | String | pdf, docx, png... |
| file_size_kb | Number | |
| created_at | DateTime | |

### Sheet TM_Notifications

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| notif_id | UUID | PK |
| user_id | UUID | Người nhận |
| type | String | task_assigned, review_required... |
| title | String | Tiêu đề thông báo |
| body | String | Nội dung |
| task_id | UUID | FK |
| task_type | Enum | |
| channel | Enum | inapp/email/zalo/telegram/push |
| status | Enum | pending/sent/failed/read |
| metadata | JSON | Extra context |
| created_at | DateTime | |
| sent_at | DateTime | |
| read_at | DateTime | |

### Sheet TM_ActivityLogs (Audit Log)

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| log_id | UUID | PK |
| task_id | UUID | FK |
| task_type | Enum | |
| user_id | UUID | Người thực hiện |
| action | Enum | created/updated/status_changed/approved... |
| old_value | JSON | Trạng thái trước |
| new_value | JSON | Trạng thái sau |
| metadata | JSON | Context bổ sung |
| ip_address | String | |
| created_at | DateTime | |

### Sheet TM_Users

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| user_id | UUID | PK |
| employee_code | String | NV001 |
| full_name | String | |
| email | String | Unique |
| phone | String | |
| department_id | UUID | FK → TM_Departments |
| team_id | UUID | |
| role | Enum | director/manager/team_leader/staff |
| position | String | Chức danh |
| avatar_url | String | |
| zalo_id | String | |
| is_active | Boolean | |
| last_active_at | DateTime | |
| created_at | DateTime | |
| updated_at | DateTime | |

### Sheet TM_Departments

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| dept_id | UUID | PK |
| name | String | "Phòng Kinh doanh" |
| code | String | KD, MKT, LEGAL, PM, HR |
| manager_id | UUID | FK → TM_Users |
| parent_dept_id | UUID | Nullable |
| description | String | |
| is_active | Boolean | |
| sort_order | Number | |
| created_at | DateTime | |
| updated_at | DateTime | |

### Sheet TM_Projects

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| project_id | UUID | PK |
| name | String | "Vinhomes Ocean Park Phase 2" |
| code | String | VOP2 |
| description | String | |
| owner_id | UUID | FK → TM_Users |
| department_ids | JSON | ["dept_id1", "dept_id2"] |
| member_ids | JSON | ["user_id1", ...] |
| status | Enum | planning/active/on_hold/completed/cancelled |
| start_date | Date | |
| end_date | Date | |
| budget | Number | VNĐ |
| tags | String | comma-separated |
| created_by | UUID | |
| created_at | DateTime | |
| updated_at | DateTime | |
| archived_at | DateTime | |

---

## 3. Luồng dữ liệu

### 3.1 Create Task Flow

```
Client (Browser)
   │ POST /api/tm/tasks { title, owner_id, ... }
   ▼
Route Handler (src/app/api/tm/tasks/route.ts)
   │ 1. Validate request body (zod schema)
   │ 2. Resolve user từ session
   ▼
RBAC Middleware
   │ Check: user.role có quyền task:create:own_dept?
   │ Nếu cross-dept: cần task:create:any
   ▼
TaskService.createTask(ctx, input)
   │ 1. this.uow.tasks.create(input, createdBy)
   │ 2. this.uow.checklists.bulkCreate(...) [nếu có]
   │ 3. this.uow.activityLogs.log('created')
   │ 4. this.notif.notifyTaskAssigned(task)
   │ 5. tmCache.invalidatePrefix('tasks:dept:...')
   ▼
TaskSheetsRepository.create(input, createdBy)
   │ 1. nextTaskCode() — load sheet, tìm max code
   │ 2. Serialize data → Record<string,string>
   │ 3. appendRow(SHEET_NAMES.TASKS, row)
   ▼
Google Sheets API
   │ sheets.spreadsheets.values.append(...)
   ▼
Response: 201 { task }
```

### 3.2 Status Transition Flow

```
PATCH /api/tm/tasks/:id/status { new_status: "review" }
   │
   ▼
TaskService.transitionStatus(ctx, taskId, "review")
   │ 1. requireTask(taskId)  ← Sheets read
   │ 2. canUpdateTask(ctx, task)  ← RBAC check
   │ 3. validateTransition("inprogress" → "review")
   │ 4. Check progress = 100% (Sheets read checklists)
   │ 5. tasks.updateStatus(taskId, "review")  ← Sheets write
   │ 6. activityLogs.log('status_changed')
   │ 7. notif.notifyReviewRequired(task)
   │ 8. Cache invalidation
   ▼
Response: 200 { task }
```

### 3.3 Checklist Toggle Flow

```
PATCH /api/tm/checklists/:id/toggle { is_done: true }
   │
   ▼
TaskService.toggleChecklist(ctx, checklistId, true)
   │ 1. checklists.toggle(checklistId, true, userId)  ← Sheets write
   │ 2. checklists.progressByTask(taskId)            ← Sheets read
   │ 3. Tính newPct = (done/total) * 100
   │ 4. tasks.updateProgress(taskId, newPct)         ← Sheets write
   │ 5. activityLogs.log('checklist_toggled')
   │ 6. Cache invalidate checklists + task
   ▼
Response: 200 { checklist, parent_progress }
```

---

## 4. Repository Pattern & Abstraction Layer

### 4.1 Cấu trúc file

```
src/lib/task-management/
├── index.ts                      ← Public API + Factory
├── types.ts                      ← All TypeScript types
├── repository.interface.ts       ← Abstract interfaces (ITaskRepository...)
├── cache.ts                      ← LRU cache + helpers
│
├── sheets/
│   ├── client.ts                 ← Google Sheets wrapper (loadRows, appendRow...)
│   ├── base.repository.ts        ← Generic CRUD base class
│   └── task.repository.ts        ← Task, Subtask, Checklist repositories
│
├── rbac/
│   └── rbac.ts                   ← RBAC service + permissions map
│
└── services/
    ├── task.service.ts            ← Task CRUD + workflow
    ├── notification.service.ts   ← Notification events
    └── kpi.service.ts            ← KPI Dashboard
```

### 4.2 Interface-Implementation Mapping

```typescript
// Khai báo (repository.interface.ts) — không biết gì về Sheets
interface ITaskRepository {
  findById(taskId: string): Promise<TmTask | null>;
  create(input: CreateTaskInput, createdBy: string): Promise<TmTask>;
  updateStatus(...): Promise<TmTask>;
  // ...
}

// Sheets Implementation (sheets/task.repository.ts)
class TaskSheetsRepository implements ITaskRepository {
  async findById(taskId: string) {
    const rows = await loadRows(SHEET_NAMES.TASKS);
    const row  = rows.find(r => r.task_id === taskId);
    return row ? this.deserialize(row) : null;
  }
  // ...
}

// PostgreSQL Implementation (future — không cần sửa Service)
class TaskPostgresRepository implements ITaskRepository {
  async findById(taskId: string) {
    return db.query('SELECT * FROM tasks WHERE task_id = $1', [taskId]);
  }
  // ...
}
```

---

## 5. RBAC — Phân quyền

### 5.1 Permission Codes

```
task:create:own_dept    — Tạo task trong phòng mình
task:create:any         — Tạo task ở bất kỳ phòng
task:read:own           — Xem task của mình / là collaborator
task:read:dept          — Xem tất cả task trong phòng
task:read:all           — Xem tất cả task công ty
task:update:own         — Sửa task mình là owner
task:update:dept        — Sửa task trong phòng
task:update:any         — Sửa mọi task
task:delete:draft       — Xóa task ở trạng thái Todo
task:delete:any         — Xóa bất kỳ task
task:transfer_owner     — Chuyển Owner
task:set_priority       — Đổi priority
task:extend_due_date    — Gia hạn không giới hạn
task:extend_due_3days   — Gia hạn tối đa 3 ngày
task:approve:l1         — Duyệt cấp 1
task:approve:l2         — Duyệt cấp 2
task:approve:l3         — Duyệt cấp 3
task:reject             — Từ chối
task:reopen             — Mở lại task đã Complete
task:escalate           — Leo thang lên cấp trên
task:assign:cross_dept  — Giao việc liên phòng ban
kpi:view:company        — Xem KPI toàn công ty
kpi:view:dept           — Xem KPI phòng ban
report:export           — Export báo cáo
comment:any             — Bình luận vào mọi task
comment:dept            — Bình luận trong phòng
comment:own             — Bình luận task của mình
```

### 5.2 Role → Permissions

| Permission | director | manager | team_leader | staff |
|-----------|:--------:|:-------:|:-----------:|:-----:|
| create:any | ✓ | | | |
| create:own_dept | ✓ | ✓ | ✓ | |
| read:all | ✓ | | | |
| read:dept | ✓ | ✓ | ✓ | |
| read:own | ✓ | ✓ | ✓ | ✓ |
| update:any | ✓ | | | |
| update:dept | ✓ | ✓ | ✓ | |
| update:own | ✓ | ✓ | ✓ | ✓ |
| delete:any | ✓ | | | |
| delete:draft | ✓ | ✓ | | |
| extend_due_date | ✓ | ✓ | | |
| extend_due_3days | ✓ | ✓ | ✓ | |
| approve:l3 | ✓ | | | |
| approve:l2 | ✓ | ✓ | | |
| approve:l1 | ✓ | ✓ | ✓ | |
| assign:cross_dept | ✓ | ✓ | | |
| kpi:view:company | ✓ | | | |
| kpi:view:dept | ✓ | ✓ | | |
| report:export | ✓ | ✓ | ✓ | |

### 5.3 Sử dụng trong Route Handler

```typescript
// src/app/api/tm/tasks/route.ts
import { getTaskService, PERMISSIONS, requirePermission } from '@/lib/task-management';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request) {
  const user  = await getCurrentUser(req);
  const input = await req.json();

  const ctx = {
    user_id:       user.user_id,
    role:          user.role,
    department_id: user.department_id,
    team_id:       user.team_id,
  };

  try {
    const task = await getTaskService().createTask(ctx, input);
    return Response.json({ data: task }, { status: 201 });
  } catch (err: any) {
    if (err.name === 'RbacError')        return Response.json({ error: err.message }, { status: 403 });
    if (err.name === 'ValidationError')  return Response.json({ error: err.message }, { status: 400 });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

## 6. Service Layer — Business Logic

### TaskService — methods

| Method | Mô tả |
|--------|-------|
| `createTask(ctx, input)` | Tạo task, auto-generate code, bulk-create checklists, notify owner |
| `getTask(ctx, taskId)` | Lấy task kèm subtasks/checklists/comments, kiểm tra RBAC |
| `listTasks(ctx, filters, pagination)` | Danh sách có scope theo role |
| `listOverdue(ctx)` | Task quá hạn trong phạm vi quyền |
| `getPendingApprovals(ctx)` | Task chờ duyệt của reviewer |
| `updateTask(ctx, taskId, input)` | Sửa task, kiểm tra extension limit cho team_leader |
| `transitionStatus(ctx, taskId, newStatus, reason?)` | Chuyển trạng thái với validation đầy đủ |
| `updateProgress(ctx, taskId, pct)` | Cập nhật %, auto-sync status todo→inprogress |
| `approveTask(ctx, taskId)` | Duyệt task, kiểm tra approval_level vs role |
| `rejectTask(ctx, taskId, reason)` | Từ chối, reason bắt buộc, quay về inprogress |
| `escalateTask(ctx, taskId)` | Tăng approval_level, notify cấp trên |
| `addCollaborator(ctx, taskId, userId, role)` | Thêm collaborator, check cross-dept perm |
| `removeCollaborator(ctx, taskId, userId)` | Xóa collaborator |
| `createSubtask(ctx, parentTaskId, input)` | Tạo subtask kế thừa project/dept từ parent |
| `toggleChecklist(ctx, checklistId, isDone)` | Tick/untick + auto-update parent progress |
| `deleteTask(ctx, taskId)` | Soft delete với validation |

### KpiService — methods

| Method | Mô tả |
|--------|-------|
| `getCompanyDashboard(ctx)` | KPI tổng hợp toàn công ty, BGĐ only |
| `getDeptKpi(ctx, deptId)` | KPI phòng ban |
| `getUserKpi(ctx, userId)` | KPI cá nhân |

---

## 7. API Endpoints

### Tasks

```
GET    /api/tm/tasks                   Danh sách (filter + pagination)
POST   /api/tm/tasks                   Tạo task
GET    /api/tm/tasks/:id               Chi tiết + subtasks + checklists
PUT    /api/tm/tasks/:id               Update task
PATCH  /api/tm/tasks/:id/status        Chuyển trạng thái
PATCH  /api/tm/tasks/:id/progress      Cập nhật progress %
PATCH  /api/tm/tasks/:id/owner         Chuyển Owner
DELETE /api/tm/tasks/:id               Soft delete
POST   /api/tm/tasks/:id/approve       Phê duyệt
POST   /api/tm/tasks/:id/reject        Từ chối (body: { reason })
POST   /api/tm/tasks/:id/escalate      Leo thang approval
```

### Collaborators

```
GET    /api/tm/tasks/:id/collaborators
POST   /api/tm/tasks/:id/collaborators         { user_id, role }
DELETE /api/tm/tasks/:id/collaborators/:userId
```

### Subtasks

```
GET    /api/tm/tasks/:id/subtasks
POST   /api/tm/tasks/:id/subtasks
GET    /api/tm/subtasks/:id
PUT    /api/tm/subtasks/:id
PATCH  /api/tm/subtasks/:id/status
DELETE /api/tm/subtasks/:id
```

### Checklists

```
GET    /api/tm/tasks/:id/checklists
POST   /api/tm/tasks/:id/checklists            { title, sort_order }
POST   /api/tm/tasks/:id/checklists/bulk       [{ title, sort_order }]
PATCH  /api/tm/checklists/:id/toggle           { is_done }
PUT    /api/tm/tasks/:id/checklists/reorder    { ordered_ids }
DELETE /api/tm/checklists/:id
```

### Comments

```
GET    /api/tm/tasks/:id/comments
POST   /api/tm/tasks/:id/comments              { body, mentions?, parent_comment_id? }
PUT    /api/tm/comments/:id                    { body }
DELETE /api/tm/comments/:id
```

### KPI & Reports

```
GET    /api/tm/kpi/company                     BGĐ only
GET    /api/tm/kpi/department/:id
GET    /api/tm/kpi/user/:id
GET    /api/tm/reports/overdue
GET    /api/tm/reports/workload
POST   /api/tm/reports/export                  { format: "xlsx"|"pdf", filters }
```

### Notifications

```
GET    /api/tm/notifications                   ?unread_only=true
PATCH  /api/tm/notifications/:id/read
PATCH  /api/tm/notifications/read-all
GET    /api/tm/notifications/count             Badge count
```

### Query Parameters (GET /api/tm/tasks)

```
?status=inprogress,waiting    Multiple values với dấu phẩy
?priority=high,critical
?owner_id=uuid
?department_id=uuid
?project_id=uuid
?due_before=2026-06-30
?due_after=2026-06-01
?overdue_only=true
?tags=sale,vinhomes
?search=telesale
?page=1&limit=50
```

---

## 8. Audit Log & Activity Timeline

Mọi mutation trong Service đều tự động ghi `TM_ActivityLogs`:

```typescript
// Ví dụ log entry khi chuyển trạng thái
{
  log_id:    "uuid",
  task_id:   "T-2026-0042",
  task_type: "task",
  user_id:   "user_minh",
  action:    "status_changed",
  old_value: { "status": "inprogress" },
  new_value: { "status": "review" },
  metadata:  { "checklist_done": 5, "checklist_total": 5 },
  created_at: "2026-06-17T14:30:00Z"
}
```

**Activity Timeline API:**
```
GET /api/tm/tasks/:id/activity?limit=20
→ Returns: TmActivityLog[] sorted by created_at DESC
```

---

## 9. Caching Strategy

```typescript
// Từ cache.ts
const TTL = {
  TASK_DETAIL:  30_000,   // 30s  — task thay đổi thường xuyên
  TASK_LIST:    15_000,   // 15s  — list refresh nhanh
  USER_LIST:    300_000,  // 5min — user ít thay đổi
  PROJECT_LIST: 300_000,  // 5min
  KPI:          900_000,  // 15min — tính toán nặng
  OVERDUE:      60_000,   // 1min — gần realtime
  NOTIF_COUNT:  10_000,   // 10s  — badge count
};

// Cache invalidation on mutation:
// - Khi update task → invalidate task detail + task list của dept
// - Khi approve/complete → invalidate KPI dept + company
// - Khi checklist toggle → invalidate task detail
```

---

## 10. Search, Filter & Pagination

### In-memory filtering (Sheets)

```typescript
// Tất cả filtering thực hiện in-memory sau khi load sheet
// Thứ tự: filter → sort → paginate

1. loadRows(SHEET_NAMES.TASKS)          // Sheets API call
2. filter by status[]                   // O(n)
3. filter by priority[]                 // O(n)
4. filter by owner_id / dept / project  // O(n)
5. filter overdue (due_date < today)    // O(n)
6. searchRows(query, ['title','objective']) // O(n*m)
7. sortByField('due_date', 'asc')       // O(n log n)
8. paginateRows(page, limit)            // O(1) slice
```

### Full-text search

```typescript
// Trigram-style search (case-insensitive, partial match)
function searchRows(rows, query, fields) {
  const q = query.toLowerCase().trim();
  return rows.filter(r =>
    fields.some(f => (r[f] || '').toLowerCase().includes(q))
  );
}
// Search on: title, objective, task_code, tags
```

### Cursor pagination (khi chuyển sang PostgreSQL)

```typescript
// Hiện tại: page-based (đơn giản cho Sheets)
GET /api/tm/tasks?page=2&limit=50

// Future PostgreSQL: cursor-based
GET /api/tm/tasks?cursor=2026-06-17T14:00:00Z_uuid&limit=50
Response: { data, next_cursor, has_more }
```

---

## 11. Batch Update & Performance

### Google Sheets API Limits

| Limit | Value | Xử lý |
|-------|-------|-------|
| Read requests | 300/min/project | Cache TTL giảm calls |
| Write requests | 300/min/project | BullMQ queue (future) |
| Cells per request | 500 rows | appendRows() chunk |
| Concurrent saves | ~50 | batchUpdateRows() |

### Batch patterns

```typescript
// 1. Bulk create checklists (1 API call thay vì N)
await appendRows(SHEET_NAMES.CHECKLISTS, checklistRows); // max 500/call

// 2. Batch update nhiều rows (50 concurrent saves)
await batchUpdateRows(SHEET_NAMES.CHECKLISTS, 'checklist_id', updates);

// 3. Load-once, filter-many (cache sheet data)
const rows = await loadRows(SHEET_NAMES.TASKS);  // 1 API call
const byDept = rows.filter(r => r.department_id === deptId);
const overdue = rows.filter(r => r.due_date < today);
// Reuse `rows` for multiple queries
```

---

## 12. Migration Path: Sheets → PostgreSQL

**Không cần sửa bất kỳ Service nào.** Chỉ:

**Bước 1:** Implement `ITaskRepository` với PostgreSQL:
```typescript
class TaskPostgresRepository implements ITaskRepository {
  async findById(taskId: string) {
    const r = await db.query(
      'SELECT * FROM tasks WHERE task_id = $1 AND deleted_at IS NULL',
      [taskId]
    );
    return r.rows[0] ?? null;
  }
  async create(input, createdBy) { /* INSERT */ }
  // ...
}
```

**Bước 2:** Swap trong factory (`index.ts`):
```typescript
function buildUoW(): ITaskManagementUoW {
  if (process.env.USE_POSTGRES === 'true') {
    return {
      tasks: new TaskPostgresRepository(),
      // ...
    };
  }
  return {
    tasks: new TaskSheetsRepository(),
    // ...
  };
}
```

**Bước 3:** Data migration (Sheets → PG):
```bash
npx tsx scripts/task-management/migrate-sheets-to-pg.ts
```

---

## 13. Seed Data

```typescript
// scripts/task-management/seed.ts
// Chạy: npx tsx scripts/task-management/seed.ts

const SEED_DEPARTMENTS = [
  { dept_id: 'dept-kd',    name: 'Phòng Kinh doanh',  code: 'KD',    sort_order: 1 },
  { dept_id: 'dept-mkt',   name: 'Phòng Marketing',   code: 'MKT',   sort_order: 2 },
  { dept_id: 'dept-legal', name: 'Phòng Pháp lý',     code: 'LEGAL', sort_order: 3 },
  { dept_id: 'dept-pm',    name: 'Phòng Dự án',       code: 'PM',    sort_order: 4 },
  { dept_id: 'dept-hr',    name: 'Phòng Hành chính',  code: 'HR',    sort_order: 5 },
];

const SEED_USERS = [
  { user_id: 'user-bgd',  full_name: 'Nguyễn Giám đốc', role: 'director',    department_id: 'dept-pm'  },
  { user_id: 'user-tp-kd',full_name: 'Trần Trưởng phòng',role: 'manager',    department_id: 'dept-kd'  },
  { user_id: 'user-tl',   full_name: 'Lê Team Leader',  role: 'team_leader', department_id: 'dept-kd'  },
  { user_id: 'user-minh', full_name: 'Phạm Minh',       role: 'staff',       department_id: 'dept-kd'  },
  { user_id: 'user-lan',  full_name: 'Nguyễn Lan',      role: 'staff',       department_id: 'dept-mkt' },
  { user_id: 'user-hung', full_name: 'Vũ Hùng',         role: 'staff',       department_id: 'dept-legal'},
];

const SEED_PROJECTS = [
  { project_id: 'proj-vop2', name: 'Vinhomes Ocean Park Phase 2', code: 'VOP2', status: 'active' },
  { project_id: 'proj-manor', name: 'The Manor Central Park',     code: 'MANOR', status: 'planning' },
];

const SEED_TASKS = [
  {
    task_code:      'T-2026-0001',
    title:          'Chiến dịch Telesale VOP2 - Tháng 6',
    objective:      'Thực hiện 200 cuộc gọi telesale, đặt lịch 40 buổi xem nhà',
    project_id:     'proj-vop2',
    department_id:  'dept-kd',
    owner_id:       'user-minh',
    priority:       'high',
    status:         'inprogress',
    progress_pct:   40,
    start_date:     '2026-06-01',
    due_date:       '2026-06-30',
    estimated_hours: 80,
    kpi_target:     '[{"unit":"calls","target":200},{"unit":"appointments","target":40}]',
    approval_level: 2,
  },
  {
    task_code:      'T-2026-0002',
    title:          'Thiết kế vật liệu marketing VOP2',
    objective:      'Hoàn thiện bộ ấn phẩm: brochure, banner, tờ rơi cho dự án VOP2',
    project_id:     'proj-vop2',
    department_id:  'dept-mkt',
    owner_id:       'user-lan',
    priority:       'medium',
    status:         'review',
    progress_pct:   100,
    start_date:     '2026-06-01',
    due_date:       '2026-06-15',
    estimated_hours: 40,
    approval_level: 1,
  },
  {
    task_code:      'T-2026-0003',
    title:          'Soạn mẫu hợp đồng mua bán VOP2',
    objective:      'Soạn và phê duyệt hợp đồng mua bán căn hộ theo quy định mới nhất',
    project_id:     'proj-vop2',
    department_id:  'dept-legal',
    owner_id:       'user-hung',
    priority:       'critical',
    status:         'waiting',
    progress_pct:   30,
    start_date:     '2026-06-02',
    due_date:       '2026-06-10',
    estimated_hours: 24,
    approval_level: 3,
  },
];
```

**Chạy seed:**
```bash
npx tsx scripts/task-management/seed.ts
```

---

*Tài liệu này là đầu vào cho Prompt 3 (Frontend UI Components) và Prompt 4 (API Route Handlers).  
Mọi thay đổi schema cần cập nhật `SHEET_COLUMNS` trong `src/lib/task-management/types.ts`.*
