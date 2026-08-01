ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "open_hours" text;
