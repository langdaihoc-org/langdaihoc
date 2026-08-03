import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode };
type State = { hasError: boolean };

const CHUNK_ERROR_RE = /fetch dynamically imported module|importing a module script failed|loading chunk/i;
const RELOAD_COUNT_KEY = 'langdaihoc:chunk-reload-count';
const RELOAD_AT_KEY = 'langdaihoc:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 15_000;
const MAX_AUTO_RELOADS = 1;

function isChunkLoadError(error: Error): boolean {
  return CHUNK_ERROR_RE.test(error.message ?? '');
}

/** Chỉ tự reload 1 lần; sau đó hiện màn lỗi để tránh loop. */
function tryReloadOnceForChunkError(): boolean {
  try {
    const count = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) || '0');
    const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) || '0');
    if (count >= MAX_AUTO_RELOADS) return false;
    if (last && Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(count + 1));
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/** Bắt lỗi render — tránh trắng toàn trang / reload vô hạn. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    if (isChunkLoadError(error) && tryReloadOnceForChunkError()) {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-lg font-semibold">Đã xảy ra lỗi</p>
          <p className="max-w-sm text-sm text-[var(--color-muted)]">
            Trang gặp sự cố. Thử tải lại hoặc quay về trang chủ.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                try {
                  sessionStorage.removeItem(RELOAD_COUNT_KEY);
                } catch {
                  /* ignore */
                }
                window.location.assign('/');
              }}
            >
              Về trang chủ
            </Button>
            <Button
              onClick={() => {
                try {
                  sessionStorage.removeItem(RELOAD_COUNT_KEY);
                } catch {
                  /* ignore */
                }
                window.location.reload();
              }}
            >
              Tải lại
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
