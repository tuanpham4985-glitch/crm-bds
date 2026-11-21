-- Lưu lịch sử Sale từng nhận khách để hỗ trợ chia lại trong cùng Campaign
-- nhưng loại trừ các Sale đã từng nhận khách ở các vòng trước.
CREATE TABLE IF NOT EXISTS "campaign_membership_assignment_history" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "telesale_id" TEXT NOT NULL,
  "telesale_name" TEXT,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assigned_by_id" TEXT,
  "assigned_by_name" TEXT,
  "reason" TEXT,
  CONSTRAINT "campaign_membership_assignment_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_membership_assignment_history_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "campaign_membership_assignment_history_campaign_customer_idx"
  ON "campaign_membership_assignment_history"("campaign_id", "customer_id");
CREATE INDEX IF NOT EXISTS "campaign_membership_assignment_history_customer_idx"
  ON "campaign_membership_assignment_history"("customer_id");
CREATE INDEX IF NOT EXISTS "campaign_membership_assignment_history_telesale_idx"
  ON "campaign_membership_assignment_history"("telesale_id");

-- Backfill hiện trạng trước khi tính năng lịch sử được bật. Như vậy lần chia
-- lại đầu tiên vẫn loại đúng Sale đang nhận khách hiện tại.
INSERT INTO "campaign_membership_assignment_history"
  ("id", "campaign_id", "customer_id", "telesale_id", "telesale_name", "assigned_at", "assigned_by_id", "assigned_by_name", "reason")
SELECT
  md5(random()::text || clock_timestamp()::text || cm.id),
  cm.campaign_id,
  cm.customer_id,
  cm.telesale_id,
  cm.telesale_name,
  COALESCE(cm.assigned_at, cm.created_at),
  cm.assigned_by_id,
  cm.assigned_by_name,
  'backfill_current_assignment'
FROM "campaign_memberships" cm
WHERE cm.assignment_status <> 'UNASSIGNED'
  AND cm.telesale_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "campaign_membership_assignment_history" h
    WHERE h.campaign_id = cm.campaign_id
      AND h.customer_id = cm.customer_id
      AND h.telesale_id = cm.telesale_id
  );
