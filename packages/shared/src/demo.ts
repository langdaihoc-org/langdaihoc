/**
 * Demo mode — FAIL-CLOSED: mặc định TẮT.
 * Chỉ bật khi khai báo tường minh `DEMO_MODE=true` (backend)
 * hoặc khi chạy Vite dev server (`import.meta.env.DEV`) cho tiện phát triển web.
 *
 * Lý do: tránh rủi ro production vô tình bật demo (auto-xác minh email,
 * nới guard...) chỉ vì quên set NODE_ENV.
 */
function isDemoMode(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  // Production / live luôn tắt — kể cả khi ai đó set DEMO_MODE=true nhầm.
  if (env?.NODE_ENV === 'production') return false;
  if (env?.RAILWAY_ENVIRONMENT === 'production') return false;
  const meta = typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: { DEV?: boolean; PROD?: boolean } }).env
    : undefined;
  if (meta?.PROD) return false;

  if (env?.DEMO_MODE === 'true') return true;
  if (env?.DEMO_MODE === 'false') return false;

  // Vite dev server (chỉ đúng lúc `vite dev`, build production = false).
  if (meta?.DEV) return true;

  // Không suy ra demo từ việc thiếu NODE_ENV — mặc định TẮT cho an toàn.
  return false;
}

export const DEMO_MODE = isDemoMode();
