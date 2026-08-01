ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "service_areas" text[];-->statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "min_distance_km" numeric(6, 1);
