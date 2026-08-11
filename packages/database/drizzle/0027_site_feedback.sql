CREATE TABLE IF NOT EXISTS "site_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" varchar(20) NOT NULL,
  "message" text NOT NULL,
  "contact" varchar(200),
  "page_url" text,
  "user_id" uuid,
  "status" varchar(20) DEFAULT 'new' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);-->statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "site_feedback" ADD CONSTRAINT "site_feedback_user_id_profiles_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;-->statement-breakpoint

CREATE INDEX IF NOT EXISTS "site_feedback_status_idx" ON "site_feedback" USING btree ("status");-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_feedback_created_idx" ON "site_feedback" USING btree ("created_at");-->statement-breakpoint

ALTER TABLE "site_feedback" ENABLE ROW LEVEL SECURITY;-->statement-breakpoint
REVOKE ALL ON TABLE "site_feedback" FROM anon, authenticated;
