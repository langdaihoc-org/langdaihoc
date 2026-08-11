CREATE TABLE IF NOT EXISTS "platform_settings" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);-->statement-breakpoint

INSERT INTO "platform_settings" ("key", "value")
VALUES ('billing_period_started_at', now()::text)
ON CONFLICT ("key") DO NOTHING;-->statement-breakpoint

ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;-->statement-breakpoint
REVOKE ALL ON TABLE "platform_settings" FROM anon, authenticated;
