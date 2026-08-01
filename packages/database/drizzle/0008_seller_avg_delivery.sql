ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "avg_delivery_minutes" integer;-->statement-breakpoint
ALTER TABLE "sellers" DROP COLUMN IF EXISTS "min_distance_km";
