import { auth } from '@/auth';

export default auth((req) => {
  const isAuth = !!req.auth;
  const { pathname } = req.nextUrl;

  // Allow static assets, health check, auth endpoints, login page, and API routes (APIs handle auth internally)
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname === '/login' ||
    pathname === '/favicon.ico'
  ) {
    return;
  }

  // Option A: Strict Gate - redirect unauthenticated users to login (auto-forwards to WinterFur Identity)
  if (!isAuth) {
    const signInUrl = new URL('/login', req.nextUrl.origin);
    const targetPath = pathname === '/' ? '/profile' : pathname;
    signInUrl.searchParams.set('callbackUrl', targetPath);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|api/health).*)'],
};

