# M1B.2 — Campaign Handoff & Sale Ownership: Authority Document

**Dự án:** CRM-BDS — Campaign CSKH (M1B series)
**Phạm vi:** Chuyển tiếp `CampaignMembership` (Quan tâm) → Handoff → Sale ownership → Pipeline
**Trạng thái:** `APPROVED FOR IMPLEMENTATION` — **CHƯA implemented, CHƯA production validated**
**Ngày chốt authority:** 2026-08-27
**Baseline tại thời điểm chốt:** `5b992b8` (origin/main)

---

## 0. Trạng thái tài liệu

| Giai đoạn | Trạng thái |
|---|---|
| M1A (Campaign foundation) | Implemented, production-released |
| M1B.1 (Campaign CSKH: interaction/qualification/scoring) | Implemented, **production validated** (`M1B1_PRODUCTION_VALIDATION_PASS`) |
| Admin Test Data Cleanup (Campaign delete) | Implemented, **production validated** (`ADMIN_TEST_DATA_CLEANUP_PRODUCTION_VALIDATED`) |
| **M1B.2 (Handoff → Sale ownership → Pipeline)** | **Design audited + business authority LOCKED (tài liệu này). Chưa có code nào được viết.** |

Không có dòng production code nào cho M1B.2 tồn tại tại thời điểm chốt tài liệu này. Tài liệu này là authority để bắt đầu implementation ở phiên làm việc tiếp theo — nó không tự nó là bằng chứng đã implement hay đã production-validate.

---

## 1. Bối cảnh — locked model đã có (không đổi)

```
Customer (KhachHang)          — master identity, KHÔNG đổi bởi tài liệu này
   │
Campaign                      — owner = Leader phụ trách
   │  id_du_an → Project.ds_sale = authoritative Sale roster cho Leader distribution
   ▼
CampaignMembership             — Campaign-scoped CSKH authority
   telesale_id/name            = Sale CSKH, KHÔNG PHẢI Sale ownership
   interaction/qualification/scoring — Campaign-scoped, không mirror Customer
```

Đã production-validated: Admin → Campaign → Leader → Leader phân Sale CSKH → Sale chăm sóc/đánh giá → `INTERESTED/QUALIFIED/HOT` — **hiện tại KHÔNG có Handoff/Pipeline/Sale ownership nào được tạo** (M1B.2 đóng cho tới tài liệu này).

---

## 2. Existing authority — được TÁI SỬ DỤNG (không đổi hành vi)

Những cơ chế dưới đây đã tồn tại trong source, được M1B.2 **reuse nguyên vẹn**, không viết engine song song:

