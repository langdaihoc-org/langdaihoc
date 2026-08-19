# AGENTS.md

## Cursor Cloud specific instructions

This is a pnpm 9 monorepo (`langdaihoc`) — a mobile-first student marketplace (food / laundry / ship-proxy). Standard dev/lint/test/build commands live in the root `package.json` and `README.md`; prefer those. The notes below are the non-obvious cloud caveats.

### Services

- `@langdaihoc/web` — Vite/React SPA on `http://localhost:5173` (proxies `/api` → `:3001`).
- `@langdaihoc/api` — Express REST API on `http://localhost:3001` (health: `/api/health`).
- Supabase local stack (Docker) — Postgres `:55322`, Auth/API `:55321`, Studio `:55323`, Mailpit inbox `:55324`.

### Startup sequence (Docker + Supabase are NOT started by the update script)

The update script only runs `pnpm install`. Docker and the Supabase CLI are pre-installed in the environment, but the Docker daemon and Supabase stack must be started each session before running the full app:

1. Start the Docker daemon (it does not auto-start): run `sudo dockerd` in a background terminal (e.g. a tmux session), then make the socket usable without sudo: `sudo chmod 666 /var/run/docker.sock`.
2. First-time-per-session setup: `pnpm setup:local` — starts Supabase, creates `apps/api/.env` + `apps/web/.env` from examples, injects Supabase keys into the API env, and runs migrations. (Equivalent manual steps: `supabase start` → copy env → `pnpm db:migrate`.)
3. Run the app: `pnpm dev` (web + API in parallel).

### Gotchas

- `pnpm setup:local` injects Supabase keys into `apps/api/.env` only. It leaves `apps/web/.env` with the placeholder `VITE_SUPABASE_ANON_KEY=your-anon-key`. Email/password login still works (it goes through the API proxy), but realtime and Google OAuth need the real anon key set in `apps/web/.env` (copy `ANON_KEY` from `supabase status -o env`).
- Auth email confirmation is ON (`supabase/config.toml` → `enable_confirmations = true`). New signups cannot log in until verified. Locally the verification email lands in Mailpit at `http://localhost:55324` — open it there and click the confirm link. Login enforces `emailVerified`, so a successful login proves verification worked.
- Verification/recovery tokens are single-use. The web verify page can double-invoke the call (React StrictMode) and show an "invalid/expired link" error on the second call even though the first already verified the account — confirm by logging in rather than trusting that error.
- Supabase local is Dockerized: if the Docker daemon is not running, `supabase start` / `pnpm setup:local` will fail.

### Lint / test / build

Use root scripts (see `package.json`): `pnpm lint`, `pnpm test:unit` (Vitest), `pnpm build`, `pnpm typecheck`, or `pnpm verify` (all four). These do not require Docker/Supabase.
