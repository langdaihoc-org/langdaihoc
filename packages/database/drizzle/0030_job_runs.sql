-- Mốc chạy của job nền — để retention không chạy lại mỗi lần deploy Railway.

CREATE TABLE IF NOT EXISTS "job_runs" (
  "job" text PRIMARY KEY NOT NULL,
  "last_run_at" timestamp with time zone DEFAULT now() NOT NULL
);
