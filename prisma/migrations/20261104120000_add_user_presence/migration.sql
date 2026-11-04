-- Online presence heartbeat. Tách khỏi nhan_vien vì NhanVien có thể dùng
-- Google Sheets làm nguồn sự thật.
CREATE TABLE IF NOT EXISTS "user_presence" (
  "employee_id" TEXT NOT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_presence_pkey" PRIMARY KEY ("employee_id")
);

CREATE INDEX IF NOT EXISTS "user_presence_last_seen_at_idx" ON "user_presence"("last_seen_at");
