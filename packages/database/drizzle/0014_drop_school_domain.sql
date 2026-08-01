-- Remove abandoned school-email whitelist feature
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_school_domain_id_student_email_domains_id_fk";
DROP INDEX IF EXISTS "profiles_school_domain_idx";
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "school_domain_id";

DROP TABLE IF EXISTS "school_verification_requests";
DROP TABLE IF EXISTS "student_email_domains";

DROP TYPE IF EXISTS "public"."school_request_status";
DROP TYPE IF EXISTS "public"."domain_status";
