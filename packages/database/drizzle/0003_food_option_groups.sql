CREATE TABLE IF NOT EXISTS "food_option_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_item_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_option_groups" ADD CONSTRAINT "food_option_groups_food_item_id_food_items_id_fk" FOREIGN KEY ("food_item_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "food_item_options" ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
ALTER TABLE "food_item_options" ADD CONSTRAINT "food_item_options_group_id_food_option_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."food_option_groups"("id") ON DELETE cascade ON UPDATE no action;
