/**
 * Playwright globalSetup — đợi API rồi khôi phục seller/user demo + giỏ buyer.
 * Bỏ qua nếu SKIP_E2E_RESET=1.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.PLAYWRIGHT_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

async function waitForApi(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${API}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API không sẵn sàng tại ${API}/api/health sau ${timeoutMs}ms`);
}

async function main() {
  if (process.env.SKIP_E2E_RESET === '1') {
    console.log('[e2e globalSetup] SKIP_E2E_RESET=1 — bỏ qua reset');
    return;
  }

  try {
    await waitForApi();
  } catch (err) {
    console.warn(`[e2e globalSetup] ${(err as Error).message} — bỏ qua reset`);
    return;
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
  const script = join(root, 'scripts/reset-demo-state.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, API_URL: API },
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    console.warn('[e2e globalSetup] reset-demo-state thất bại — tiếp tục với dữ liệu hiện tại');
  }
}

export default main;
