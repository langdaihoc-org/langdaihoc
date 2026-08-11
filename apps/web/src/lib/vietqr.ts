/** Ngân hàng phổ biến — seller lướt chọn, map thẳng mã VietQR. */
export const VIETQR_BANK_OPTIONS = [
  { id: 'MOMO', label: 'MoMo', logoFile: 'momo' },
  { id: 'MB', label: 'MB Bank', logoFile: 'MB' },
  { id: 'TCB', label: 'Techcombank', logoFile: 'TCB' },
  { id: 'VCB', label: 'Vietcombank', logoFile: 'VCB' },
  { id: 'VPB', label: 'VPBank', logoFile: 'VPB' },
  { id: 'ACB', label: 'ACB', logoFile: 'ACB' },
  { id: 'BIDV', label: 'BIDV', logoFile: 'BIDV' },
  { id: 'VIB', label: 'VIB', logoFile: 'VIB' },
  { id: 'TPB', label: 'TPBank', logoFile: 'TPB' },
  { id: 'MSB', label: 'MSB', logoFile: 'MSB' },
  { id: 'OCB', label: 'OCB', logoFile: 'OCB' },
  { id: 'SHB', label: 'SHB', logoFile: 'SHB' },
  { id: 'STB', label: 'Sacombank', logoFile: 'STB' },
  { id: 'VBA', label: 'Agribank', logoFile: 'VBA' },
  { id: 'HDB', label: 'HDBank', logoFile: 'HDB' },
  { id: 'SEAB', label: 'SeABank', logoFile: 'SEAB' },
  { id: 'LPB', label: 'LPBank', logoFile: 'LPB' },
  { id: 'EIB', label: 'Eximbank', logoFile: 'EIB' },
  { id: 'CAKE', label: 'CAKE', logoFile: 'CAKE' },
  { id: 'TIMO', label: 'Timo', logoFile: 'TIMO' },
] as const;

/** Map tên ngân hàng seller nhập tay → mã VietQR (BIN / short name). */
const BANK_ALIASES: { id: string; aliases: string[] }[] = [
  { id: 'TCB', aliases: ['techcombank', 'techcom bank', 'techcom', 'tcb', 'ky thuong'] },
  { id: 'VCB', aliases: ['vietcombank', 'vietcom bank', 'vietcom', 'vcb', 'ngoai thuong'] },
  { id: 'MB', aliases: ['mbbank', 'mb bank', 'quan doi', 'military bank'] },
  { id: 'VPB', aliases: ['vpbank', 'vp bank', 'vpb'] },
  { id: 'ACB', aliases: ['acb', 'a chau', 'asia commercial'] },
  { id: 'BIDV', aliases: ['bidv', 'dau tu phat trien'] },
  { id: 'VIB', aliases: ['vib'] },
  { id: 'TPB', aliases: ['tpbank', 'tp bank', 'tpb', 'tien phong'] },
  { id: 'MSB', aliases: ['msb', 'hang hai'] },
  { id: 'OCB', aliases: ['ocb'] },
  { id: 'SHB', aliases: ['shb'] },
  { id: 'STB', aliases: ['sacombank', 'sai gon thuong tin', 'stb'] },
  { id: 'VBA', aliases: ['agribank', 'agri bank', 'nong nghiep'] },
  { id: 'HDB', aliases: ['hdbank', 'hd bank', 'hdb'] },
  { id: 'SEAB', aliases: ['seabank', 'sea bank'] },
  { id: 'LPB', aliases: ['lienviet', 'lien viet', 'lpb', 'lvb'] },
  { id: 'PGB', aliases: ['pgbank', 'pg bank'] },
  { id: 'NAB', aliases: ['namabank', 'nam a bank', 'nama'] },
  { id: 'BAB', aliases: ['bacabank', 'bac a bank'] },
  { id: 'PVCB', aliases: ['pvcombank', 'pvcb'] },
  { id: 'EIB', aliases: ['eximbank', 'exim bank', 'eib'] },
  { id: 'SCB', aliases: ['scb'] },
  { id: 'IVB', aliases: ['indovina'] },
  { id: 'CAKE', aliases: ['cake'] },
  { id: 'TIMO', aliases: ['timo'] },
  { id: 'MOMO', aliases: ['momo', 'ví momo', 'vi momo'] },
  { id: 'MB', aliases: ['mb'] },
];

