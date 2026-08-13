/** Re-export — logic chuẩn nằm ở @langdaihoc/shared. */
export {
  type OperatingWindow,
  toMinutes,
  formatOperatingWindows,
  isValidTimeHHMM,
  coerceHHMM,
  normalizeOperatingWindows,
  isTimeInOperatingWindows,
  isWindowInsideOperatingHours,
  filterTimesInOperatingWindows,
  formatHHMMInTimeZone,
  SHOP_TZ,
} from '@langdaihoc/shared';
