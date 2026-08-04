import { Download, Share, PlusSquare, X } from 'lucide-react';
import { usePwaInstall } from '@/lib/pwa';
import { Button } from '@/components/ui/button';

/** Banner gợi ý cài PWA — iOS hướng dẫn Share; Android dùng beforeinstallprompt. */
export function InstallAppBanner() {
  const { mode, dismiss, promptInstall, canPrompt } = usePwaInstall();

  if (mode === 'hidden') return null;

  if (mode === 'android') {
    return (
      <aside
        className="mb-4 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-gradient-to-br from-[#0b3a6b] to-[#0e7490] text-white shadow-[var(--shadow-card)]"
        role="region"
        aria-label="Cài đặt ứng dụng"
      >
        <div className="flex items-start gap-3 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Download className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">Cài đặt langdaihoc</p>
            <p className="mt-0.5 text-sm text-white/80">
              Thêm vào màn hình chính để truy cập nhanh và mượt mà hơn
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                className="bg-white text-brand-orange-dark hover:bg-white/90"
                disabled={!canPrompt}
                onClick={() => void promptInstall()}
              >
                Cài app
              </Button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
              >
                Để sau
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Đóng"
          >
            <X className="size-4" />
          </button>
        </div>
      </aside>
    );
  }

  const safari = mode === 'ios-safari';

  return (
    <aside
      className="mb-4 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-card)]"
      role="region"
      aria-label="Cài đặt ứng dụng trên iPhone"
    >
      <div className="flex items-start gap-2 border-b border-[var(--color-line)] bg-[#0b3a6b] px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Cài langdaihoc trên iPhone</p>
          <p className="mt-0.5 text-sm text-white/80">
            {safari
              ? 'Thêm vào Màn hình chính để mở như app.'
              : 'Trên iPhone hãy mở trang này bằng Safari để cài được.'}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Đóng"
        >
          <X className="size-4" />
        </button>
      </div>

      {safari ? (
        <ol className="space-y-0 divide-y divide-[var(--color-line)] px-2 py-1">
          <li className="flex items-center gap-3 px-2 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-brand-orange-dark">
              1
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <span>Chạm nút</span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 font-semibold text-brand-orange-dark">
                <Share className="size-4" aria-hidden />
                Chia sẻ
              </span>
              <span className="text-[var(--color-muted)]">(ở thanh Safari)</span>
            </div>
          </li>
          <li className="flex items-center gap-3 px-2 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-brand-orange-dark">
              2
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <span>Chọn</span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 font-semibold text-brand-orange-dark">
                <PlusSquare className="size-4" aria-hidden />
                Thêm vào Màn hình chính
              </span>
            </div>
          </li>
          <li className="flex items-center gap-3 px-2 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-brand-orange-dark">
              3
            </span>
            <p className="text-sm">
              Chạm <span className="font-semibold text-brand-orange-dark">Thêm</span> — xong, mở icon
              langdaihoc như app.
            </p>
          </li>
        </ol>
      ) : (
        <div className="space-y-3 p-4 text-sm">
          <p className="text-[var(--color-muted)]">
            Trình duyệt hiện tại trên iPhone không hỗ trợ cài PWA. Làm như sau:
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-[var(--color-ink)]">
            <li>
              Chạm nút <span className="font-semibold">···</span> hoặc Share →{' '}
              <span className="font-semibold">Mở bằng Safari</span>
            </li>
            <li>
              Trong Safari: Share → <span className="font-semibold">Thêm vào Màn hình chính</span>
            </li>
          </ol>
        </div>
      )}

      <div className="border-t border-[var(--color-line)] px-4 py-2.5 text-right">
        <button
          type="button"
          onClick={dismiss}
          className="text-sm font-medium text-[var(--color-muted)] hover:text-brand-orange-dark"
        >
          Để sau · hiện lại sau 1 ngày
        </button>
      </div>
    </aside>
  );
}
