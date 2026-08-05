import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { buyerApi, authApi, type Address } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { useEffect, useState } from 'react';
import { DORM_HANDOFF_POINTS, normalizeDormHandoff } from '@/lib/dorm-handoff';
import { cn } from '@/lib/utils';
import { formatAddressLine } from '@/components/marketplace/address-picker';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function ProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAuthenticated, logout, refetch } = useAuth();
  const { toast } = useToast();
  const { data: addrData } = useQuery({ queryKey: ['addresses'], queryFn: () => buyerApi.addresses(), enabled: isAuthenticated });
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [emailPassword, setEmailPassword] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [newPwdForm, setNewPwdForm] = useState({ newPassword: '', confirmPassword: '' });
  const [deleteAddrId, setDeleteAddrId] = useState<string | null>(null);
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addrForm, setAddrForm] = useState({
    recipientName: '',
    phone: '',
    detail: '',
    dormName: '',
    roomNumber: 'toa' as string,
    isDefault: false,
  });

  useEffect(() => {
    if (!user || editingProfile) return;
    setFullName(user.fullName ?? '');
    setPhone(user.phone ?? '');
    setEmail(user.email ?? '');
  }, [user?.id, user?.fullName, user?.phone, user?.email, editingProfile]);

  const resetProfileDraft = () => {
    setFullName(user?.fullName ?? '');
    setPhone(user?.phone ?? '');
    setEmail(user?.email ?? '');
    setEmailPassword('');
    setProfileMsg('');
    setEditingProfile(false);
  };

  const emailChanged =
    email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase();
  // Payload cũ không có trường này — mặc định coi như có mật khẩu.
  const hasPassword = user?.hasPassword !== false;

  const profileMut = useMutation({
    mutationFn: () =>
      buyerApi.updateProfile({
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || null,
        email: email.trim().toLowerCase() || undefined,
        ...(emailChanged ? { currentPassword: emailPassword } : {}),
      }),
    onSuccess: (res) => {
      // refetch() của auth-context đã kéo lại /me — không cần invalidate thêm
      refetch();
      setEditingProfile(false);
      setEmailPassword('');
      setProfileMsg(res.message ?? 'Đã lưu hồ sơ');
      toast(res.message ?? 'Đã cập nhật thông tin cá nhân', 'success');
    },
    onError: (e) => setProfileMsg(e instanceof Error ? e.message : 'Không lưu được'),
  });

  const pwdMut = useMutation({
    mutationFn: () => authApi.changePassword(pwdForm),
    onSuccess: (res) => {
      setPwdMsg(res.message);
      setPwdError('');
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast('Đổi mật khẩu thành công', 'success');
    },
    onError: (e) => {
      setPwdMsg('');
      setPwdError(e instanceof Error ? e.message : 'Không đổi được mật khẩu');
    },
  });

  const setPwdMut = useMutation({
    mutationFn: () => authApi.setPassword(newPwdForm),
    onSuccess: (res) => {
      setPwdMsg(res.message);
      setPwdError('');
      setNewPwdForm({ newPassword: '', confirmPassword: '' });
      refetch();
      toast('Đã tạo mật khẩu', 'success');
    },
    onError: (e) => {
      setPwdMsg('');
      setPwdError(e instanceof Error ? e.message : 'Không tạo được mật khẩu');
    },
  });

  const addAddrMut = useMutation({
    mutationFn: () => {
      const dormName = addrForm.dormName.trim();
      const payload = {
        ...addrForm,
        dormName: dormName || undefined,
        roomNumber: dormName ? (normalizeDormHandoff(addrForm.roomNumber) || 'toa') : undefined,
        addressType: dormName ? 'dorm' as const : 'other' as const,
      };
      return editingId ? buyerApi.updateAddress(editingId, payload) : buyerApi.addAddress(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      setShowAddrForm(false);
      setEditingId(null);
      setAddrForm({ recipientName: '', phone: '', detail: '', dormName: '', roomNumber: 'toa', isDefault: false });
    },
  });
  const deleteAddrMut = useMutation({
    mutationFn: (id: string) => buyerApi.deleteAddress(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      setDeleteAddrId(null);
    },
  });

  if (!isAuthenticated) {
    return (
      <Card className="mx-auto max-w-lg py-12 text-center">
        <p className="text-[var(--color-muted)]">Đăng nhập để xem tài khoản</p>
        <Link to="/auth/login"><Button className="mt-4">Đăng nhập</Button></Link>
      </Card>
    );
  }

  const addresses = addrData?.data ?? [];

  const startEdit = (a: Address) => {
    setEditingId(a.id);
    setAddrForm({
      recipientName: a.recipientName,
      phone: a.phone,
      detail: a.detail,
      dormName: a.dormName ?? '',
      roomNumber: normalizeDormHandoff(a.roomNumber) || 'toa',
      isDefault: a.isDefault ?? false,
    });
    setShowAddrForm(true);
  };

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-bold">Thông tin cá nhân</p>
          {!editingProfile ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFullName(user?.fullName ?? '');
                setPhone(user?.phone ?? '');
                setEmail(user?.email ?? '');
                setProfileMsg('');
                setEditingProfile(true);
              }}
            >
              Sửa
            </Button>
          ) : null}
        </div>

        {editingProfile ? (
          <>
            <Input label="Họ tên" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input
              label="Số điện thoại"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567 — dùng để đăng nhập"
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
            />
            {emailChanged && hasPassword && (
              <Input
                label="Mật khẩu hiện tại (để đổi email)"
                type="password"
                autoComplete="current-password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
              />
            )}
            {emailChanged && !hasPassword && (
              <p className="text-xs text-red-600">
                Tài khoản Google chưa có mật khẩu. Hãy tạo mật khẩu ở mục Bảo mật tài khoản
                trước khi đổi email.
              </p>
            )}
            <p className="text-xs text-[var(--color-muted)]">
              Đổi email sẽ dùng email mới để đăng nhập
              {user?.emailVerified ? '' : ' · email hiện tại chưa xác minh'}.
            </p>
            {profileMsg && <p className="text-xs text-red-600">{profileMsg}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={profileMut.isPending}
                onClick={() => profileMut.mutate()}
                disabled={
                  !fullName.trim() ||
                  !email.trim() ||
                  (emailChanged && (!hasPassword || !emailPassword))
                }
              >
                Lưu
              </Button>
              <Button size="sm" variant="outline" disabled={profileMut.isPending} onClick={resetProfileDraft}>
                Hủy
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <div className="rounded-xl border border-[var(--color-line)] px-3 py-2.5">
                <p className="text-xs text-[var(--color-muted)]">Họ tên</p>
                <p className="font-medium">{user?.fullName || '—'}</p>
              </div>
              <div className="rounded-xl border border-[var(--color-line)] px-3 py-2.5">
                <p className="text-xs text-[var(--color-muted)]">Số điện thoại</p>
                <p className="font-medium">{user?.phone || 'Chưa cập nhật'}</p>
              </div>
              <div className="rounded-xl border border-[var(--color-line)] px-3 py-2.5">
                <p className="text-xs text-[var(--color-muted)]">Email</p>
                <p className="font-medium">{user?.email || '—'}</p>
              </div>
            </div>
            {profileMsg && <p className="text-xs text-[var(--color-muted)]">{profileMsg}</p>}
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="font-bold">Bảo mật tài khoản</p>
        {hasPassword ? (
          <>
            <Input
              label="Mật khẩu hiện tại"
              type="password"
              autoComplete="current-password"
              value={pwdForm.currentPassword}
              onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
            />
            <Input
              label="Mật khẩu mới"
              type="password"
              autoComplete="new-password"
              value={pwdForm.newPassword}
              onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
            />
            <Input
              label="Xác nhận mật khẩu mới"
              type="password"
              autoComplete="new-password"
              value={pwdForm.confirmPassword}
              onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
            />
            {pwdError && <p className="text-sm text-red-600">{pwdError}</p>}
            {pwdMsg && <p className="text-sm text-brand-green-dark">{pwdMsg}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                disabled={!pwdForm.currentPassword || !pwdForm.newPassword || !pwdForm.confirmPassword}
                loading={pwdMut.isPending}
                onClick={() => pwdMut.mutate()}
              >
                Đổi mật khẩu
              </Button>
              <Link to="/auth/forgot-password" className="text-sm font-medium text-brand-orange-dark underline">
                Quên mật khẩu? Khôi phục qua email
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--color-muted)]">
              Bạn đang đăng nhập bằng Google nên tài khoản chưa có mật khẩu. Tạo mật khẩu để
              đăng nhập được bằng email khi cần.
            </p>
            <Input
              label="Mật khẩu mới"
              type="password"
              autoComplete="new-password"
              value={newPwdForm.newPassword}
              onChange={(e) => setNewPwdForm({ ...newPwdForm, newPassword: e.target.value })}
            />
            <Input
              label="Xác nhận mật khẩu mới"
              type="password"
              autoComplete="new-password"
              value={newPwdForm.confirmPassword}
              onChange={(e) => setNewPwdForm({ ...newPwdForm, confirmPassword: e.target.value })}
            />
            {pwdError && <p className="text-sm text-red-600">{pwdError}</p>}
            {pwdMsg && <p className="text-sm text-brand-green-dark">{pwdMsg}</p>}
            <Button
              size="sm"
              disabled={!newPwdForm.newPassword || !newPwdForm.confirmPassword}
              loading={setPwdMut.isPending}
              onClick={() => setPwdMut.mutate()}
            >
              Tạo mật khẩu
            </Button>
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-bold">Địa chỉ giao hàng</p>
          <Button size="sm" variant="green" onClick={() => { setEditingId(null); setShowAddrForm(true); }}>+ Thêm</Button>
        </div>
        {showAddrForm && (
          <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-3">
            <Input label="Người nhận" value={addrForm.recipientName} onChange={(e) => setAddrForm({ ...addrForm, recipientName: e.target.value })} />
            <Input label="SĐT" type="tel" inputMode="tel" autoComplete="tel" value={addrForm.phone} onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })} />
            <Input
              label="Địa chỉ chi tiết"
              value={addrForm.detail}
              onChange={(e) => setAddrForm({ ...addrForm, detail: e.target.value })}
              placeholder="Khu / đường..."
            />
            <Input
              label="KTX / Tòa"
              value={addrForm.dormName}
              onChange={(e) => {
                const dormName = e.target.value;
                setAddrForm({
                  ...addrForm,
                  dormName,
                  roomNumber: dormName.trim() ? addrForm.roomNumber || 'toa' : '',
                });
              }}
              placeholder="KTX B, KTX A..."
            />
            {addrForm.dormName.trim() ? (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">Điểm giao</label>
                <div className="grid grid-cols-2 gap-2">
                  {DORM_HANDOFF_POINTS.map((p) => {
                    const active = addrForm.roomNumber === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setAddrForm({ ...addrForm, roomNumber: p.value })}
                        className={cn(
                          'rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'border-brand-orange-dark bg-sky-50 text-brand-orange-dark'
                            : 'border-[var(--color-line)] hover:border-brand-orange/40',
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={addrForm.isDefault} onChange={(e) => setAddrForm({ ...addrForm, isDefault: e.target.checked })} />
              Đặt làm mặc định
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addAddrMut.mutate()} loading={addAddrMut.isPending}>{editingId ? 'Cập nhật' : 'Thêm'}</Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddrForm(false)}>Hủy</Button>
            </div>
          </div>
        )}
        {addresses.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Chưa có địa chỉ. Thêm địa chỉ để đặt hàng.</p>
        ) : addresses.map((a) => (
          <div key={a.id} className="flex justify-between gap-2 rounded-xl bg-[var(--color-surface)] p-3 text-sm">
            <div>
              <p className="font-semibold">{a.recipientName} · {a.phone}</p>
              <p className="text-[var(--color-muted)]">{formatAddressLine(a)}</p>
              {a.isDefault && <StatusBadge variant="green">Mặc định</StatusBadge>}
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <Button size="sm" variant="outline" onClick={() => startEdit(a)}>Sửa</Button>
              <Button size="sm" variant="danger" onClick={() => setDeleteAddrId(a.id)}>Xóa</Button>
            </div>
          </div>
        ))}
      </Card>

      <ConfirmDialog
        open={Boolean(deleteAddrId)}
        title="Xóa địa chỉ này?"
        description="Không hoàn tác được. Bạn có thể thêm lại sau."
        confirmLabel="Xóa"
        cancelLabel="Giữ lại"
        variant="danger"
        loading={deleteAddrMut.isPending}
        onCancel={() => setDeleteAddrId(null)}
        onConfirm={() => deleteAddrId && deleteAddrMut.mutate(deleteAddrId)}
      />

      <Button variant="outline" className="w-full" onClick={() => void logout().then(() => navigate('/auth/login', { replace: true }))}>Đăng xuất</Button>
    </div>
  );
}