function normalizeBankText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function aliasMatches(normalizedName: string, alias: string): boolean {
  const a = normalizeBankText(alias);
  if (!a) return false;
  if (normalizedName === a) return true;

  const tokens = normalizedName.split(/\s+/).filter(Boolean);
  const compactName = normalizedName.replace(/\s+/g, '');
  const compactAlias = a.replace(/\s+/g, '');

  if (compactAlias.length <= 3) {
    return tokens.includes(compactAlias) || compactName === compactAlias;
  }

  return normalizedName.includes(a) || compactName.includes(compactAlias);
}

export function resolveVietQrBankId(bankName: string): string | null {
  const raw = bankName.trim();
  if (!raw) return null;

  const byOption = VIETQR_BANK_OPTIONS.find(
    (b) => b.id.toLowerCase() === raw.toLowerCase() || normalizeBankText(b.label) === normalizeBankText(raw),
  );
  if (byOption) return byOption.id;

  const n = normalizeBankText(raw);
  const ranked = BANK_ALIASES.flatMap((bank) =>
    bank.aliases.map((alias) => ({ id: bank.id, alias, len: alias.replace(/\s+/g, '').length })),
  ).sort((a, b) => b.len - a.len);

  for (const row of ranked) {
    if (aliasMatches(n, row.alias)) return row.id;
  }

  if (/^momo$/i.test(raw)) return 'MOMO';
  if (/^[a-z0-9]{2,8}$/i.test(raw)) return raw.toUpperCase();
  return null;
}

/** Logo từ CDN VietQR — ẩn nếu load lỗi. */
export function bankLogoUrl(bankIdOrName: string): string | null {
  const raw = bankIdOrName.trim();
  if (!raw) return null;
  const opt = VIETQR_BANK_OPTIONS.find(
    (b) => b.id.toLowerCase() === raw.toLowerCase() || normalizeBankText(b.label) === normalizeBankText(raw),
  );
  if (opt) return `https://cdn.vietqr.io/img/${opt.logoFile}.png`;
  const id = resolveVietQrBankId(raw);
  if (!id) return null;
  const file = id === 'MOMO' ? 'momo' : id;
  return `https://cdn.vietqr.io/img/${file}.png`;
}

/** Nội dung CK = 3 số đuôi SĐT (fallback: 3 ký tự cuối mã đơn). */
export function transferMemoLast3(phone?: string | null, orderCode?: string | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length >= 3) return digits.slice(-3);
  const codeDigits = String(orderCode ?? '').replace(/\D/g, '');
  if (codeDigits.length >= 3) return codeDigits.slice(-3);
  const code = String(orderCode ?? '').replace(/[^a-zA-Z0-9]/g, '');
  return code.slice(-3).toUpperCase() || '000';
}

/** @deprecated dùng transferMemoLast3 */
export function vietQrTransferInfo(orderCode: string) {
  return transferMemoLast3(null, orderCode);
}

export function buildVietQrImageUrl(opts: {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number | string;
  addInfo: string;
  template?: 'compact' | 'compact2' | 'qr_only';
}): string | null {
  const bankId = resolveVietQrBankId(opts.bankName);
  const accountNo = opts.accountNumber.replace(/\s+/g, '');
  if (!bankId || !accountNo) return null;
  const amount = Math.max(0, Math.round(Number(opts.amount) || 0));
  const params = new URLSearchParams();
  if (amount > 0) params.set('amount', String(amount));
  const info = String(opts.addInfo ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
  if (info) params.set('addInfo', info);
  if (opts.accountHolder.trim()) params.set('accountName', opts.accountHolder.trim());
  const template = opts.template ?? 'compact';
  return `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-${template}.png?${params.toString()}`;
}
