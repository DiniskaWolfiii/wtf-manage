import { NextResponse } from 'next/server';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseOrigin(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Returns the canonical public origin of the portal, preferring AUTH_URL / NEXT_PUBLIC_APP_URL
 * over request-derived headers to prevent Host / X-Forwarded-Host spoofing.
 */
export function getExpectedAppOrigin(fallbackRequestUrl?: string): string {
  const configured = parseOrigin(process.env.AUTH_URL) ?? parseOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (configured) {
    return configured;
  }
  const fallback = parseOrigin(fallbackRequestUrl);
  if (fallback) {
    return fallback;
  }
  throw new Error('[Security] Unable to determine application origin (configure AUTH_URL)');
}

function getAllowedOrigins(requestUrl?: string): Set<string> {
  const allowed = new Set<string>();
  const authOrigin = parseOrigin(process.env.AUTH_URL);
  const publicOrigin = parseOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (authOrigin) allowed.add(authOrigin);
  if (publicOrigin) allowed.add(publicOrigin);

  // In local development, also accept the request's own origin (e.g. http://localhost:3000)
  // even when .env.local points NEXT_PUBLIC_APP_URL elsewhere.
  // In production, fail closed if neither AUTH_URL nor NEXT_PUBLIC_APP_URL is configured.
  if (process.env.NODE_ENV !== 'production') {
    const reqOrigin = parseOrigin(requestUrl);
    if (reqOrigin) allowed.add(reqOrigin);
  } else if (allowed.size === 0) {
    console.error(
      '[Security] Neither AUTH_URL nor NEXT_PUBLIC_APP_URL is configured in production; blocking mutating request.'
    );
  }

  return allowed;
}

/**
 * Enforces same-origin CSRF protection for mutating HTTP requests (POST/PUT/PATCH/DELETE).
 * Defends against cross-origin and same-site subdomain attacks (e.g. *.winterfur.org).
 * Returns a 403 NextResponse if the request fails validation, or `null` if allowed.
 */
export function assertSameOrigin(request: Request): NextResponse | null {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const allowedOrigins = getAllowedOrigins(request.url);
  const originHeader = request.headers.get('origin');

  if (originHeader !== null) {
    const normalizedOrigin = parseOrigin(originHeader);
    if (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }
    return null;
  }

  // Fallback when Origin header is omitted: require Sec-Fetch-Site=same-origin or matching Referer
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin') {
    return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 });
  }

  const refererHeader = request.headers.get('referer');
  if (refererHeader) {
    const refererOrigin = parseOrigin(refererHeader);
    if (refererOrigin && allowedOrigins.has(refererOrigin)) {
      return null;
    }
    return NextResponse.json({ error: 'Invalid request referer' }, { status: 403 });
  }

  if (secFetchSite === 'same-origin') {
    return null;
  }

  return NextResponse.json({ error: 'Missing origin header' }, { status: 403 });
}
