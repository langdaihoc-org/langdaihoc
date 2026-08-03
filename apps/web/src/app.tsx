import { Suspense, lazy, useEffect, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/auth-context';
import { ToastProvider } from '@/components/ui/toast';
import { ProtectedRoute, GuestOnlyRoute, BuyerOnlyLayout } from '@/components/layout/buyer-layout';
import { HomePage } from '@/pages/home-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { ApiError } from '@/lib/api';
import { ErrorBoundary } from '@/components/ui/error-boundary';

/** Lazy-load theo named export — mỗi route một chunk riêng. */
function lazyNamed<T extends Record<string, ComponentType>>(
  loader: () => Promise<T>,
  name: keyof T & string,
) {
  return lazy(async () => {
    const mod = await loader();
    const Comp = mod[name];
    if (!Comp) {
      throw new Error(`Lazy export missing: ${name}`);
    }
    return { default: Comp as ComponentType };
  });
}

const ProfilePage = lazyNamed(() => import('@/pages/profile-page'), 'ProfilePage');

const LoginPage = lazyNamed(() => import('@/pages/auth/login-page'), 'LoginPage');
const CheckEmailPage = lazyNamed(() => import('@/pages/auth/login-page'), 'CheckEmailPage');
const VerifyEmailPage = lazyNamed(() => import('@/pages/auth/login-page'), 'VerifyEmailPage');
const BuyerRegisterPage = lazyNamed(() => import('@/pages/auth/register-buyer-page'), 'BuyerRegisterPage');
const SellerRegisterPage = lazyNamed(() => import('@/pages/auth/register-seller-page'), 'SellerRegisterPage');
const ForgotPasswordPage = lazyNamed(() => import('@/pages/auth/password-pages'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyNamed(() => import('@/pages/auth/password-pages'), 'ResetPasswordPage');

const FoodPage = lazyNamed(() => import('@/pages/buyer/food-page'), 'FoodPage');
const LaundryPage = lazyNamed(() => import('@/pages/buyer/laundry-page'), 'LaundryPage');
const CartPage = lazyNamed(() => import('@/pages/buyer/cart-page'), 'CartPage');
const StorePage = lazyNamed(() => import('@/pages/buyer/store-page'), 'StorePage');
const OrdersPage = lazyNamed(() => import('@/pages/buyer/orders-list-page'), 'OrdersPage');
const OrderDetailPage = lazyNamed(() => import('@/pages/buyer/order-detail-page'), 'OrderDetailPage');
const CheckoutPage = lazyNamed(() => import('@/pages/buyer/checkout-page'), 'CheckoutPage');
const LaundryBookPage = lazyNamed(() => import('@/pages/buyer/laundry-book-page'), 'LaundryBookPage');
const ShipProxyPage = lazyNamed(() => import('@/pages/buyer/ship-proxy-page'), 'ShipProxyPage');
const ShipProxyBookPage = lazyNamed(() => import('@/pages/buyer/ship-proxy-book-page'), 'ShipProxyBookPage');
const ExplorePage = lazyNamed(() => import('@/pages/buyer/explore-page'), 'ExplorePage');
const PostDetailPage = lazyNamed(() => import('@/pages/buyer/post-detail-page'), 'PostDetailPage');

const SellerLayout = lazyNamed(() => import('@/pages/seller/seller-layout'), 'SellerLayout');
const SellerDashboard = lazyNamed(() => import('@/pages/seller/seller-dashboard'), 'SellerDashboard');
const SellerProfilePage = lazyNamed(() => import('@/pages/seller/seller-profile-page'), 'SellerProfilePage');
const SellerOrdersPage = lazyNamed(() => import('@/pages/seller/seller-orders-page'), 'SellerOrdersPage');
const SellerProductsPage = lazyNamed(() => import('@/pages/seller/seller-products-page'), 'SellerProductsPage');
const SellerMenuPage = lazyNamed(() => import('@/pages/seller/seller-products-page'), 'SellerMenuPage');
const SellerLaundryPage = lazyNamed(() => import('@/pages/seller/seller-products-page'), 'SellerLaundryPage');
const SellerBankPage = lazyNamed(() => import('@/pages/seller/seller-bank-page'), 'SellerBankPage');
const SellerReviewsPage = lazyNamed(() => import('@/pages/seller/seller-reviews-page'), 'SellerReviewsPage');
const SellerComplaintsPage = lazyNamed(() => import('@/pages/seller/seller-complaints-page'), 'SellerComplaintsPage');
const SellerPostsPage = lazyNamed(() => import('@/pages/seller/seller-posts-page'), 'SellerPostsPage');

const AdminLayout = lazyNamed(() => import('@/pages/admin/admin-layout'), 'AdminLayout');
const AdminDashboard = lazyNamed(() => import('@/pages/admin/admin-dashboard'), 'AdminDashboard');
const AdminSellersPage = lazyNamed(() => import('@/pages/admin/admin-sellers-page'), 'AdminSellersPage');
const AdminOrdersPage = lazyNamed(() => import('@/pages/admin/admin-orders-page'), 'AdminOrdersPage');
const AdminComplaintsPage = lazyNamed(() => import('@/pages/admin/admin-complaints-page'), 'AdminComplaintsPage');
const AdminBannersPage = lazyNamed(() => import('@/pages/admin/admin-banners-page'), 'AdminBannersPage');
const AdminPostsPage = lazyNamed(() => import('@/pages/admin/admin-posts-page'), 'AdminPostsPage');
const AdminUsersPage = lazyNamed(() => import('@/pages/admin/admin-users-page'), 'AdminUsersPage');
const AdminCategoriesPage = lazyNamed(() => import('@/pages/admin/admin-categories-page'), 'AdminCategoriesPage');
const AdminAuditPage = lazyNamed(() => import('@/pages/admin/admin-audit-page'), 'AdminAuditPage');
const AdminProfilePage = lazyNamed(() => import('@/pages/admin/admin-profile-page'), 'AdminProfilePage');

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
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  useEffect(() => {
    sessionStorage.removeItem('langdaihoc:chunk-reload');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
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
                  {/* Alias: một số client/email đổi "-" thành "_" */}
                  <Route path="auth/reset_password" element={<ResetPasswordPage />} />

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
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
