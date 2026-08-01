import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Star, UtensilsCrossed, WashingMachine, Bike, ClipboardList,
} from 'lucide-react';
import { catalogApi, buyerApi, ordersApi, authApi, type Address } from '@/lib/api';
import { FoodGridCard } from '@/components/marketplace/store-card';
import { StoreAvatar } from '@/components/marketplace/food-image';
import { HomeHeroSearch } from '@/components/marketplace/home-hero';
import { LaundryCardCompact } from '@/components/marketplace/laundry-card';
import { BannerCarousel } from '@/components/marketplace/banner-carousel';
import { PromoPopup } from '@/components/marketplace/promo-popup';
import { FoodCardSkeleton } from '@/components/ui/skeleton';
import { formatRating, orderStatusLabel, orderTypeLabel, orderDisplayTitle } from '@/lib/format';
import { useAuth } from '@/contexts/auth-context';
import { Card } from '@/components/ui/card';
import { QueryErrorState } from '@/components/ui/query-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { useEffect, useState } from 'react';
import { DORM_HANDOFF_POINTS, normalizeDormHandoff } from '@/lib/dorm-handoff';
import { cn } from '@/lib/utils';
import { formatAddressLine } from '@/components/marketplace/address-picker';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const ACTIVE_ORDER = new Set(['pending', 'accepted', 'preparing', 'delivering', 'picking_up', 'picked_up', 'waiting_price_confirmation', 'washing', 'returning']);
const HIDDEN_ORDER = new Set(['cancelled', 'rejected', 'needs_support']);

