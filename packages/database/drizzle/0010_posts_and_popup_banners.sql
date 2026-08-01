ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "subtitle" text;-->statement-breakpoint
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "cta_label" varchar(80);-->statement-breakpoint
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "is_popup" boolean DEFAULT false NOT NULL;-->statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."post_status" AS ENUM('published', 'hidden', 'pending', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;-->statement-breakpoint
CREATE TABLE IF NOT EXISTS "posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "seller_id" uuid,
  "title" varchar(200) NOT NULL,
  "body" text,
  "image_url" text,
  "cta_label" varchar(80),
  "link_url" text,
  "food_item_id" uuid,
  "status" "post_status" DEFAULT 'published' NOT NULL,
  "is_pinned" boolean DEFAULT false NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);-->statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "posts" ADD CONSTRAINT "posts_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;-->statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "posts" ADD CONSTRAINT "posts_food_item_id_food_items_id_fk" FOREIGN KEY ("food_item_id") REFERENCES "public"."food_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_status_published_idx" ON "posts" USING btree ("status","published_at");-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_seller_idx" ON "posts" USING btree ("seller_id");
