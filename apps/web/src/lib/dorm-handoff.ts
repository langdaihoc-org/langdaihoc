/** Điểm giao KTX — shipper không lên phòng. */
export const DORM_HANDOFF_POINTS = [
  { value: 'toa', label: 'Giao tại tòa' },
  { value: 'rao', label: 'Giao tại rào' },
] as const;

export type DormHandoffPoint = (typeof DORM_HANDOFF_POINTS)[number]['value'];

const LEGACY_ROOM_HINT = /phòng|tang|tầng|p\s*\d/i;

export function isDormHandoffPoint(value: string | null | undefined): value is DormHandoffPoint {
  return value === 'toa' || value === 'rao';
}

export function dormHandoffLabel(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const found = DORM_HANDOFF_POINTS.find((p) => p.value === value || p.label === value);
  if (found) return found.label;
  // Địa chỉ cũ còn số phòng → không khuyến khích giao lên phòng
  if (LEGACY_ROOM_HINT.test(value)) return 'Giao tại tòa (cũ: có phòng)';
  return value;
}

export function normalizeDormHandoff(value: string | null | undefined): DormHandoffPoint | '' {
  if (!value?.trim()) return '';
  if (value === 'toa' || value === 'Giao tại tòa') return 'toa';
  if (value === 'rao' || value === 'Giao tại rào') return 'rao';
  return 'toa';
}
