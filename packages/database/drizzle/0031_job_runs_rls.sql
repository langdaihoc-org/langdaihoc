-- Align job_runs with other app tables: RLS on, no policies → PostgREST deny.
-- API DATABASE_URL (postgres/service) bypasses RLS.

ALTER TABLE "job_runs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "job_runs" FROM anon, authenticated;
