import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sellerApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useSellerShop } from './seller-shared';
import { VIETQR_BANK_OPTIONS, bankLogoUrl } from '@/lib/vietqr';
import { cn } from '@/lib/utils';

function BankLogo({ name, className }: { name: string; className?: string }) {
  const src = bankLogoUrl(name);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className={cn('size-7 shrink-0 rounded-md object-contain bg-white', className)}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}

export function SellerBankPage() {
  const qc = useQueryClient();
  const { data: shopData } = useSellerShop();
  const approved = shopData?.data?.status === 'approved';
  const { data } = useQuery({ queryKey: ['seller-bank'], queryFn: () => sellerApi.bankAccounts() });
  const [bankId, setBankId] = useState<string>(VIETQR_BANK_OPTIONS[0].id);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [deleteAcc, setDeleteAcc] = useState<{ id: string; label: string } | null>(null);
  const accounts = data?.data ?? [];
  const selectedBank = VIETQR_BANK_OPTIONS.find((b) => b.id === bankId) ?? VIETQR_BANK_OPTIONS[0];
  const isMomo = selectedBank.id === 'MOMO';

  const addMut = useMutation({
    mutationFn: () =>
      sellerApi.addBankAccount({
        bankName: selectedBank.label,
        accountNumber,
        accountHolder,
        isDefault: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-bank'] });
      setAccountNumber('');
      setAccountHolder('');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { isDefault?: boolean } }) =>
      sellerApi.updateBankAccount(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-bank'] }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => sellerApi.deleteBankAccount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-bank'] });
      setDeleteAcc(null);
    },
  });

  return (
    <div className="space-y-3 max-w-lg">
      <h1 className="font-bold">Tài khoản thanh toán</h1>
      {accounts.map((a) => (
        <Card key={a.id} className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <BankLogo name={a.bankName} className="mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold">{a.bankName}</p>
              <p className="text-sm">{a.accountNumber} · {a.accountHolder}</p>
              {a.isDefault && <StatusBadge variant="green">Mặc định</StatusBadge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!a.isDefault && approved && (
              <Button
                size="sm"
                variant="outline"
                loading={updateMut.isPending}
                onClick={() => updateMut.mutate({ id: a.id, body: { isDefault: true } })}
              >
                Đặt mặc định
              </Button>
            )}
            {approved && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setDeleteAcc({ id: a.id, label: `${a.bankName} · ${a.accountNumber}` })}
              >
                Xóa
              </Button>
            )}
          </div>
        </Card>
      ))}
      <Card className="space-y-3">
        <h2 className="font-semibold">Thêm tài khoản</h2>
        {!approved && <p className="text-sm text-amber-700">Chờ duyệt cửa hàng để thêm tài khoản.</p>}
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700">Ngân hàng / ví</p>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-white [scrollbar-width:thin]">
            {VIETQR_BANK_OPTIONS.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={!approved}
                onClick={() => setBankId(b.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 border-b border-[var(--color-line)] px-3 py-2.5 text-left text-sm last:border-b-0 disabled:opacity-50',
                  bankId === b.id
                    ? 'bg-sky-50 font-semibold text-brand-orange-dark'
                    : 'text-[var(--color-ink)] hover:bg-[var(--color-surface)]',
                )}
              >
                <BankLogo name={b.id} />
                <span className="min-w-0 flex-1">{b.label}</span>
                {bankId === b.id && <span className="text-xs text-brand-orange">Đã chọn</span>}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">Lướt dọc để chọn · đang chọn: {selectedBank.label}</p>
        </div>
        <Input
          label={isMomo ? 'Số điện thoại MoMo' : 'Số tài khoản'}
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          disabled={!approved}
          placeholder={isMomo ? 'VD: 0901234567' : undefined}
        />
        <Input
          label={isMomo ? 'Tên chủ ví MoMo' : 'Chủ tài khoản'}
          value={accountHolder}
          onChange={(e) => setAccountHolder(e.target.value)}
          disabled={!approved}
        />
        <Button
          onClick={() => addMut.mutate()}
          loading={addMut.isPending}
          disabled={!approved || accountNumber.trim().length < 5 || accountHolder.trim().length < 2}
        >
          Lưu tài khoản
        </Button>
      </Card>
      <ConfirmDialog
        open={Boolean(deleteAcc)}
        title="Xóa tài khoản ngân hàng?"
        description={deleteAcc ? `Xóa ${deleteAcc.label}. Không hoàn tác được.` : undefined}
        confirmLabel="Xóa"
        cancelLabel="Giữ lại"
        variant="danger"
        loading={removeMut.isPending}
        onCancel={() => setDeleteAcc(null)}
        onConfirm={() => deleteAcc && removeMut.mutate(deleteAcc.id)}
      />
    </div>
  );
}
