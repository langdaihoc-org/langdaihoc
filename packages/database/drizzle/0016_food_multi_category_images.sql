ALTER TABLE "food_items" ADD COLUMN IF NOT EXISTS "category_ids" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "food_items" ADD COLUMN IF NOT EXISTS "image_urls" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
--> statement-breakpoint
UPDATE "food_items"
SET "category_ids" = jsonb_build_array("category_id"::text)
WHERE "category_id" IS NOT NULL
  AND ( "category_ids" IS NULL OR "category_ids" = '[]'::jsonb );
--> statement-breakpoint
UPDATE "food_items"
SET "image_urls" = jsonb_build_array("image_url")
WHERE "image_url" IS NOT NULL
  AND "image_url" <> ''
  AND ( "image_urls" IS NULL OR "image_urls" = '[]'::jsonb );