export function HomePage() {
  const { isAuthenticated } = useAuth();
  const {
    data: home,
    isLoading: loadingHome,
    isError: errHome,
    refetch: refetchHome,
  } = useQuery({
    queryKey: ['catalog', 'home'],
    queryFn: () => catalogApi.home(),
    staleTime: 60_000,
  });
  const { data: ordersData } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(),
    enabled: isAuthenticated,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const homeData = home?.data;
  const featured = (homeData?.food ?? []).slice(0, 8);
  const topStores = (homeData?.sellers ?? []).slice(0, 4);
  const laundryFeatured = (homeData?.laundry ?? []).slice(0, 6);
  const categories = homeData?.categories ?? [];
  const stripBanners = homeData?.banners ?? [];
  const popupBanners = homeData?.popupBanners ?? [];
  const loadingFood = loadingHome;
  const loadingLaundry = loadingHome;
  const loadingSellers = loadingHome;
  const errFood = errHome;
  const refetchFood = refetchHome;
  const activeOrders = (ordersData?.data ?? []).filter((o) => ACTIVE_ORDER.has(o.status) && !HIDDEN_ORDER.has(o.status)).slice(0, 3);

  return (
    <div className="space-y-6">
      <PromoPopup banners={popupBanners} />
      <HomeHeroSearch />

      <BannerCarousel banners={stripBanners} />

      {isAuthenticated && activeOrders.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ClipboardList className="size-5 text-brand-orange" /> Đơn đang xử lý
            </h2>
            <Link to="/orders" className="text-sm font-medium text-brand-orange">Xem tất cả</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {activeOrders.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`}>
                <Card className="p-3 transition-shadow hover:shadow-[var(--shadow-hover)]">
                  <p className="font-semibold">{orderDisplayTitle(o)}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {o.type === 'food' ? (
                      <span className="inline-flex items-center gap-1"><UtensilsCrossed className="size-3" /> {orderTypeLabel(o.type)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><WashingMachine className="size-3" /> {orderTypeLabel(o.type)}</span>
                    )}
                  </p>
                  <StatusBadge variant={o.type === 'food' ? 'orange' : 'green'}>{orderStatusLabel(o.status, o.type)}</StatusBadge>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section className="grid gap-4 md:grid-cols-3">
        <Link to="/food" className="group">
          <div className="relative h-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-orange to-brand-orange-dark p-6 text-white shadow-md shadow-sky-500/25">
            <div className="relative z-10 flex flex-col gap-2 text-left">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                <UtensilsCrossed className="size-3.5" /> Ăn uống
              </span>
              <h2 className="text-xl font-bold sm:text-2xl">Đặt đồ ăn</h2>
              <p className="max-w-60 text-sm text-white/90">
                Quán quanh Làng ĐH, giao tại tòa hoặc rào.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                Xem quán <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>

        <Link to="/laundry" className="group">
          <div className="relative h-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-green-light to-brand-green p-6 text-white shadow-md shadow-cyan-500/20">
            <div className="relative z-10 flex flex-col gap-2 text-left">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                <WashingMachine className="size-3.5" /> Giặt đồ
              </span>
              <h2 className="text-xl font-bold sm:text-2xl">Đặt lịch giặt</h2>
              <p className="max-w-60 text-sm text-white/90">
                Lấy đồ, giặt sấy và giao lại.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                Xem tiệm <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>

        <Link to="/ship" className="group">
          <div className="relative h-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#5cc8ef] to-[#0b3a6b] p-6 text-white shadow-md shadow-blue-500/25">
            <div className="relative z-10 flex flex-col gap-2 text-left">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                <Bike className="size-3.5" /> Nhận đồ ship hộ
              </span>
              <h2 className="text-xl font-bold sm:text-2xl">Nhận ship hộ</h2>
              <p className="max-w-60 text-sm text-white/90">
                Nhờ lấy hàng và nhận lại tại KTX.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                Đặt nhận hộ <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>
      </section>

      {/* Categories */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Danh mục</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/food?category=${c.slug}`}
              className="shrink-0 rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium transition-colors hover:border-brand-orange hover:text-brand-orange"
            >
              {c.name}
            </Link>
          ))}
          <Link
            to="/laundry"
            className="shrink-0 rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium transition-colors hover:border-brand-green hover:text-brand-green"
          >
            Giặt đồ
          </Link>
        </div>
      </section>

      {/* Featured food */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Món ngon gần bạn</h2>
          <Link to="/food" className="inline-flex items-center gap-1 text-sm font-medium text-brand-orange">
            Xem tất cả <ArrowRight className="size-4" />
          </Link>
        </div>
        {loadingFood ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <FoodCardSkeleton key={i} />)}
          </div>
        ) : errFood ? (
          <QueryErrorState message="Không tải được danh sách món" onRetry={() => refetchFood()} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {featured.map((item, i) => (
              <FoodGridCard key={item.id} item={item} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* Laundry preview */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Dịch vụ giặt — đến lấy & giao lại</h2>
          <Link to="/laundry" className="inline-flex items-center gap-1 text-sm font-medium text-brand-green">
            Xem tất cả <ArrowRight className="size-4" />
          </Link>
        </div>
        {loadingLaundry ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <FoodCardSkeleton key={i} />)}
          </div>
        ) : laundryFeatured.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {laundryFeatured.slice(0, 4).map((s, i) => (
              <LaundryCardCompact key={s.id} service={s} index={i} />
            ))}
          </div>
        ) : (
          <Card className="py-8 text-left text-sm text-[var(--color-muted)]">Chưa có dịch vụ giặt</Card>
        )}
      </section>

      {/* Partners */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Quán nổi bật</h2>
        {loadingSellers ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <FoodCardSkeleton key={i} />
            ))}
          </div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topStores.map((s) => {
            const rating = formatRating(s.rating.average, s.rating.count);
            return (
              <Link key={s.id} to={`/store/${s.id}`}>
                <Card className="flex items-center gap-3 p-3 transition-shadow hover:shadow-[var(--shadow-hover)]">
                  <StoreAvatar name={s.shopName} src={s.avatarUrl} className="size-14 shrink-0 rounded-xl" />
                  <div className="min-w-0">
                    <h3 className="line-clamp-1 font-semibold">{s.shopName}</h3>
                    <p className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                      <Star className="size-3.5 fill-[var(--color-accent-star)] text-[var(--color-accent-star)]" />
                      {rating.text}{s.rating.count > 0 && ` (${s.rating.count})`}
                    </p>
                    {s.businessAddress && <p className="line-clamp-1 text-xs text-[var(--color-muted)]">{s.businessAddress}</p>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
        )}
      </section>
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAuthenticated, logout, refetch } = useAuth();
  const { toast } = useToast();
  const { data: addrData } = useQuery({ queryKey: ['addresses'], queryFn: () => buyerApi.addresses(), enabled: isAuthenticated });
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');
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
    setProfileMsg('');
    setEditingProfile(false);
  };

  const profileMut = useMutation({
    mutationFn: () =>
      buyerApi.updateProfile({
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || null,
        email: email.trim().toLowerCase() || undefined,
      }),
    onSuccess: (res) => {
      // refetch() của auth-context đã kéo lại /me — không cần invalidate thêm
      refetch();
      setEditingProfile(false);
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
                disabled={!fullName.trim() || !email.trim()}
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
