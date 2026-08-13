import { describe, expect, it } from 'vitest';
import {
  formatHHMMInTimeZone,
  isTimeInOperatingWindows,
  isWindowInsideOperatingHours,
  normalizeOperatingWindows,
} from './operating-hours.js';

const windows = [
  { from: '09:00', to: '12:00' },
  { from: '17:00', to: '22:00' },
];

describe('operating hours', () => {
  it('normalizes invalid windows out', () => {
    expect(
      normalizeOperatingWindows([
        { from: '09:00', to: '12:00' },
        { from: 'bad', to: '12:00' },
        { from: '18:00', to: '17:00' },
      ]),
    ).toEqual([{ from: '09:00', to: '12:00' }]);
  });

  it('checks time membership', () => {
    expect(isTimeInOperatingWindows('03:00', windows)).toBe(false);
    expect(isTimeInOperatingWindows('10:30', windows)).toBe(true);
    expect(isTimeInOperatingWindows('17:00', windows)).toBe(true);
    expect(isTimeInOperatingWindows('22:00', windows)).toBe(true);
    expect(isTimeInOperatingWindows('22:01', windows)).toBe(false);
    expect(isTimeInOperatingWindows('10:00', null)).toBe(true);
  });

  it('checks full delivery window inside one shop window', () => {
    expect(isWindowInsideOperatingHours('17:00', '17:40', windows, 30)).toBe(true);
    expect(isWindowInsideOperatingHours('11:40', '12:20', windows, 30)).toBe(false);
    expect(isWindowInsideOperatingHours('16:50', '17:30', windows, 30)).toBe(false);
  });

  it('formats VN local HH:mm from UTC', () => {
    // 2026-08-14 03:00 VN = 2026-08-13 20:00 UTC
    const d = new Date('2026-08-13T20:00:00.000Z');
    expect(formatHHMMInTimeZone(d)).toBe('03:00');
  });
});
