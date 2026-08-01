ALTER TYPE "service_type" ADD VALUE IF NOT EXISTS 'ship_proxy';-->statement-breakpoint
ALTER TYPE "order_type" ADD VALUE IF NOT EXISTS 'ship_proxy';-->statement-breakpoint
CREATE TABLE IF NOT EXISTS "ship_proxy_order_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"tracking_code" varchar(120) NOT NULL,
	"pickup_location" text NOT NULL,
	"pickup_at" timestamp with time zone NOT NULL,
	"receive_phone" varchar(20) NOT NULL,
	"return_at" timestamp with time zone NOT NULL,
	"return_address_text" text NOT NULL,
	"contact_phone" varchar(20) NOT NULL,
	CONSTRAINT "ship_proxy_order_details_order_id_unique" UNIQUE("order_id")
);-->statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ship_proxy_order_details" ADD CONSTRAINT "ship_proxy_order_details_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
