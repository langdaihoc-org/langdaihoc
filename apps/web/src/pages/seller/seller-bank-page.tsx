import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sellerApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useSellerShop } from './seller-shared';

export function SellerBankPage() {
  const qc = useQueryClient();
  const { data: shopData } = useSellerShop();
  const approved = shopData?.data?.status === 'approved';
  const { data } = useQuery({ queryKey: ['seller-bank'], queryFn: () => sellerApi.bankAccounts() });
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [deleteAcc, setDeleteAcc] = useState<{ id: string; label: string } | null>(null);
  const accounts = data?.data ?? [];

  const addMut = useMutation({
    mutationFn: () => sellerApi.addBankAccount({ bankName, accountNumber, accountHolder, isDefault: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-bank'] });
      setBankName('');
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
          <div>
            <p className="font-semibold">{a.bankName}</p>
            <p className="text-sm">{a.accountNumber} · {a.accountHolder}</p>
            {a.isDefault && <StatusBadge variant="green">Mặc định</StatusBadge>}
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
        <Input label="Ngân hàng" value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={!approved} />
        <Input label="Số tài khoản" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} disabled={!approved} />
        <Input label="Chủ tài khoản" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} disabled={!approved} />
        <Button onClick={() => addMut.mutate()} loading={addMut.isPending} disabled={!approved}>Lưu tài khoản</Button>
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
