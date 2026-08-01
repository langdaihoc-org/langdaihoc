ALTER TABLE "ship_proxy_order_details" ADD COLUMN IF NOT EXISTS "package_value" numeric(12, 0) DEFAULT '0' NOT NULL;
