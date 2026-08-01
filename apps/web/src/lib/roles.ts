export const ROLE_HOME: Record<string, string> = {
  buyer: '/',
  seller: '/seller',
  admin: '/admin',
};

export function getRoleHome(role: string) {
  return ROLE_HOME[role] ?? '/auth/login';
}

/** Buyer-facing paths — seller/admin must not access when logged in. */
export function isBuyerPath(pathname: string) {
  if (pathname.startsWith('/auth')) return false;
  if (pathname.startsWith('/seller')) return false;
  if (pathname.startsWith('/admin')) return false;
  return true;
}

export function canAccessPath(role: string, pathname: string) {
  if (pathname.startsWith('/seller')) return role === 'seller';
  if (pathname.startsWith('/admin')) return role === 'admin';
  if (isBuyerPath(pathname)) return role === 'buyer';
  return true;
}
