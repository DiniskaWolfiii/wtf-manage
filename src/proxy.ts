import { auth } from '@/auth';
import { assertSameOrigin, getExpectedAppOrigin } from '@/lib/csrf';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Enforce strict same-origin CSRF validation on all mutating API requests
  // (Auth.js routes under /api/auth/* are excluded via matcher and use Auth.js CSRF;
  // /api/auth/logout enforces assertSameOrigin directly.)
  if (pathname.startsWith('/api/')) {
    const csrfRejection = assertSameOrigin(req);
    if (csrfRejection) {
      return csrfRejection;
    }
    return;
  }

  // Allow static assets, login page, and favicon
  if (
    pathname.startsWith('/_next') ||
    pathname === '/login' ||
    pathname === '/favicon.ico'
  ) {
    return;
  }

  // Strict Gate: redirect unauthenticated users to /login using the canonical app origin
  if (!req.auth) {
    const baseOrigin = getExpectedAppOrigin(req.nextUrl.origin);
    const signInUrl = new URL('/login', baseOrigin);
    const targetPath = pathname === '/' ? '/profile' : pathname;
    signInUrl.searchParams.set('callbackUrl', targetPath);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|api/health).*)'],
};
