/** Khung giờ hoạt động trong ngày — HH:mm */
export type OperatingWindow = { from: string; to: string };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function formatOperatingWindows(windows: OperatingWindow[] | null | undefined): string {
  if (!windows?.length) return '';
  return windows.map((w) => `${w.from}–${w.to}`).join(' · ');
}

export function isValidTimeHHMM(t: string): boolean {
  return TIME_RE.test(t);
}

/** Chuẩn hóa chuỗi người nhập thành HH:mm 24h; không hợp lệ → trả về nguyên bản đã trim. */
export function coerceHHMM(raw: string): string {
  const t = raw.trim().replace('.', ':');
  if (TIME_RE.test(t)) return t;
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 3 && digits.length <= 4) {
    const hh = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
    const mm = digits.length === 3 ? digits.slice(1) : digits.slice(2);
    const candidate = `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
    if (TIME_RE.test(candidate)) return candidate;
  }
  if (/^\d{1,2}:\d{1,2}$/.test(t)) {
    const [h, m] = t.split(':');
    const candidate = `${h!.padStart(2, '0')}:${m!.padStart(2, '0')}`;
    if (TIME_RE.test(candidate)) return candidate;
  }
  return t;
}

export function normalizeOperatingWindows(
  windows: OperatingWindow[] | null | undefined,
): OperatingWindow[] {
  if (!windows?.length) return [];
  return windows
    .filter((w) => isValidTimeHHMM(w.from) && isValidTimeHHMM(w.to) && toMinutes(w.to) > toMinutes(w.from))
    .map((w) => ({ from: w.from, to: w.to }));
}

/** Thời điểm HH:mm nằm trong ít nhất một khung. */
export function isTimeInOperatingWindows(
  time: string,
  windows: OperatingWindow[] | null | undefined,
): boolean {
  const normalized = normalizeOperatingWindows(windows);
  if (!normalized.length) return true; // chưa set → không chặn
  if (!isValidTimeHHMM(time)) return false;
  const m = toMinutes(time);
  return normalized.some((w) => m >= toMinutes(w.from) && m <= toMinutes(w.to));
}

/**
 * Cả cửa sổ [from,to] nằm trọn trong một khung hoạt động
 * (và to ≥ from + minGap).
 */
export function isWindowInsideOperatingHours(
  from: string,
  to: string,
  windows: OperatingWindow[] | null | undefined,
  minGapMinutes = 0,
): boolean {
  if (!isValidTimeHHMM(from) || !isValidTimeHHMM(to)) return false;
  if (toMinutes(to) - toMinutes(from) < minGapMinutes) return false;
  const normalized = normalizeOperatingWindows(windows);
  if (!normalized.length) return true;
  const f = toMinutes(from);
  const t = toMinutes(to);
  return normalized.some((w) => f >= toMinutes(w.from) && t <= toMinutes(w.to));
}

export function filterTimesInOperatingWindows(
  times: string[],
  windows: OperatingWindow[] | null | undefined,
): string[] {
  const normalized = normalizeOperatingWindows(windows);
  if (!normalized.length) return times;
  return times.filter((t) => isTimeInOperatingWindows(t, normalized));
}
