ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "image_urls" jsonb DEFAULT '[]'::jsonb;
