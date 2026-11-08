import { auth } from '@/auth';

export default auth((req) => {
  const isAuth = !!req.auth;
  const { pathname } = req.nextUrl;

  // Allow static assets, health check, auth endpoints, and API routes (APIs handle auth internally)
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.includes('favicon.ico')
  ) {
    return;
  }

  // Option A: Strict Gate - redirect unauthenticated users to login
  if (!isAuth) {
    const signInUrl = new URL('/api/auth/signin', req.nextUrl.origin);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.href);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|api/health).*)'],
};

