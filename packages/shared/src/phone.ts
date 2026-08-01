/** Chuẩn hóa SĐT VN về dạng 0xxxxxxxxx để so khớp / lưu DB. */
export function normalizePhoneVN(raw: string): string {
  let p = raw.trim().replace(/[\s.\-()]/g, '');
  if (p.startsWith('+84')) p = `0${p.slice(3)}`;
  else if (p.startsWith('84') && p.length >= 11) p = `0${p.slice(2)}`;
  return p;
}

export function isEmailLike(value: string): boolean {
  return value.trim().includes('@');
}

/** SĐT VN cơ bản: 0 + 9–10 chữ số. */
export function isPhoneLike(value: string): boolean {
  return /^0\d{8,10}$/.test(normalizePhoneVN(value));
}