| # | Cơ chế | Nguồn | Đảm bảo gì |
|---|---|---|---|
| 1 | `CrmHandoff.active_key` UNIQUE (nullable) | `prisma/schema.prisma:138`; migration `20260825000002_add_qualified_lead_funnel/migration.sql:55` | Đúng 1 Handoff đang mở cho 1 Customer, **toàn hệ thống** (không phân biệt nguồn Campaign hay legacy) — DB-level. |
| 2 | `CrmHandoff.idempotency_key` UNIQUE, not null | schema:137; migration:54 | Request-level idempotency cho hành động tạo/transition Handoff. |
| 3 | `CrmPipelineLink.customer_id` + `.pipeline_id` UNIQUE | schema:260-266; migration:67-68 | Đúng 1 Pipeline / Customer qua con đường `ensurePipeline()`. |
| 4 | `ensurePipeline()` | `src/lib/crm-funnel/transactional-workflow.ts:247-270` | Deterministic Pipeline id, kiểm tra Link trước khi tạo — exactly-once. |
| 5 | `transitionHandoffTransactional()` | `transactional-workflow.ts:272-358` | State machine `WAITING_ACCEPTANCE/NEEDS_MANAGER → ACCEPTED/REJECTED`, `Serializable` transaction + retry on `P2002/P2034`, `isOwnershipLocked()` guard. |
| 6 | `isHandoffEligible()` | `src/lib/crm-funnel/handoff-policy.ts:11-13` | `INTERESTED\|QUALIFIED\|HOT` là tập điều kiện đủ — logic này **đã đúng** với quyết định M1B.2 §1, không cần viết lại. |
| 7 | `canManageCampaign()` | `src/lib/crm-auth.ts:120-122` | Admin hoặc đúng `Campaign.owner_name` — authority Leader initiator tái dùng nguyên hàm này. |
| 8 | `eligibleCampaignSales()` | `src/lib/campaign-sale-eligibility.ts` | Admin = toàn bộ active Sale; Leader = giao của active Sale với `Project.ds_sale`; không roster → `blocked:true`, không fallback company-wide. **Đây chính là cơ chế Option 3 Hybrid đã build sẵn cho CSKH distribution — M1B.2 áp dụng lại cho Sale-ownership picker.** |
| 9 | `CampaignMembership.outcome`, `.handoff_id` | schema:225-226 | Cột đã tồn tại từ migration Campaign Foundation, **chưa có code nào ghi giá trị** — xác nhận bằng `tests/crm/campaign.test.ts` (evidence test, grep toàn bộ `src/`). |
| 10 | `CrmHandoff.campaign_membership_id` | schema:160 | Cột đã tồn tại, loose reference (không FK), **chưa có code nào ghi giá trị** — cùng evidence test. |
| 11 | `CampaignMembership.row_version` | schema:244 | Optimistic-concurrency guard đã dùng cho interaction/qualification — tái dùng cho initiation. |

**Không có cột/bảng/index nào cần thêm.** Toàn bộ nguyên liệu DB-level cho M1B.2 đã được provision từ migration `20260825000002_add_qualified_lead_funnel` và `20260826000001_add_campaign_foundation`.

---

## 3. New M1B.2 authority — LOCKED (chưa có trong code, là quyết định của phiên này)

