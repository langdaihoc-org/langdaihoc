/** Map tên ngân hàng seller nhập tay → mã VietQR (BIN / short name). */
const BANK_ALIASES: { id: string; aliases: string[] }[] = [
  { id: 'MB', aliases: ['mb', 'mbbank', 'mb bank', 'ngan hang quan doi', 'quân đội'] },
  { id: 'TCB', aliases: ['tcb', 'techcombank', 'techcom', 'kỹ thương'] },
  { id: 'VCB', aliases: ['vcb', 'vietcombank', 'vietcom', 'ngoại thương'] },
  { id: 'VPB', aliases: ['vpb', 'vpbank', 'vp bank'] },
  { id: 'ACB', aliases: ['acb', 'a chau', 'á châu'] },
  { id: 'BIDV', aliases: ['bidv', 'dau tu phat trien'] },
  { id: 'VIB', aliases: ['vib'] },
  { id: 'TPB', aliases: ['tpb', 'tpbank', 'tien phong'] },
  { id: 'MSB', aliases: ['msb', 'hang hai'] },
  { id: 'OCB', aliases: ['ocb'] },
  { id: 'SHB', aliases: ['shb'] },
  { id: 'STB', aliases: ['stb', 'sacombank', 'sai gon thuong tin'] },
  { id: 'VBA', aliases: ['agribank', 'agri', 'nong nghiep'] },
  { id: 'HDB', aliases: ['hdb', 'hdbank', 'hd bank'] },
  { id: 'SEAB', aliases: ['seabank', 'sea bank', 'dong a'] },
  { id: 'LPB', aliases: ['lpb', 'lienviet', 'liên việt', 'lvb'] },
  { id: 'PGB', aliases: ['pgbank', 'pg bank'] },
  { id: 'NAB', aliases: ['namabank', 'nam a'] },
  { id: 'BAB', aliases: ['bacabank', 'bac a'] },
  { id: 'PVCB', aliases: ['pvcb', 'pvcombank'] },
  { id: 'EIB', aliases: ['eximbank', 'exim'] },
  { id: 'SCB', aliases: ['scb'] },
  { id: 'IVB', aliases: ['indovina'] },
  { id: 'CAKE', aliases: ['cake'] },
  { id: 'TIMO', aliases: ['timo'] },
];

function normalizeBankText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function resolveVietQrBankId(bankName: string): string | null {
  const n = normalizeBankText(bankName);
  if (!n) return null;
  for (const bank of BANK_ALIASES) {
    if (bank.aliases.some((a) => n === a || n.includes(a) || a.includes(n))) return bank.id;
  }
  // Nếu seller nhập sẵn mã ngắn (MB, TCB…)
  if (/^[a-z0-9]{2,8}$/i.test(bankName.trim())) return bankName.trim().toUpperCase();
  return null;
}

/** Nội dung CK ngắn, không dấu — phù hợp VietQR. */
export function vietQrTransferInfo(orderCode: string) {
  return orderCode
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
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
  const info = vietQrTransferInfo(opts.addInfo);
  if (info) params.set('addInfo', info);
  if (opts.accountHolder.trim()) params.set('accountName', opts.accountHolder.trim());
  const template = opts.template ?? 'compact';
  return `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-${template}.png?${params.toString()}`;
}
