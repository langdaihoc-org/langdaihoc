import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Bắt lỗi render — tránh trắng toàn trang. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
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
            <Button variant="outline" onClick={() => window.location.assign('/')}>
              Về trang chủ
            </Button>
            <Button onClick={() => window.location.reload()}>Tải lại</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
