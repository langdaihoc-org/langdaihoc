import { useMutation } from '@tanstack/react-query';
import { adminApi, authApi, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';
import { ImageUploader, uploadAdminImage } from '@/components/ui/image-uploader';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toast';

export function AdminProfilePage() {
  const { user, refetch, setSessionUser } = useAuth();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  useEffect(() => {
    if (!user || editing) return;
    setFullName(user.fullName ?? '');
    setPhone(user.phone ?? '');
    setAvatarUrl(user.avatarUrl ?? null);
  }, [user?.id, user?.fullName, user?.phone, user?.avatarUrl, editing]);

  const saveProfile = useMutation({
    mutationFn: () =>
      authApi.updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        avatarUrl,
      }),
    onSuccess: async (res) => {
      if (res.user) setSessionUser(res.user);
      await refetch();
      setEditing(false);
      toast(res.message ?? 'Đã lưu hồ sơ', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không lưu được', 'error'),
  });

  const changePwd = useMutation({
    mutationFn: () => authApi.changePassword(pwd),
    onSuccess: (res) => {
      setPwd({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast(res.message ?? 'Đổi mật khẩu thành công', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không đổi được mật khẩu', 'error'),
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="font-bold">Hồ sơ quản trị của tôi</h1>
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">Thông tin cá nhân</p>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Sửa</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => {
              setFullName(user?.fullName ?? '');
              setPhone(user?.phone ?? '');
              setAvatarUrl(user?.avatarUrl ?? null);
              setEditing(false);
            }}>Hủy</Button>
          )}
        </div>
        {!editing ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--color-line)] bg-orange-50 text-xl font-semibold text-brand-orange">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  (user?.fullName?.trim()?.charAt(0) || 'A').toUpperCase()
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <p><span className="text-[var(--color-muted)]">Họ tên:</span> {user?.fullName || '—'}</p>
                <p><span className="text-[var(--color-muted)]">Email:</span> {user?.email || '—'}</p>
              </div>
            </div>
            <p><span className="text-[var(--color-muted)]">SĐT:</span> {user?.phone || '—'}</p>
            <p><span className="text-[var(--color-muted)]">Vai trò:</span> Quản trị</p>
          </div>
        ) : (
          <>
            <ImageUploader
              label="Ảnh đại diện"
              value={avatarUrl}
              onChange={setAvatarUrl}
              onUpload={(file) => uploadAdminImage(adminApi.uploadImage, file, 'post-images')}
            />
            <Input label="Họ tên" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input label="Email" value={user?.email ?? ''} disabled />
            <Input label="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button loading={saveProfile.isPending} disabled={fullName.trim().length < 2} onClick={() => saveProfile.mutate()}>
              Lưu thay đổi
            </Button>
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="font-semibold">Đổi mật khẩu</p>
        <Input label="Mật khẩu hiện tại" type="password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />
        <Input label="Mật khẩu mới" type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
        <Input label="Nhập lại mật khẩu mới" type="password" value={pwd.confirmPassword} onChange={(e) => setPwd({ ...pwd, confirmPassword: e.target.value })} />
        <Button
          loading={changePwd.isPending}
          disabled={
            !pwd.currentPassword ||
            pwd.newPassword.length < 8 ||
            pwd.newPassword !== pwd.confirmPassword
          }
          onClick={() => changePwd.mutate()}
        >
          Đổi mật khẩu
        </Button>
      </Card>
    </div>
  );
}
