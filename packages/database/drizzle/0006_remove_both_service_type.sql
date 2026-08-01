UPDATE "sellers" SET "service_types" = 'food' WHERE "service_types" = 'both';--> statement-breakpoint
CREATE TYPE "public"."service_type_new" AS ENUM('food', 'laundry');--> statement-breakpoint
ALTER TABLE "sellers" ALTER COLUMN "service_types" TYPE "service_type_new" USING ("service_types"::text::"service_type_new");--> statement-breakpoint
DROP TYPE "public"."service_type";--> statement-breakpoint
ALTER TYPE "public"."service_type_new" RENAME TO "service_type";--> statement-breakpoint
DELETE FROM "user_roles" ur USING "profiles" p WHERE ur."user_id" = p."id" AND ur."role" <> p."role";
