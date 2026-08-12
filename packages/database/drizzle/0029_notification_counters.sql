-- Unread notification counters trên bảng counter hiện có — pulse không còn COUNT notifications.

ALTER TABLE "buyer_counters"
  ADD COLUMN IF NOT EXISTS "unread_count" integer DEFAULT 0 NOT NULL;-->statement-breakpoint
ALTER TABLE "buyer_counters"
  ADD COLUMN IF NOT EXISTS "latest_notification_at" timestamp with time zone;-->statement-breakpoint

ALTER TABLE "seller_counters"
  ADD COLUMN IF NOT EXISTS "unread_count" integer DEFAULT 0 NOT NULL;-->statement-breakpoint
ALTER TABLE "seller_counters"
  ADD COLUMN IF NOT EXISTS "latest_notification_at" timestamp with time zone;-->statement-breakpoint

-- Backfill từ notifications còn sống
UPDATE "buyer_counters" bc
SET
  "unread_count" = coalesce(n.unread, 0),
  "latest_notification_at" = n.latest_at
FROM (
  SELECT
    "user_id",
    count(*) FILTER (WHERE "read_at" IS NULL)::int AS unread,
    max("created_at") AS latest_at
  FROM "notifications"
  GROUP BY "user_id"
) n
WHERE n."user_id" = bc."user_id";-->statement-breakpoint

INSERT INTO "buyer_counters" (
  "user_id", "pending_count", "open_count", "lifetime_completed",
  "unread_count", "latest_notification_at", "latest_change_at", "version", "updated_at"
)
SELECT
  n."user_id", 0, 0, 0,
  count(*) FILTER (WHERE n."read_at" IS NULL)::int,
  max(n."created_at"),
  now(), 0, now()
FROM "notifications" n
LEFT JOIN "buyer_counters" bc ON bc."user_id" = n."user_id"
WHERE bc."user_id" IS NULL
GROUP BY n."user_id"
ON CONFLICT ("user_id") DO NOTHING;-->statement-breakpoint

UPDATE "seller_counters" sc
SET
  "unread_count" = coalesce(n.unread, 0),
  "latest_notification_at" = n.latest_at
FROM (
  SELECT
    s."id" AS seller_id,
    count(*) FILTER (WHERE notif."read_at" IS NULL)::int AS unread,
    max(notif."created_at") AS latest_at
  FROM "sellers" s
  INNER JOIN "notifications" notif ON notif."user_id" = s."user_id"
  GROUP BY s."id"
) n
WHERE n.seller_id = sc."seller_id";
