/** Milliseconds until next 00:00 Asia/Ho_Chi_Minh. */
export function msUntilMidnightVietnam(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get('hour') % 24; // en-US can emit 24 for midnight
  const msNow = ((hour * 60 + get('minute')) * 60 + get('second')) * 1000;
  const msDay = 24 * 60 * 60 * 1000;
  const until = msDay - msNow;
  return until <= 0 ? msDay : until;
}

/** Chạy `run` lúc 0h00 (giờ VN) mỗi ngày. Trả về hàm huỷ lịch. */
export function scheduleDailyAtMidnight(label: string, run: () => Promise<void>) {
  let dailyTimer: ReturnType<typeof setInterval> | null = null;

  const safeRun = async () => {
    try {
      await run();
    } catch (err) {
      console.error(`[${label}] daily job failed`, err);
    }
  };

  const delay = msUntilMidnightVietnam();
  console.log(`[${label}] lần chạy kế tiếp sau ${Math.round(delay / 60000)} phút (0h00 VN)`);

  const firstTimer = setTimeout(() => {
    void safeRun();
    dailyTimer = setInterval(() => void safeRun(), 24 * 60 * 60 * 1000);
  }, delay);

  return () => {
    clearTimeout(firstTimer);
    if (dailyTimer) clearInterval(dailyTimer);
  };
}
