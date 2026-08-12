/**
 * Smoke nhẹ: N request /api/orders/pulse song song (cần cookie phiên hoặc bỏ qua auth).
 * Đo latency p50/p95 — không thay load-test đầy đủ.
 *
 * Usage:
 *   API_BASE=https://api-production-65ce.up.railway.app CONCURRENCY=50 node packages/database/scripts/smoke-pulse.mjs
 */
const base = (process.env.API_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '');
const n = Math.min(Math.max(Number(process.env.CONCURRENCY || 40), 1), 200);
const cookie = process.env.SMOKE_COOKIE || '';

async function one() {
  const t0 = performance.now();
  const res = await fetch(`${base}/api/orders/pulse`, {
    headers: cookie ? { cookie } : {},
  });
  const ms = performance.now() - t0;
  return { status: res.status, ms };
}

const started = performance.now();
const results = await Promise.all(Array.from({ length: n }, () => one()));
const elapsed = performance.now() - started;
const times = results.map((r) => r.ms).sort((a, b) => a - b);
const byStatus = {};
for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
const p = (q) => times[Math.min(times.length - 1, Math.floor(q * (times.length - 1)))];

console.log(
  JSON.stringify(
    {
      base,
      concurrency: n,
      wallMs: Math.round(elapsed),
      status: byStatus,
      latencyMs: {
        min: Math.round(times[0]),
        p50: Math.round(p(0.5)),
        p95: Math.round(p(0.95)),
        max: Math.round(times[times.length - 1]),
      },
      note: cookie
        ? 'Có cookie — kỳ vọng 200'
        : 'Không cookie — kỳ vọng 401; vẫn đo được latency origin/DB path auth',
    },
    null,
    2,
  ),
);