### 3.1 Trigger
`CampaignMembership.trang_thai_cham_soc === "Quan tâm"` (⇔ `qualification_status ∈ {INTERESTED, QUALIFIED, HOT}`) → **handoff candidate only**. KHÔNG auto-create `CrmHandoff`. QUALIFIED/HOT không phải trigger khác — chỉ là qualification layer trên cùng business fact "Quan tâm" (đã xác nhận qua `scoring.ts`'s `qualificationStatus()`: 3 giá trị này chỉ đạt được khi `trang_thai_cham_soc === 'Quan tâm'`).

### 3.2 Handoff initiator
- Admin: global authority.
- `Campaign.owner` (Leader): qua `canManageCampaign()`.
- **KHÔNG** dùng `Project.truong_nhom`.
- Sale CSKH không tự initiate chỉ vì đang được gán `telesale_id`.

### 3.3 Ownership Sale eligibility — Option 3 Hybrid (LOCKED)
- Leader: chỉ active `vai_tro === "Sale"` thuộc `Campaign.id_du_an → Project.ds_sale` (qua `eligibleCampaignSales()`). Roster không resolve được → **BLOCK**, không fallback company-wide.
- Admin: toàn bộ active `vai_tro === "Sale"`.
- Sale CSKH hiện tại (`CampaignMembership.telesale_*`) có thể được UI **pre-highlight/gợi ý**, nhưng **không auto-select** — Leader/Admin phải explicit confirm target Sale.

### 3.4 Sale CSKH ≠ Sale ownership (boundary siết chặt)
- `CampaignMembership.telesale_id/name` giữ nguyên semantics M1B.1 — Sale CSKH, không phải ownership.
- `Customer.sale_phu_trach` **chỉ được set** tại thời điểm transaction `accept` của target Sale commit thành công.
- Trước `accept`: không set `sale_phu_trach`, không tạo Pipeline, không tạo ownership dưới bất kỳ hình thức nào.
- `sale_nhan_khach` giữ nguyên vai trò "pending receiver" như legacy Handoff flow — không phải ownership.

### 3.5 State machine (tối thiểu, reuse `CrmHandoff.status` — KHÔNG thêm enum mới)
```
Candidate:        trang_thai_cham_soc = "Quan tâm", handoff_id = null, outcome = null
        │  Leader/Admin explicit "Bàn giao" + chọn Sale (§3.2, §3.3)
        ▼
CrmHandoff.status = WAITING_ACCEPTANCE
CrmHandoff.campaign_membership_id = <membership.id>          [MỚI — cột có sẵn, lần đầu được ghi]
CampaignMembership.handoff_id = <handoff.id>                 [MỚI — cột có sẵn, lần đầu được ghi]
CampaignMembership.outcome = "HANDOFF_INITIATED"              [MỚI — giá trị vocabulary mới]
        │
        ├─ target Sale ACCEPT → CrmHandoff.status = ACCEPTED (terminal)
        │                        Customer.sale_phu_trach set (existing accept-branch logic)
        │                        Pipeline ensure (ensurePipeline(), exactly-once)
        │                        CampaignMembership.outcome = "HANDOFF_ACCEPTED"  [MỚI]
        │
        └─ target Sale REJECT → CrmHandoff.status = REJECTED (terminal cho attempt này)
                                 CampaignMembership.outcome = "HANDOFF_REJECTED"  [MỚI]
                                 active_key được giải phóng (existing) → Leader/Admin
                                 có thể initiate attempt mới theo đúng guard ở §3.2/§3.3/§3.6
```
Không có state mới ngoài 3 giá trị `outcome` liệt kê trên. `CrmHandoff.status` (`NEEDS_MANAGER/WAITING_ACCEPTANCE/ACCEPTED/REJECTED`) là String field (không phải DB enum) — giữ nguyên, không thêm giá trị mới.

### 3.6 Multiple-Campaign / conflict policy
Ownership là **customer-global**, không phải per-Campaign. Tại thời điểm initiation, transaction phải revalidate và **BLOCK** (không overwrite, không merge, không tạo Pipeline trùng) nếu:
- `Customer.trang_thai_ban_giao === 'Đã nhận'` (`isOwnershipLocked()`) — đã có owner, bất kể từ nguồn nào.
- Đã tồn tại `CrmHandoff` đang mở (`active_key` đã set) từ Campaign khác hoặc legacy source.

`active_key` (unique, §2.1) tiếp tục là authority duy nhất cho "1 Handoff mở / Customer".

### 3.7 Atomicity
`accept` phải nằm trong 1 transaction logic boundary duy nhất: revalidate active Handoff → `CrmHandoff.status = ACCEPTED` → `Customer` ownership fields → `ensurePipeline()` → `CampaignMembership.outcome/handoff_id`. Không cho phép partial state (Customer có owner nhưng thiếu Pipeline; Pipeline tồn tại nhưng Handoff chưa ACCEPTED; Handoff ACCEPTED nhưng membership không link). Reuse/extend `transitionHandoffTransactional()` — thêm nhánh additive (guard bằng `if (handoff.campaign_membership_id)`) thay vì fork engine song song, để đường legacy (Project-mode, `campaign_membership_id = null`) không đổi hành vi.

### 3.8 Idempotency / concurrency
Initiation PHẢI re-read/revalidate **trong transaction** (không chỉ client-side): `Campaign.owner`, `Project`, `ds_sale`, target Sale active/eligible, membership candidate state (`row_version`), existing Customer ownership, existing active Handoff. Dùng lại nguyên `Serializable` + retry-on-`P2002/P2034` pattern đã có ở `transactional-workflow.ts` và `membership-workflow.ts`.

### 3.9 Provenance
Handoff có nguồn gốc Campaign PHẢI populate `CrmHandoff.campaign_membership_id`. Chuỗi truy vết: `CrmHandoff → CampaignMembership → Campaign → Project`. Handoff legacy (Project-mode) tiếp tục để field này `null` — không đổi. Customer master identity không bị ảnh hưởng bởi field này (loose reference, không FK).

### 3.10 Pipeline
Chỉ `ensure` tại thời điểm `accept`, qua `ensurePipeline()` (Postgres transaction path). **Không dùng** đường `POST /api/pipeline` thủ công (không transactional, không dùng `CrmPipelineLink`, đã xác nhận có gap TOCTOU trong audit) cho creation path của M1B.2.

### 3.11 UI (minimal, không dashboard mới)
- Leader/Admin: reuse `CampaignCskhWorkQueue.tsx`, bucket "Quan tâm" hiện có → thêm action "Bàn giao" (chỉ hiện khi `outcome IS NULL`) → modal chọn Sale theo §3.3.
- Sale: ưu tiên reuse `POST /api/crm/telesale/handoff` (accept/reject) — endpoint này đã generic theo `customer_id` + active Handoff, không cần biết nguồn Campaign hay legacy.
- Admin: cùng flow, Sale picker không giới hạn roster.

### 3.12 Legacy compatibility
M1B.2 là **additive Campaign integration** — không rewrite `/phan-khach` (Theo Dự án), không rewrite `transactional-workflow.ts`'s legacy paths, không rewrite `/data-chat-luong`. Legacy Handoff (Project-mode) phải tiếp tục hoạt động không regression sau khi thêm nhánh Campaign-aware.

---

## 4. Schema/migration verification

**Kết luận: KHÔNG cần schema/migration mới.**

Xác nhận lại từ source tại baseline `5b992b8` (§2, bảng trên): mọi cột, mọi unique constraint cần thiết cho §3 đã tồn tại từ 2 migration trước đó (`20260825000002_add_qualified_lead_funnel`, `20260826000001_add_campaign_foundation`). M1B.2 chỉ **bắt đầu ghi giá trị** vào các cột vốn đã tồn tại nhưng chưa từng được ghi (`CampaignMembership.outcome`, `CampaignMembership.handoff_id`, `CrmHandoff.campaign_membership_id`) và **định nghĩa vocabulary** cho `outcome` (`HANDOFF_INITIATED | HANDOFF_ACCEPTED | HANDOFF_REJECTED`) — đây là quyết định ở tầng application, không đụng schema.

Nếu trong lúc implementation phát hiện ngược lại (VD: cần index mới cho hiệu năng truy vấn Leader queue, hoặc cần ràng buộc DB-level mà transaction không đảm bảo nổi) → PHẢI dừng và quay lại làm audit/authority bổ sung, không tự ý workaround.

---

## 5. Phạm vi CHƯA làm (explicitly out of scope của tài liệu này)

- Không có dòng code implementation nào được viết trong phiên chốt authority này.
- Không thay đổi `prisma/schema.prisma` hay tạo migration mới.
- Không mở capability nào ngoài đúng phạm vi §3.
- Chưa có test, chưa có API route, chưa có UI component nào cho M1B.2.
- Production validation cho M1B.2 chỉ được thực hiện sau khi implementation hoàn tất và qua đủ gate (test/typecheck/prisma validate/build) như các phase trước.

## 6. File dự kiến bị ảnh hưởng khi implementation (tham khảo, chưa thực hiện)

- `src/lib/crm-funnel/membership-workflow.ts` — hàm initiation mới
- `src/lib/crm-funnel/transactional-workflow.ts` — nhánh additive trong `transitionHandoffTransactional()`
- `src/lib/crm-funnel/handoff-policy.ts` — mở rộng nếu cần roster-eligibility helper riêng cho Campaign
- `src/app/api/campaigns/[id]/members/[membershipId]/handoff/route.ts` — route mới (mirror `interaction`/`qualification`)
- `src/components/crm/CampaignCskhWorkQueue.tsx` — action "Bàn giao" + modal
- `tests/crm/*.test.ts` — test suite mới, cùng kiến trúc pure-function + source-regex hiện có

---

*Tài liệu này ghi lại authority đã được xác nhận qua trao đổi trực tiếp giữa Technical Architect Agent và chủ dự án. Mọi thay đổi authority sau khi implementation bắt đầu phải amend tài liệu này, không tạo tài liệu song song.*
