import { Suspense, lazy, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/auth-context';
import { ToastProvider } from '@/components/ui/toast';
import { ProtectedRoute, GuestOnlyRoute, BuyerOnlyLayout } from '@/components/layout/buyer-layout';
import { HomePage, ProfilePage } from '@/pages/home-page';
import { LoginPage, CheckEmailPage, VerifyEmailPage } from '@/pages/auth/login-page';
import { BuyerRegisterPage } from '@/pages/auth/register-buyer-page';
import { SellerRegisterPage } from '@/pages/auth/register-seller-page';
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/auth/password-pages';
import { FoodPage, LaundryPage, CartPage } from '@/pages/buyer/food-cart-pages';
import { StorePage } from '@/pages/buyer/store-page';
import {
  OrdersPage,
  OrderDetailPage,
  CheckoutPage,
  LaundryBookPage,
} from '@/pages/buyer/orders-pages';
import { ShipProxyPage, ShipProxyBookPage } from '@/pages/buyer/ship-proxy-pages';
import { ExplorePage } from '@/pages/buyer/explore-page';
import { PostDetailPage } from '@/pages/buyer/post-detail-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { ApiError } from '@/lib/api';
import { ErrorBoundary } from '@/components/ui/error-boundary';

/** Lazy-load khu seller/admin — giảm bundle trang buyer. */
function lazyNamed<T extends Record<string, ComponentType>>(
  loader: () => Promise<T>,
  name: keyof T & string,
) {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[name] as ComponentType };
  });
}

const SellerLayout = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerLayout');
const SellerDashboard = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerDashboard');
const SellerProfilePage = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerProfilePage');
const SellerOrdersPage = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerOrdersPage');
const SellerProductsPage = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerProductsPage');
const SellerMenuPage = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerMenuPage');
const SellerLaundryPage = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerLaundryPage');
const SellerBankPage = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerBankPage');
const SellerReviewsPage = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerReviewsPage');
const SellerComplaintsPage = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerComplaintsPage');
const SellerPostsPage = lazyNamed(() => import('@/pages/seller/seller-pages'), 'SellerPostsPage');

const AdminLayout = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminLayout');
const AdminDashboard = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminDashboard');
const AdminSellersPage = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminSellersPage');
const AdminOrdersPage = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminOrdersPage');
const AdminComplaintsPage = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminComplaintsPage');
const AdminBannersPage = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminBannersPage');
const AdminPostsPage = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminPostsPage');
const AdminUsersPage = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminUsersPage');
const AdminCategoriesPage = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminCategoriesPage');
const AdminAuditPage = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminAuditPage');
const AdminProfilePage = lazyNamed(() => import('@/pages/admin/admin-pages'), 'AdminProfilePage');

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-orange border-t-transparent" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // Lỗi 4xx (404, 403, ...) retry cũng vô ích — chỉ retry lỗi mạng/5xx
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
        <BrowserRouter>
          <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Buyer zone — seller/admin bị chặn */}
            <Route element={<BuyerOnlyLayout />}>
              <Route index element={<HomePage />} />
              <Route path="explore" element={<ExplorePage />} />
              <Route path="p/:postId" element={<PostDetailPage />} />
              <Route path="food" element={<FoodPage />} />
              <Route path="store/:sellerId" element={<StorePage />} />
              <Route path="laundry" element={<LaundryPage />} />
              <Route path="laundry/book/:serviceId" element={<ProtectedRoute roles={['buyer']}><LaundryBookPage /></ProtectedRoute>} />
              <Route path="ship" element={<ShipProxyPage />} />
              <Route path="ship/book/:sellerId" element={<ProtectedRoute roles={['buyer']}><ShipProxyBookPage /></ProtectedRoute>} />
              <Route path="cart" element={<ProtectedRoute roles={['buyer']}><CartPage /></ProtectedRoute>} />
              <Route path="checkout" element={<ProtectedRoute roles={['buyer']}><CheckoutPage /></ProtectedRoute>} />
              <Route path="orders" element={<ProtectedRoute roles={['buyer']}><OrdersPage /></ProtectedRoute>} />
              <Route path="orders/:id" element={<ProtectedRoute roles={['buyer']}><OrderDetailPage /></ProtectedRoute>} />
              <Route path="profile" element={<ProtectedRoute roles={['buyer']}><ProfilePage /></ProtectedRoute>} />
            </Route>

            <Route path="auth/login" element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
            <Route path="auth/check-email" element={<CheckEmailPage />} />
            <Route path="auth/verify-email" element={<VerifyEmailPage />} />
            <Route path="auth/register/buyer" element={<GuestOnlyRoute><BuyerRegisterPage /></GuestOnlyRoute>} />
            <Route path="auth/register/seller" element={<GuestOnlyRoute><SellerRegisterPage /></GuestOnlyRoute>} />
            <Route path="auth/forgot-password" element={<GuestOnlyRoute><ForgotPasswordPage /></GuestOnlyRoute>} />
            <Route path="auth/reset-password" element={<ResetPasswordPage />} />

            <Route path="seller" element={<ProtectedRoute roles={['seller']}><SellerLayout /></ProtectedRoute>}>
              <Route index element={<SellerDashboard />} />
              <Route path="profile" element={<SellerProfilePage />} />
              <Route path="orders" element={<SellerOrdersPage />} />
              <Route path="products" element={<SellerProductsPage />} />
              <Route path="menu" element={<SellerMenuPage />} />
              <Route path="laundry" element={<SellerLaundryPage />} />
              <Route path="bank" element={<SellerBankPage />} />
              <Route path="posts" element={<SellerPostsPage />} />
              <Route path="reviews" element={<SellerReviewsPage />} />
              <Route path="complaints" element={<SellerComplaintsPage />} />
            </Route>

            <Route path="admin" element={<ProtectedRoute roles={['admin']}><AdminLayout /></ProtectedRoute>}>
              <Route index element={<AdminDashboard />} />
              <Route path="sellers" element={<AdminSellersPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="audit" element={<AdminAuditPage />} />
              <Route path="banners" element={<AdminBannersPage />} />
              <Route path="posts" element={<AdminPostsPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="complaints" element={<AdminComplaintsPage />} />
              <Route path="profile" element={<AdminProfilePage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
