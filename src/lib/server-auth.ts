import { headers } from 'next/headers';
import { getToken, type JWT } from 'next-auth/jwt';
import { getOrRefreshKeycloakToken } from '@/auth';

const ABSOLUTE_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000;

async function getServerToken(): Promise<JWT | null> {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return null;
  }

  const reqHeaders = await headers();
  const cookieHeader = reqHeaders.get('cookie') || '';
  const secureCookie =
    (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '').startsWith('https://') ||
    /(?:^|;\s*)__Secure-authjs\.session-token(?:\.\d+)?=/.test(cookieHeader);

  const token = await getToken({
    req: { headers: reqHeaders },
    secret,
    secureCookie,
  });

  if (!token) {
    return null;
  }

  if (
    typeof token.loginAt !== 'number' ||
    !Number.isFinite(token.loginAt) ||
    Date.now() - token.loginAt > ABSOLUTE_SESSION_MAX_AGE_MS
  ) {
    return null;
  }

  if (typeof token.expiresAt === 'number' && Date.now() >= token.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    if (typeof token.refreshToken !== 'string' || !token.refreshToken) {
      return null;
    }
    const refreshed = await getOrRefreshKeycloakToken(token.refreshToken);
    if (!refreshed) {
      return null;
    }
    return {
      ...token,
      accessToken: refreshed.accessToken,
      idToken: refreshed.idToken ?? token.idToken,
      refreshToken: refreshed.refreshToken ?? token.refreshToken,
      expiresAt: refreshed.expiresAt,
    };
  }

  return token;
}

/**
 * Retrieve the user's Keycloak access token on the server from the encrypted Auth.js JWT cookie
 * without exposing it in the client-accessible session object.
 */
export async function getServerAccessToken(): Promise<string | undefined> {
  const token = await getServerToken();
  return typeof token?.accessToken === 'string' ? token.accessToken : undefined;
}

/**
 * Retrieve the user's Keycloak ID token on the server for federated OIDC logout.
 */
export async function getServerIdToken(): Promise<string | undefined> {
  const token = await getServerToken();
  return typeof token?.idToken === 'string' ? token.idToken : undefined;
}
