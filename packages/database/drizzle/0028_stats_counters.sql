-- Counters + rollup stats: pulse đọc O(1), doanh thu/rating không phụ thuộc bảng orders/reviews
-- (đơn settled bị retention xóa sau 7 ngày).

CREATE TABLE IF NOT EXISTS "seller_daily_stats" (
  "seller_id" uuid NOT NULL,
  "day" date NOT NULL,
  "completed_orders" integer DEFAULT 0 NOT NULL,
  "revenue" numeric(14, 0) DEFAULT '0' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seller_daily_stats_pk" PRIMARY KEY ("seller_id", "day")
);-->statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "seller_daily_stats" ADD CONSTRAINT "seller_daily_stats_seller_id_sellers_id_fk"
    FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;-->statement-breakpoint

CREATE INDEX IF NOT EXISTS "seller_daily_stats_day_idx" ON "seller_daily_stats" USING btree ("day");-->statement-breakpoint

CREATE TABLE IF NOT EXISTS "seller_counters" (
  "seller_id" uuid PRIMARY KEY NOT NULL,
  "pending_count" integer DEFAULT 0 NOT NULL,
  "open_count" integer DEFAULT 0 NOT NULL,
  "delivering_count" integer DEFAULT 0 NOT NULL,
  "late_warning_count" integer DEFAULT 0 NOT NULL,
  "open_complaint_count" integer DEFAULT 0 NOT NULL,
  "lifetime_orders" integer DEFAULT 0 NOT NULL,
  "lifetime_revenue" numeric(16, 0) DEFAULT '0' NOT NULL,
  "latest_order_at" timestamp with time zone,
  "latest_change_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);-->statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "seller_counters" ADD CONSTRAINT "seller_counters_seller_id_sellers_id_fk"
    FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;-->statement-breakpoint

CREATE TABLE IF NOT EXISTS "buyer_counters" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "pending_count" integer DEFAULT 0 NOT NULL,
  "open_count" integer DEFAULT 0 NOT NULL,
  "lifetime_completed" integer DEFAULT 0 NOT NULL,
  "latest_order_at" timestamp with time zone,
  "latest_change_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);-->statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "buyer_counters" ADD CONSTRAINT "buyer_counters_user_id_profiles_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;-->statement-breakpoint

-- Cờ chống cộng trùng: đơn đã được ghi nhận vào seller_daily_stats
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stats_recorded_at" timestamp with time zone;-->statement-breakpoint

-- Rating tổng hợp: catalog không cần AVG trên reviews nữa
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "rating_sum" integer DEFAULT 0 NOT NULL;-->statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "rating_count" integer DEFAULT 0 NOT NULL;-->statement-breakpoint

-- Đánh giá & khiếu nại sống lâu hơn đơn: cắt liên kết thay vì xóa theo đơn
ALTER TABLE "reviews" ALTER COLUMN "order_id" DROP NOT NULL;-->statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_order_id_orders_id_fk";-->statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;-->statement-breakpoint

ALTER TABLE "complaints" ALTER COLUMN "order_id" DROP NOT NULL;-->statement-breakpoint
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_order_id_orders_id_fk";-->statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "complaints" ADD CONSTRAINT "complaints_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;-->statement-breakpoint

-- Đơn đã đóng bị xóa sau 7 ngày; giữ mã đơn để hiển thị khiếu nại/đánh giá cũ
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "order_code" varchar(30);-->statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "order_code" varchar(30);-->statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;-->statement-breakpoint

-- Partial index cho đường đọc còn lại (recompute counter, fallback khi chưa có counter)
CREATE INDEX IF NOT EXISTS "orders_seller_open_idx" ON "orders" USING btree ("seller_id")
  WHERE "status" NOT IN ('completed', 'cancelled', 'rejected', 'needs_support');-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_buyer_open_idx" ON "orders" USING btree ("buyer_id")
  WHERE "status" NOT IN ('completed', 'cancelled', 'rejected', 'needs_support');-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx" ON "notifications" USING btree ("user_id")
  WHERE "read_at" IS NULL;-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "complaints_seller_open_idx" ON "complaints" USING btree ("seller_id")
  WHERE "status" NOT IN ('resolved', 'rejected');-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "carts_updated_idx" ON "carts" USING btree ("updated_at");-->statement-breakpoint

-- Backfill: dữ liệu hiện có phải nằm sẵn trong bảng mới trước khi read path chuyển sang đọc chúng
INSERT INTO "seller_daily_stats" ("seller_id", "day", "completed_orders", "revenue", "updated_at")
SELECT
  "seller_id",
  (coalesce("completed_at", "updated_at") AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  count(*)::int,
  coalesce(sum("total"), 0),
  now()
FROM "orders"
WHERE "status" = 'completed'
GROUP BY 1, 2
ON CONFLICT ("seller_id", "day") DO NOTHING;-->statement-breakpoint

UPDATE "orders" SET "stats_recorded_at" = now()
WHERE "status" = 'completed' AND "stats_recorded_at" IS NULL;-->statement-breakpoint

INSERT INTO "seller_counters" (
  "seller_id", "pending_count", "open_count", "delivering_count", "late_warning_count",
  "open_complaint_count", "lifetime_orders", "lifetime_revenue", "latest_order_at",
  "latest_change_at", "version", "updated_at"
)
SELECT
  s."id",
  coalesce(o."pending_count", 0),
  coalesce(o."open_count", 0),
  coalesce(o."delivering_count", 0),
  coalesce(o."late_warning_count", 0),
  coalesce(c."open_complaint_count", 0),
  coalesce(d."completed_orders", 0),
  coalesce(d."revenue", 0),
  o."latest_order_at",
  now(), 0, now()
FROM "sellers" s
LEFT JOIN (
  SELECT
    "seller_id",
    count(*) FILTER (WHERE "status" = 'pending')::int AS "pending_count",
    count(*)::int AS "open_count",
    count(*) FILTER (WHERE "status" IN ('delivering', 'returning'))::int AS "delivering_count",
    count(*) FILTER (WHERE "late_delivery_warned_at" IS NOT NULL)::int AS "late_warning_count",
    max("created_at") AS "latest_order_at"
  FROM "orders"
  WHERE "status" NOT IN ('completed', 'cancelled', 'rejected', 'needs_support')
  GROUP BY "seller_id"
) o ON o."seller_id" = s."id"
LEFT JOIN (
  SELECT "seller_id", count(*)::int AS "open_complaint_count"
  FROM "complaints"
  WHERE "status" NOT IN ('resolved', 'rejected')
  GROUP BY "seller_id"
) c ON c."seller_id" = s."id"
LEFT JOIN (
  SELECT "seller_id", sum("completed_orders")::int AS "completed_orders", sum("revenue") AS "revenue"
  FROM "seller_daily_stats"
  GROUP BY "seller_id"
) d ON d."seller_id" = s."id"
ON CONFLICT ("seller_id") DO NOTHING;-->statement-breakpoint

INSERT INTO "buyer_counters" (
  "user_id", "pending_count", "open_count", "lifetime_completed",
  "latest_order_at", "latest_change_at", "version", "updated_at"
)
SELECT
  "buyer_id",
  count(*) FILTER (WHERE "status" = 'waiting_price_confirmation')::int,
  count(*) FILTER (WHERE "status" NOT IN ('completed', 'cancelled', 'rejected', 'needs_support'))::int,
  count(*) FILTER (WHERE "status" = 'completed')::int,
  max("created_at") FILTER (WHERE "status" NOT IN ('completed', 'cancelled', 'rejected', 'needs_support')),
  now(), 0, now()
FROM "orders"
GROUP BY "buyer_id"
ON CONFLICT ("user_id") DO NOTHING;-->statement-breakpoint

UPDATE "sellers" s
SET "rating_sum" = r."sum", "rating_count" = r."cnt"
FROM (
  SELECT "seller_id", sum("rating")::int AS "sum", count(*)::int AS "cnt"
  FROM "reviews" GROUP BY "seller_id"
) r
WHERE r."seller_id" = s."id";-->statement-breakpoint

UPDATE "reviews" r SET "order_code" = o."order_code"
FROM "orders" o WHERE o."id" = r."order_id" AND r."order_code" IS NULL;-->statement-breakpoint

UPDATE "complaints" c SET "order_code" = o."order_code"
FROM "orders" o WHERE o."id" = c."order_id" AND c."order_code" IS NULL;-->statement-breakpoint

UPDATE "complaints" SET "closed_at" = "updated_at"
WHERE "status" IN ('resolved', 'rejected') AND "closed_at" IS NULL;-->statement-breakpoint

ALTER TABLE "seller_daily_stats" ENABLE ROW LEVEL SECURITY;-->statement-breakpoint
ALTER TABLE "seller_counters" ENABLE ROW LEVEL SECURITY;-->statement-breakpoint
ALTER TABLE "buyer_counters" ENABLE ROW LEVEL SECURITY;-->statement-breakpoint
REVOKE ALL ON TABLE "seller_daily_stats" FROM anon, authenticated;-->statement-breakpoint
REVOKE ALL ON TABLE "seller_counters" FROM anon, authenticated;-->statement-breakpoint
REVOKE ALL ON TABLE "buyer_counters" FROM anon, authenticated;
