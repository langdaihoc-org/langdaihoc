ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "ship_proxy_fee" numeric(12, 0) DEFAULT '15000' NOT NULL;
