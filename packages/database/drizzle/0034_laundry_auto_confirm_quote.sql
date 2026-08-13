ALTER TABLE "laundry_order_details" ADD COLUMN IF NOT EXISTS "auto_confirm_quote" boolean DEFAULT false NOT NULL;
